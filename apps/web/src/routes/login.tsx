import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { authClient } from '../lib/auth-client.js';
import { metaQuery, sessionQuery } from '../lib/queries.js';

const loginSearch = z.object({
  redirect: z.string().optional(),
  /**
   * Present when an OAuth client sent an unauthenticated visitor here: Better
   * Auth forwards the whole authorization request as query params so it can be
   * replayed once the session exists.
   */
  client_id: z.string().optional(),
});

export const Route = createFileRoute('/login')({
  validateSearch: loginSearch,
  beforeLoad: async ({ context, search }) => {
    const session = await context.queryClient.ensureQueryData(sessionQuery);
    if (!session) return;
    // Already signed in with an authorization waiting: resume it rather than
    // dropping the visitor on the notes grid with no way back.
    if (search.client_id) {
      window.location.href = `/api/auth/mcp/authorize${window.location.search}`;
      return;
    }
    throw redirect({ to: '/' });
  },
  component: LoginPage,
});

type Mode = 'signin' | 'signup' | 'forgot';

function LoginPage() {
  const { t } = useTranslation('auth');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const search = Route.useSearch();
  const { data: meta } = useQuery(metaQuery);

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const finishAuth = async () => {
    // Hard-remove the cached null session; the shell guard's ensureQueryData
    // returns any cached value (even null) without refetching.
    queryClient.removeQueries({ queryKey: sessionQuery.queryKey });
    // An interrupted OAuth authorization resumes by replaying the original
    // request against the authorization endpoint — a full navigation, since
    // what follows is a redirect chain out of the SPA.
    if (search.client_id) {
      window.location.href = `/api/auth/mcp/authorize${window.location.search}`;
      return;
    }
    const target = search.redirect?.startsWith('/') ? search.redirect : '/';
    await navigate({ to: target, replace: true });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      if (mode === 'signin') {
        const { error: err } = await authClient.signIn.email({ email, password });
        if (err) {
          setError(err.status === 401 ? t('errorInvalidCredentials') : t('errorGeneric'));
          return;
        }
        await finishAuth();
      } else if (mode === 'signup') {
        const { error: err } = await authClient.signUp.email({
          email,
          password,
          name: name.trim() || email.split('@')[0] || 'User',
        });
        if (err) {
          // Better Auth's sign-up path reports the longer code; accept both so
          // the friendly message survives either spelling.
          if (err.status === 403) setError(t('errorSignupClosed'));
          else if (
            err.code === 'USER_ALREADY_EXISTS' ||
            err.code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL'
          )
            setError(t('errorEmailExists'));
          else if (err.code === 'PASSWORD_TOO_SHORT' || password.length < 8)
            setError(t('errorWeakPassword'));
          else setError(t('errorGeneric'));
          return;
        }
        await finishAuth();
      } else {
        await authClient.requestPasswordReset({
          email,
          redirectTo: `${window.location.origin}/reset-password`,
        });
        setInfo(t('resetSent'));
      }
    } finally {
      setBusy(false);
    }
  };

  const oauth = async (provider: 'google' | 'github') => {
    // Same resume rule as the password path, except the provider performs the
    // navigation for us, so the authorize URL goes in as the callback.
    const callbackURL = search.client_id
      ? `${window.location.origin}/api/auth/mcp/authorize${window.location.search}`
      : window.location.origin;
    await authClient.signIn.social({ provider, callbackURL });
  };

  const hasOauth = meta?.oauth.google || meta?.oauth.github;

  return (
    <div className="flex min-h-full items-center justify-center bg-surface px-4">
      <div className="w-full max-w-[420px] rounded-2xl border border-(--outline-variant) p-8 sm:p-10">
        <img src="/favicon.svg" alt="" className="mx-auto h-12 w-12" />
        <h1 className="mt-4 text-center font-normal text-2xl text-on-surface">
          {mode === 'signup'
            ? t('signUpTitle')
            : mode === 'forgot'
              ? t('resetPassword')
              : t('signInTitle')}
        </h1>
        <p className="mt-1 text-center text-on-surface-variant text-sm">
          {mode === 'signup' ? t('signUpSubtitle') : t('signInSubtitle')}
        </p>

        <form onSubmit={submit} className="mt-8 flex flex-col gap-4">
          {mode === 'signup' && (
            <Field
              label={t('name')}
              type="text"
              value={name}
              onChange={setName}
              autoComplete="name"
            />
          )}
          <Field
            label={t('email')}
            type="email"
            value={email}
            onChange={setEmail}
            autoComplete="email"
            required
          />
          {mode !== 'forgot' && (
            <Field
              label={t('password')}
              type="password"
              value={password}
              onChange={setPassword}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              required
              minLength={mode === 'signup' ? 8 : undefined}
            />
          )}

          {error && (
            <p role="alert" className="text-red-600 text-sm dark:text-red-400">
              {error}
            </p>
          )}
          {info && <p className="text-on-surface-variant text-sm">{info}</p>}

          <div className="mt-2 flex items-center justify-between">
            {mode === 'signin' && meta?.passwordReset ? (
              <button
                type="button"
                className="rounded font-medium text-primary text-sm hover:underline"
                onClick={() => setMode('forgot')}
              >
                {t('forgotPassword')}
              </button>
            ) : (
              <span />
            )}
            <button
              type="submit"
              disabled={busy}
              className="rounded-full bg-primary px-6 py-2.5 font-medium text-on-primary text-sm transition-opacity disabled:opacity-50"
            >
              {mode === 'signup'
                ? t('signUp')
                : mode === 'forgot'
                  ? t('resetPassword')
                  : t('signIn')}
            </button>
          </div>
        </form>

        {hasOauth && mode !== 'forgot' && (
          <div className="mt-6">
            <div className="flex items-center gap-3 text-on-surface-variant text-xs uppercase">
              <hr className="flex-1 border-(--outline-variant)" />
              {t('or')}
              <hr className="flex-1 border-(--outline-variant)" />
            </div>
            <div className="mt-4 flex flex-col gap-2">
              {meta?.oauth.google && (
                <OauthButton
                  onClick={() => void oauth('google')}
                  label={t('continueWithGoogle')}
                  icon={<GoogleIcon />}
                />
              )}
              {meta?.oauth.github && (
                <OauthButton
                  onClick={() => void oauth('github')}
                  label={t('continueWithGitHub')}
                  icon={<GitHubIcon />}
                />
              )}
            </div>
          </div>
        )}

        {/* A closed instance says so instead of offering a form that 403s.
            Undefined meta (still loading) keeps the usual invitation. */}
        <p className="mt-8 text-center text-on-surface-variant text-sm">
          {mode === 'signup' ? (
            <>
              {t('haveAccount')}{' '}
              <ModeLink onClick={() => setMode('signin')}>{t('signInLink')}</ModeLink>
            </>
          ) : meta?.signupEnabled === false ? (
            t('signupClosed')
          ) : (
            <>
              {t('noAccount')}{' '}
              <ModeLink onClick={() => setMode('signup')}>{t('createAccountLink')}</ModeLink>
            </>
          )}
        </p>
      </div>
    </div>
  );
}

