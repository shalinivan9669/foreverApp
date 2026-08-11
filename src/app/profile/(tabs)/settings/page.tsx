'use client';

import { useRouter } from 'next/navigation';
import { useCurrentUser } from '@/client/hooks/useCurrentUser';
import PrivacySettingsHub from '@/components/settings/PrivacySettingsHub';
import ErrorView from '@/components/ui/ErrorView';
import LoadingView from '@/components/ui/LoadingView';

export default function ProfileSettingsTab() {
  const router = useRouter();
  const { data: currentUser, loading, error, refetch } = useCurrentUser();

  if (loading && !currentUser) {
    return (
      <main className="app-shell-narrow py-4 sm:py-7">
        <LoadingView label="Загружаем настройки..." />
      </main>
    );
  }

  if (!currentUser) {
    return (
      <main className="app-shell-narrow py-4 sm:py-7">
        <ErrorView
          error={error}
          onRetry={() => void refetch()}
          onAuthRequired={() => router.push('/')}
        />
      </main>
    );
  }

  return <PrivacySettingsHub />;
}
