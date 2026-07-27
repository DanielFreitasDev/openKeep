import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { authClient } from '../lib/auth-client.js';

const resetSearch = z.object({
  token: z.string().optional(),
});

export const Route = createFileRoute('/reset-password')({
  validateSearch: resetSearch,
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { t } = useTranslation('auth');
  const { token } = Route.useSearch();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!token) {
      setError(t('errorGeneric'));
      return;
    }
    const { error: err } = await authClient.resetPassword({ newPassword: password, token });
    if (err) {
      setError(t('errorGeneric'));
      return;
    }
    await navigate({ to: '/login' });
  };

  return (
    <div className="flex min-h-full items-center justify-center bg-surface px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-[420px] rounded-2xl border border-(--outline-variant) p-8"
      >
        <h1 className="text-center text-2xl text-on-surface">{t('resetPassword')}</h1>
        <label className="mt-6 flex flex-col gap-1">
          <span className="text-on-surface-variant text-sm">{t('password')}</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
            minLength={8}
            className="h-12 rounded-lg border border-(--outline) bg-transparent px-4 text-on-surface outline-none focus:border-primary"
          />
        </label>
        {error && (
          <p role="alert" className="mt-3 text-red-600 text-sm dark:text-red-400">
            {error}
          </p>
        )}
        <button
          type="submit"
          className="mt-6 w-full rounded-full bg-primary py-2.5 font-medium text-on-primary text-sm"
        >
          {t('resetPassword')}
        </button>
      </form>
    </div>
  );
}
