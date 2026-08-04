import { useQuery } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { oauthClientQuery } from '../lib/oauth-api.js';
import { sessionQuery } from '../lib/queries.js';

const consentSearch = z.object({
  consent_code: z.string().optional(),
  client_id: z.string().optional(),
  scope: z.string().optional(),
});

export const Route = createFileRoute('/oauth/consent')({
  validateSearch: consentSearch,
  beforeLoad: async ({ context, location }) => {
    const session = await context.queryClient.ensureQueryData(sessionQuery);
    // Better Auth only reaches this page with a session, but a bookmarked or
    // resumed URL can arrive without one.
    if (!session) {
      throw redirect({ to: '/login', search: { redirect: location.href } });
    }
  },
  component: ConsentPage,
});

function ConsentPage() {
  const { t } = useTranslation('oauth');
  const search = Route.useSearch();
  const { data: session } = useQuery(sessionQuery);
  const clientId = search.client_id;
  const { data: client, isError } = useQuery({
    ...oauthClientQuery(clientId ?? ''),
    enabled: Boolean(clientId),
  });

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!search.consent_code || !clientId || isError) {
    return <Centered>{t('invalidRequest')}</Centered>;
  }

  const decide = async (accept: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/oauth2/consent', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ accept, consent_code: search.consent_code }),
      });
      const body = (await res.json()) as { redirectURI?: string };
      if (!res.ok || !body.redirectURI) {
        setError(t('error'));
        return;
      }
      // Leaving the SPA for the client's callback — a router navigation would
      // keep us inside the app.
      window.location.href = body.redirectURI;
    } catch {
      setError(t('error'));
    } finally {
      setBusy(false);
    }
  };

  const appName = client?.name || clientId;

  return (
    <div className="flex min-h-full items-center justify-center bg-surface px-4 py-10">
      <div className="w-full max-w-[480px] rounded-2xl border border-(--outline-variant) p-8">
        <img src="/favicon.svg" alt="" className="mx-auto h-12 w-12" />
        <h1 className="mt-4 text-center font-normal text-2xl text-on-surface">
          {t('consentTitle', { app: appName })}
        </h1>
        <p className="mt-1 text-center text-on-surface-variant text-sm">
          {t('consentSubtitle', { app: appName })}
        </p>
        {session?.user.email && (
          <p className="mt-1 text-center text-on-surface-variant text-xs">
            {t('signedInAs', { email: session.user.email })}
          </p>
        )}

        {/* Anyone can register a client, so the name above is a claim. Say so
            plainly and show the callback host, which is the part an attacker
            cannot fake. */}
        <div className="mt-6 rounded-lg border border-(--outline-variant) bg-(--surface-hover) p-4">
          <p className="font-medium text-on-surface text-sm">{t('unverifiedTitle')}</p>
          <p className="mt-1 text-on-surface-variant text-sm">{t('unverifiedBody')}</p>
          {client && client.redirectHosts.length > 0 && (
            <p className="mt-2 text-on-surface-variant text-sm">
              {t('redirectHosts')}{' '}
              {client.redirectHosts.map((host) => (
                <code key={host} className="mr-1 font-mono text-on-surface">
                  {host}
                </code>
              ))}
            </p>
          )}
        </div>

        <p className="mt-6 font-medium text-on-surface text-sm">{t('grantsTitle')}</p>
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-on-surface-variant text-sm">
          <li>{t('grantRead')}</li>
          <li>{t('grantWrite')}</li>
          <li>{t('grantSettings')}</li>
        </ul>
        <p className="mt-3 text-on-surface-variant text-xs">{t('protectedNotesSafe')}</p>

        {error && (
          <p role="alert" className="mt-4 text-red-600 text-sm dark:text-red-400">
            {error}
          </p>
        )}

        <div className="mt-8 flex items-center justify-end gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => void decide(false)}
            className="rounded-full px-6 py-2.5 font-medium text-on-surface text-sm hover:bg-(--surface-hover) disabled:opacity-50"
          >
            {t('deny')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void decide(true)}
            className="rounded-full bg-primary px-6 py-2.5 font-medium text-on-primary text-sm transition-opacity disabled:opacity-50"
          >
            {t('allow')}
          </button>
        </div>
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full items-center justify-center bg-surface px-4">
      <p className="max-w-[420px] text-center text-on-surface-variant text-sm">{children}</p>
    </div>
  );
}
