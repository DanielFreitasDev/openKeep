import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { authClient } from '../lib/auth-client.js';
import { metaQuery, sessionQuery } from '../lib/queries.js';

const loginSearch = z.object({
  redirect: z.string().optional(),
});

export const Route = createFileRoute('/login')({
  validateSearch: loginSearch,
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(sessionQuery);
    if (session) throw redirect({ to: '/' });
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
    await queryClient.invalidateQueries({ queryKey: sessionQuery.queryKey });
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
          if (err.code === 'USER_ALREADY_EXISTS') setError(t('errorEmailExists'));
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
    await authClient.signIn.social({ provider, callbackURL: window.location.origin });
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
                <OauthButton onClick={() => void oauth('google')} label={t('continueWithGoogle')} />
              )}
              {meta?.oauth.github && (
                <OauthButton onClick={() => void oauth('github')} label={t('continueWithGitHub')} />
              )}
            </div>
          </div>
        )}

        <p className="mt-8 text-center text-on-surface-variant text-sm">
          {mode === 'signup' ? (
            <>
              {t('haveAccount')}{' '}
              <ModeLink onClick={() => setMode('signin')}>{t('signInLink')}</ModeLink>
            </>
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

function OauthButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-11 rounded-full border border-(--outline) font-medium text-on-surface text-sm transition-colors hover:bg-(--surface-hover)"
    >
      {label}
    </button>
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