function Field({
  label,
  type,
  value,
  onChange,
  autoComplete,
  required,
  minLength,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-on-surface-variant text-sm">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
        className="h-12 rounded-lg border border-(--outline) bg-transparent px-4 text-on-surface outline-none focus:border-primary focus:ring-1 focus:ring-primary"
      />
    </label>
  );
}

function OauthButton({
  onClick,
  label,
  icon,
}: {
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-11 items-center justify-center gap-3 rounded-full border border-(--outline) font-medium text-on-surface text-sm transition-colors hover:bg-(--surface-hover)"
    >
      <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center">{icon}</span>
      {label}
    </button>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18A10.98 10.98 0 0 0 1 12c0 1.78.43 3.46 1.18 4.94l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 .5C5.37.5 0 5.87 0 12.5c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58 0-.29-.01-1.04-.02-2.05-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.2.09 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.5.99.11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.34-5.47-5.96 0-1.32.47-2.39 1.24-3.23-.12-.31-.54-1.53.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.65.24 2.87.12 3.18.77.84 1.24 1.91 1.24 3.23 0 4.63-2.81 5.65-5.49 5.95.43.37.81 1.1.81 2.22 0 1.6-.01 2.89-.01 3.28 0 .32.22.7.83.58C20.56 22.29 24 17.8 24 12.5 24 5.87 18.63.5 12 .5z" />
    </svg>
  );
}

function ModeLink({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded font-medium text-primary hover:underline"
    >
      {children}
    </button>
  );
}
