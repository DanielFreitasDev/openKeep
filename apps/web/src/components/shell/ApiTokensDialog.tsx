import { Dialog } from '@base-ui/react/dialog';
import type { ApiTokenWithSecret } from '@openkeep/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { enUS, ptBR } from 'date-fns/locale';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTokenMutations } from '../../hooks/use-token-mutations.js';
import { oauthConnectionsQuery, revokeConnectionApi } from '../../lib/oauth-api.js';
import { tokensQuery } from '../../lib/tokens-api.js';
import { useUiStore } from '../../stores/ui.js';
import { Select } from '../Select.js';

const EXPIRY_OPTIONS = [30, 90, 365, 0] as const;

const buttonClass =
  'rounded-full border border-(--outline) px-4 py-2 font-medium text-on-surface text-sm hover:bg-(--surface-hover) disabled:opacity-50';

/** Personal access tokens for MCP / API clients (see docs/MCP.md). */
export function ApiTokensDialog() {
  const { t, i18n } = useTranslation('apiTokens');
  const activeDialog = useUiStore((s) => s.activeDialog);
  const setActiveDialog = useUiStore((s) => s.setActiveDialog);
  const tokens = useQuery({ ...tokensQuery, enabled: activeDialog === 'api-tokens' });
  const { create, revoke } = useTokenMutations();

  const [name, setName] = useState('');
  const [expiresInDays, setExpiresInDays] = useState<number>(90);
  /** Reveal-once: transient state only — never enters the query cache. */
  const [revealed, setRevealed] = useState<ApiTokenWithSecret | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);

  if (activeDialog !== 'api-tokens') return null;

  const dateLocale = i18n.language.startsWith('pt') ? ptBR : enUS;
  const stamp = (iso: string) => format(new Date(iso), 'PP', { locale: dateLocale });

  const close = () => {
    // Drop the secret on close — it is shown exactly once.
    setRevealed(null);
    setCopied(false);
    setConfirmRevokeId(null);
    setActiveDialog(null);
  };

  const submit = () => {
    if (name.trim() === '' || create.isPending) return;
    create.mutate(
      { name: name.trim(), ...(expiresInDays > 0 ? { expiresInDays } : {}) },
      {
        onSuccess: (token) => {
          setRevealed(token);
          setCopied(false);
          setName('');
        },
      },
    );
  };

  return (
    <Dialog.Root open onOpenChange={(o) => !o && close()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-(--scrim)" />
        <Dialog.Popup className="-translate-x-1/2 -translate-y-1/2 fixed top-1/2 left-1/2 z-50 max-h-[85vh] w-[min(92vw,520px)] overflow-y-auto rounded-lg bg-surface p-6 shadow-(--elevation-3)">
          <Dialog.Title className="font-medium text-lg text-on-surface">{t('title')}</Dialog.Title>
          <p className="mt-1 text-on-surface-variant text-xs">{t('hint')}</p>

          {revealed && (
            <section className="mt-4 rounded-lg border border-(--outline) bg-(--surface-hover) p-3">
              <p className="font-medium text-on-surface text-sm">{t('revealTitle')}</p>
              <p className="mt-1 text-on-surface-variant text-xs">{t('revealWarning')}</p>
              <div className="mt-2 flex items-center gap-2">
                <code className="min-w-0 flex-1 break-all rounded bg-surface p-2 font-mono text-on-surface text-xs">
                  {revealed.token}
                </code>
                <button
                  type="button"
                  className={buttonClass}
                  onClick={() => {
                    void navigator.clipboard.writeText(revealed.token).then(() => setCopied(true));
                  }}
                >
                  {copied ? t('copied') : t('copy')}
                </button>
              </div>
            </section>
          )}

          <section className="mt-4">
            <h3 className="font-medium text-on-surface text-sm">{t('createTitle')}</h3>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={name}
                maxLength={100}
                placeholder={t('namePlaceholder')}
                className="min-w-0 flex-1 rounded border border-(--outline) bg-surface px-3 py-2 text-on-surface text-sm outline-none focus:border-primary"
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submit();
                }}
              />
              <Select
                value={String(expiresInDays)}
                options={EXPIRY_OPTIONS.map((days) => ({
                  value: String(days),
                  label: days === 0 ? t('expiryNever') : t('expiryDays', { days }),
                }))}
                label={t('expiryLabel')}
                size="md"
                className="flex-none py-2"
                onChange={(days) => setExpiresInDays(Number(days))}
              />
              <button
                type="button"
                disabled={name.trim() === '' || create.isPending}
                className={buttonClass}
                onClick={submit}
              >
                {t('createButton')}
              </button>
            </div>
          </section>

          <section className="mt-6 border-(--outline-variant) border-t pt-4">
            <h3 className="font-medium text-on-surface text-sm">{t('listTitle')}</h3>
            {tokens.data?.length === 0 && (
              <p className="mt-2 text-on-surface-variant text-sm">{t('empty')}</p>
            )}
            <ul className="mt-2 space-y-2">
              {tokens.data?.map((token) => (
                <li
                  key={token.id}
                  className="flex items-center gap-3 rounded-lg border border-(--outline-variant) p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-on-surface text-sm">{token.name}</p>
                    <p className="font-mono text-on-surface-variant text-xs">
                      {token.tokenPrefix}…
                    </p>
                    <p className="mt-0.5 text-on-surface-variant text-xs">
                      {t('created', { date: stamp(token.createdAt) })}
                      {' · '}
                      {token.lastUsedAt
                        ? t('lastUsed', { date: stamp(token.lastUsedAt) })
                        : t('neverUsed')}
                      {' · '}
                      {token.expiresAt
                        ? t('expires', { date: stamp(token.expiresAt) })
                        : t('noExpiry')}
                    </p>
                  </div>
                  {confirmRevokeId === token.id ? (
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        className="rounded px-3 py-2 font-medium text-red-600 text-sm hover:bg-(--surface-hover) dark:text-red-400"
                        onClick={() => {
                          revoke.mutate(token.id);
                          setConfirmRevokeId(null);
                        }}
                      >
                        {t('revokeConfirm')}
                      </button>
                      <button
                        type="button"
                        className="rounded px-3 py-2 font-medium text-primary text-sm hover:bg-(--surface-hover)"
                        onClick={() => setConfirmRevokeId(null)}
                      >
                        {t('common:cancel')}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="shrink-0 rounded px-3 py-2 font-medium text-on-surface text-sm hover:bg-(--surface-hover)"
                      onClick={() => setConfirmRevokeId(token.id)}
                    >
                      {t('revoke')}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <OAuthConnections open={activeDialog === 'api-tokens'} stamp={stamp} />

          <div className="mt-6 flex justify-end">
            <Dialog.Close className="rounded px-4 py-2 font-medium text-primary text-sm hover:bg-(--surface-hover)">
              {t('common:done')}
            </Dialog.Close>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * OAuth connectors live beside the tokens because they are the same thing to a
 * user — something out there holding a key to their notes. Disconnecting drops
 * the grant and every token issued under it, server-side.
 */
function OAuthConnections({ open, stamp }: { open: boolean; stamp: (iso: string) => string }) {
  const { t } = useTranslation('oauth');
  const queryClient = useQueryClient();
  const connections = useQuery({ ...oauthConnectionsQuery, enabled: open });
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const revoke = useMutation({
    mutationFn: revokeConnectionApi,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: oauthConnectionsQuery.queryKey }),
  });

  // Nothing connected and nothing pending: stay out of the way entirely.
  if (!connections.data || connections.data.length === 0) return null;

  return (
    <section className="mt-6 border-(--outline-variant) border-t pt-4">
      <h3 className="font-medium text-on-surface text-sm">{t('connectionsTitle')}</h3>
      <p className="mt-1 text-on-surface-variant text-xs">{t('connectionsDescription')}</p>
      <ul className="mt-2 space-y-2">
        {connections.data.map((conn) => (
          <li
            key={conn.clientId}
            className="flex items-center gap-3 rounded-lg border border-(--outline-variant) p-3"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-on-surface text-sm">{conn.name}</p>
              <p className="mt-0.5 truncate text-on-surface-variant text-xs">
                {conn.redirectHosts.join(', ')}
                {conn.redirectHosts.length > 0 && ' · '}
                {t('connectedOn', { date: stamp(conn.grantedAt) })}
              </p>
            </div>
            {confirmId === conn.clientId ? (
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  className="rounded px-3 py-2 font-medium text-red-600 text-sm hover:bg-(--surface-hover) dark:text-red-400"
                  onClick={() => {
                    revoke.mutate(conn.clientId);
                    setConfirmId(null);
                  }}
                >
                  {t('disconnect')}
                </button>
                <button
                  type="button"
                  className="rounded px-3 py-2 font-medium text-primary text-sm hover:bg-(--surface-hover)"
                  onClick={() => setConfirmId(null)}
                >
                  {t('common:cancel')}
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="shrink-0 rounded px-3 py-2 font-medium text-on-surface text-sm hover:bg-(--surface-hover)"
                onClick={() => setConfirmId(conn.clientId)}
              >
                {t('disconnect')}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
