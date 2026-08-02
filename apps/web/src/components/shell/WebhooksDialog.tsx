import { Dialog } from '@base-ui/react/dialog';
import type { Webhook, WebhookEvent, WebhookTestResult } from '@openkeep/shared';
import { WEBHOOK_EVENTS } from '@openkeep/shared';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { enUS, ptBR } from 'date-fns/locale';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useWebhookMutations } from '../../hooks/use-webhook-mutations.js';
import { webhooksQuery } from '../../lib/webhooks-api.js';
import { useUiStore } from '../../stores/ui.js';

const buttonClass =
  'rounded-full border border-(--outline) px-4 py-2 font-medium text-on-surface text-sm hover:bg-(--surface-hover) disabled:opacity-50';
const linkButtonClass =
  'rounded px-2 py-1 font-medium text-primary text-xs hover:bg-(--surface-hover) disabled:opacity-50';

/** Outgoing webhooks: signed POSTs to n8n, Home Assistant and friends. */
export function WebhooksDialog() {
  const { t, i18n } = useTranslation('webhooks');
  const activeDialog = useUiStore((s) => s.activeDialog);
  const setActiveDialog = useUiStore((s) => s.setActiveDialog);
  const webhooks = useQuery({ ...webhooksQuery, enabled: activeDialog === 'webhooks' });
  const { create, update, remove, test } = useWebhookMutations();

  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<WebhookEvent[]>(['note.created', 'note.updated']);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, WebhookTestResult>>({});

  if (activeDialog !== 'webhooks') return null;

  const dateLocale = i18n.language.startsWith('pt') ? ptBR : enUS;
  const stamp = (iso: string) => format(new Date(iso), 'PPp', { locale: dateLocale });

  const close = () => {
    setRevealed(null);
    setConfirmDeleteId(null);
    setResults({});
    setActiveDialog(null);
  };

  const submit = () => {
    if (url.trim() === '' || events.length === 0 || create.isPending) return;
    create.mutate(
      { url: url.trim(), events },
      {
        onSuccess: (created) => {
          setUrl('');
          // Straight to the secret: a webhook nobody can verify is half-built.
          setRevealed(created.id);
        },
      },
    );
  };

  const toggleNewEvent = (event: WebhookEvent) => {
    setEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event],
    );
  };

  const toggleEvent = (webhook: Webhook, event: WebhookEvent) => {
    const next = webhook.events.includes(event)
      ? webhook.events.filter((e) => e !== event)
      : [...webhook.events, event];
    // At least one event, or the endpoint would be subscribed to nothing.
    if (next.length === 0) return;
    update.mutate({ id: webhook.id, events: next });
  };

  const statusLine = (webhook: Webhook) => {
    if (!webhook.lastDeliveryAt) return t('neverDelivered');
    const when = stamp(webhook.lastDeliveryAt);
    return webhook.lastError
      ? t('lastFailed', { date: when, error: webhook.lastError })
      : t('lastOk', { date: when, status: webhook.lastStatus ?? 200 });
  };

  return (
    <Dialog.Root open onOpenChange={(o) => !o && close()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-(--scrim)" />
        <Dialog.Popup className="-translate-x-1/2 -translate-y-1/2 fixed top-1/2 left-1/2 z-50 max-h-[85vh] w-[min(92vw,620px)] overflow-y-auto rounded-lg bg-surface p-6 shadow-(--elevation-3)">
          <Dialog.Title className="font-medium text-lg text-on-surface">{t('title')}</Dialog.Title>
          <p className="mt-1 text-on-surface-variant text-xs">{t('hint')}</p>

          <section className="mt-4">
            <h3 className="font-medium text-on-surface text-sm">{t('createTitle')}</h3>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                type="url"
                value={url}
                maxLength={2000}
                placeholder={t('urlPlaceholder')}
                aria-label={t('urlLabel')}
                className="min-w-0 flex-1 rounded border border-(--outline) bg-surface px-3 py-2 text-on-surface text-sm outline-none focus:border-primary"
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submit();
                }}
              />
              <button
                type="button"
                disabled={url.trim() === '' || events.length === 0 || create.isPending}
                className={buttonClass}
                onClick={submit}
              >
                {t('createButton')}
              </button>
            </div>
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              {WEBHOOK_EVENTS.map((event) => (
                <li key={event}>
                  <label className="flex items-center gap-1.5 text-on-surface text-xs">
                    <input
                      type="checkbox"
                      checked={events.includes(event)}
                      onChange={() => toggleNewEvent(event)}
                    />
                    {t(`events.${event}`)}
                  </label>
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-6 border-(--outline-variant) border-t pt-4">
            <h3 className="font-medium text-on-surface text-sm">{t('listTitle')}</h3>
            {webhooks.data?.length === 0 && (
              <p className="mt-2 text-on-surface-variant text-sm">{t('empty')}</p>
            )}
            <ul className="mt-2 space-y-3">
              {webhooks.data?.map((webhook) => (
                <li
                  key={webhook.id}
                  className="rounded-lg border border-(--outline-variant) p-3"
                  data-testid="webhook-row"
                >
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-on-surface text-sm">{webhook.url}</p>
                      <p className="mt-0.5 text-on-surface-variant text-xs">
                        {statusLine(webhook)}
                      </p>
                    </div>
                    <label className="flex shrink-0 items-center gap-1.5 text-on-surface text-xs">
                      <input
                        type="checkbox"
                        checked={webhook.enabled}
                        onChange={() =>
                          update.mutate({ id: webhook.id, enabled: !webhook.enabled })
                        }
                      />
                      {t('enabled')}
                    </label>
                  </div>

                  <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                    {WEBHOOK_EVENTS.map((event) => (
                      <li key={event}>
                        <label className="flex items-center gap-1.5 text-on-surface text-xs">
                          <input
                            type="checkbox"
                            checked={webhook.events.includes(event)}
                            onChange={() => toggleEvent(webhook, event)}
                          />
                          {t(`events.${event}`)}
                        </label>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {revealed === webhook.id ? (
                      <code className="min-w-0 flex-1 break-all rounded bg-(--surface-hover) p-2 font-mono text-on-surface text-xs">
                        {webhook.secret}
                      </code>
                    ) : (
                      <span className="flex-1 text-on-surface-variant text-xs">
                        {t('secretHidden')}
                      </span>
                    )}
                    <button
                      type="button"
                      className={linkButtonClass}
                      onClick={() => setRevealed(revealed === webhook.id ? null : webhook.id)}
                    >
                      {revealed === webhook.id ? t('hideSecret') : t('showSecret')}
                    </button>
                    <button
                      type="button"
                      className={linkButtonClass}
                      onClick={() => void navigator.clipboard.writeText(webhook.secret)}
                    >
                      {t('copySecret')}
                    </button>
                    <button
                      type="button"
                      className={linkButtonClass}
                      onClick={() => update.mutate({ id: webhook.id, rotateSecret: true })}
                    >
                      {t('rotateSecret')}
                    </button>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={test.isPending}
                      className={linkButtonClass}
                      onClick={() =>
                        test.mutate(webhook.id, {
                          onSuccess: (result) =>
                            setResults((prev) => ({ ...prev, [webhook.id]: result })),
                        })
                      }
                    >
                      {t('sendTest')}
                    </button>
                    {results[webhook.id] && (
                      <span
                        className={`text-xs ${
                          results[webhook.id]?.ok
                            ? 'text-on-surface-variant'
                            : 'text-red-600 dark:text-red-400'
                        }`}
                        data-testid="webhook-test-result"
                      >
                        {results[webhook.id]?.ok
                          ? t('testOk', { status: results[webhook.id]?.status ?? 200 })
                          : t('testFailed', { error: results[webhook.id]?.error ?? '' })}
                      </span>
                    )}
                    <span className="flex-1" />
                    {confirmDeleteId === webhook.id ? (
                      <>
                        <button
                          type="button"
                          className="rounded px-2 py-1 font-medium text-red-600 text-xs hover:bg-(--surface-hover) dark:text-red-400"
                          onClick={() => {
                            remove.mutate(webhook.id);
                            setConfirmDeleteId(null);
                          }}
                        >
                          {t('deleteConfirm')}
                        </button>
                        <button
                          type="button"
                          className={linkButtonClass}
                          onClick={() => setConfirmDeleteId(null)}
                        >
                          {t('common:cancel')}
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="rounded px-2 py-1 font-medium text-on-surface text-xs hover:bg-(--surface-hover)"
                        onClick={() => setConfirmDeleteId(webhook.id)}
                      >
                        {t('delete')}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>

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
