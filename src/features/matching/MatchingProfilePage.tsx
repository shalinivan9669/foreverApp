"use client";

import Link from "next/link";
import { useState } from "react";
import MatchingAccessGate from "@/components/matching/MatchingAccessGate";
import MatchingCardForm from "@/components/matching/MatchingCardForm";
import MatchingErrorPanel from "@/components/matching/MatchingErrorPanel";
import MatchingPreferencesForm from "@/components/matching/MatchingPreferencesForm";
import LoadingView from "@/components/ui/LoadingView";
import { useMatchProfile } from "@/client/hooks/useMatchProfile";

export default function MatchingProfilePage() {
  return <MatchingAccessGate><MatchingProfilePageContent /></MatchingAccessGate>;
}

function MatchingProfilePageContent() {
  const profile = useMatchProfile();
  const [cardSaved, setCardSaved] = useState(false);
  const searchReady = Boolean(profile.card?.card?.active && profile.card.requiredDataReady);
  const readyToPublish = Boolean(profile.card?.requiredDataReady && !profile.card.card?.active);
  const plansSaved = Boolean(profile.card?.card?.actual.relationshipIntent && profile.card.card.actual.childrenIntent);

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
            <Link className="app-btn-secondary" href="/main-menu">
              Главное меню
            </Link>
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
          <section className="app-panel-soft p-4" role="status">
            <h2 className="font-semibold">{searchReady ? "Карточка готова к поиску" : readyToPublish ? "Всё готово — подтвердите публикацию" : plansSaved ? "Карточка сохранена — настройте предпочтения" : cardSaved ? "Карточка сохранена" : "Подготовьте карточку для знакомства"}</h2>
            <p className="app-muted mt-2 text-sm">{searchReady ? "Ваша карточка активна. Откройте поиск, познакомьтесь с карточками людей и решите, кому проявить интерес." : readyToPublish ? "Предпочтения и разрешения сохранены. Включите «Показывать меня в ленте» и нажмите «Сохранить карточку». Публикация произойдёт только после этого действия." : plansSaved ? "Вы уже ответили о своих планах. Следующий шаг — выбрать подходящие варианты партнёра и дать разрешения на использование данных в подборе. Карточка пока не опубликована." : "Сначала заполните и сохраните карточку. Затем настройте предпочтения партнёра и разрешения на подбор. Последний шаг — самостоятельно подтвердить публикацию карточки."}</p>
            {searchReady && <Link className="app-btn-primary mt-3" href="/search">Перейти к поиску партнёра</Link>}
            {!searchReady && plansSaved && !readyToPublish && <a className="app-btn-primary mt-3" href="#preferences-title">Настроить предпочтения для поиска</a>}
            {readyToPublish && <a className="app-btn-primary mt-3" href="#matching-publish">Перейти к публикации</a>}
          </section>
          <MatchingCardForm
            key={`card-${profile.card.revision}`}
            initial={profile.card.card}
            requiredDataReady={profile.card.requiredDataReady}
            missingRequiredTopics={profile.card.missingRequiredTopics}
            saving={profile.saving}
            onSave={async (input) => { const saved = await profile.saveCard(input); if (saved) setCardSaved(true); return saved; }}
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
