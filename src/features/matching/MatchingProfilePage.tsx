"use client";

import Link from "next/link";
import MatchingCardForm from "@/components/matching/MatchingCardForm";
import MatchingErrorPanel from "@/components/matching/MatchingErrorPanel";
import MatchingPreferencesForm from "@/components/matching/MatchingPreferencesForm";
import LoadingView from "@/components/ui/LoadingView";
import { useMatchProfile } from "@/client/hooks/useMatchProfile";

export default function MatchingProfilePage() {
  const profile = useMatchProfile();

  return (
    <main className="app-shell-compact py-4 sm:py-6">
      <header className="app-panel mb-5 p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="app-accent text-lg text-rose-700">
              Ваше пространство
            </p>
            <h1 className="app-page-title mt-1">Профиль для знакомств</h1>
            <p className="app-muted mt-2 max-w-2xl text-sm sm:text-base">
              Публичная карточка и приватные предпочтения хранятся отдельно.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link className="app-btn-secondary" href="/search">
              Открыть ленту
            </Link>
            <Link className="app-btn-secondary" href="/match/inbox">
              Входящие
            </Link>
          </div>
        </div>
      </header>

      <MatchingErrorPanel
        error={profile.error}
        onRetry={() => void profile.refetch()}
      />
      {profile.loading && <LoadingView label="Загружаем профиль…" />}

      {!profile.loading && profile.card && profile.preferences && (
        <div className="grid gap-5">
          <MatchingCardForm
            key={`card-${profile.card.revision}`}
            initial={profile.card.card}
            requiredDataReady={profile.card.requiredDataReady}
            missingRequiredTopics={profile.card.missingRequiredTopics}
            saving={profile.saving}
            onSave={profile.saveCard}
          />
          <MatchingPreferencesForm
            key={`preferences-${profile.preferences.revision}`}
            revision={profile.preferences.revision}
            initial={profile.preferences.preferences}
            saving={profile.saving}
            onSave={profile.savePreferences}
          />
        </div>
      )}
    </main>
  );
}
