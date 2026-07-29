import { Menu } from '@base-ui/react/menu';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { authClient } from '../../lib/auth-client.js';
import { sessionQuery } from '../../lib/queries.js';

export function AccountMenu() {
  const { t } = useTranslation('shell');
  const { data: session } = useQuery(sessionQuery);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const user = session?.user;
  const initial = (user?.name || user?.email || '?').charAt(0).toUpperCase();

  const signOut = async () => {
    await authClient.signOut();
    queryClient.setQueryData(sessionQuery.queryKey, null);
    queryClient.clear();
    await navigate({ to: '/login' });
  };

  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label={t('account')}
        data-tooltip={t('account')}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-primary font-medium text-on-primary text-sm outline-offset-2 focus-visible:outline-2 focus-visible:outline-(--primary)"
      >
        {initial}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner className="z-50" sideOffset={6} align="end">
          <Menu.Popup className="z-50 min-w-64 rounded-lg border border-(--outline-variant) bg-surface py-2 shadow-(--elevation-3)">
            <div className="border-(--outline-variant) border-b px-4 pt-1 pb-3">
              <div className="font-medium text-on-surface text-sm">{user?.name}</div>
              <div className="text-on-surface-variant text-xs">{user?.email}</div>
            </div>
            <Menu.Item
              className="flex cursor-default select-none items-center px-4 py-2.5 text-on-surface text-sm outline-none data-[highlighted]:bg-(--surface-hover)"
              onClick={() => void signOut()}
            >
              {t('signOut')}
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
