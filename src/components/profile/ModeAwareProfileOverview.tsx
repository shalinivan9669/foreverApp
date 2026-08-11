'use client';

import Image from 'next/image';
import Link from 'next/link';
import type {
  FactorProfileStatus,
  FactorSemanticCardDTO,
  ProfileSummaryDTO,
} from '@/client/api/types';

type ProfileSummaryProps = {
  summary: ProfileSummaryDTO;
};

const fallbackAvatar = 'https://cdn.discordapp.com/embed/avatars/0.png';

const statusClasses: Record<FactorProfileStatus, string> = {
  AVAILABLE: 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-200',
  MISSING: 'bg-slate-500/10 text-slate-700 dark:text-slate-200',
  UNKNOWN: 'bg-amber-500/10 text-amber-800 dark:text-amber-200',
  INSUFFICIENT: 'bg-violet-500/10 text-violet-800 dark:text-violet-200',
};

const formatDate = (value: string | null): string => {
  if (!value) return 'Дата не указана';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Дата не указана';
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
};

function ProfileIdentity({ summary }: ProfileSummaryProps) {
  const displayName = summary.user.name || summary.user.handle || 'Профиль';

  return (
    <section className="app-panel app-panel-solid p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <Image
            src={summary.user.avatarUrl ?? fallbackAvatar}
            alt={displayName}
            width={64}
            height={64}
            className="shrink-0 rounded-full ring-1 ring-white/80"
          />
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold">{displayName}</h1>
            {summary.user.handle && (
              <div className="app-muted truncate text-sm">@{summary.user.handle}</div>
            )}
            <div className="app-muted mt-1 text-xs">Личный профиль · виден только вам</div>
          </div>
        </div>
        <Link href="/profile/settings" className="app-btn-secondary px-4 py-2 text-center text-sm">
          Настройки
        </Link>
      </div>
    </section>
  );
}

function FactorCard({ card }: { card: FactorSemanticCardDTO }) {
  return (
    <article
      className="app-panel app-panel-solid flex h-full flex-col p-4"
      data-factor-key={card.factorKey}
      data-factor-status={card.status}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="app-muted text-xs">
            {card.domain.title} · {card.dimension.title}
          </div>
          <h3 className="mt-1 text-base font-semibold">{card.title}</h3>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${statusClasses[card.status]}`}
        >
          {card.statusLabel}
        </span>
      </div>

      <p className="app-muted mt-3 text-sm">{card.description}</p>

      <dl className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
        <div className="app-panel-soft app-panel-soft-solid rounded-xl p-3">
          <dt className="app-muted text-xs">Уверенность</dt>
          <dd className="mt-1 font-medium">{card.confidence.label}</dd>
        </div>
        <div className="app-panel-soft app-panel-soft-solid rounded-xl p-3">
          <dt className="app-muted text-xs">Свежесть</dt>
          <dd className="mt-1 font-medium">{card.freshness.label}</dd>
          {card.freshness.calculatedAt && (
            <dd className="app-muted mt-1 text-xs">
              Расчёт: {formatDate(card.freshness.calculatedAt)}
            </dd>
          )}
        </div>
      </dl>

      <p className="mt-4 border-t border-black/5 pt-3 text-sm">{card.neutralWording}</p>
    </article>
  );
}

function FactorCards({ summary }: ProfileSummaryProps) {
  const { cards, latestCalculatedAt } = summary.factorProfile;

  return (
    <section className="space-y-3" aria-labelledby="factor-profile-title">
      <div>
        <h2 id="factor-profile-title" className="text-lg font-semibold">
          Личные факторы
        </h2>
        <p className="app-muted mt-1 max-w-3xl text-sm">
          Карточки описывают только ваши данные. Они не являются оценкой личности и не
          содержат значения другого человека.
        </p>
      </div>

      {!latestCalculatedAt && (
        <div className="app-panel-soft app-panel-soft-solid p-4 text-sm">
          Расчётов пока нет. Для каждого фактора ниже явно указан статус отсутствующих
          данных.
        </div>
      )}

      {cards.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {cards.map((card) => (
            <FactorCard key={card.factorKey} card={card} />
          ))}
        </div>
      ) : (
        <div className="app-panel app-panel-solid p-4 text-sm app-muted">
          Определения факторов пока недоступны. Попробуйте открыть профиль позже.
        </div>
      )}
    </section>
  );
}

export default function ModeAwareProfileOverview({ summary }: ProfileSummaryProps) {
  return (
    <div className="app-page-stack">
      <ProfileIdentity summary={summary} />
      <FactorCards summary={summary} />
    </div>
  );
}

function DetailsRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-black/5 py-2 text-sm last:border-b-0">
      <span className="app-muted">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

export function AccountDetailsView({ summary }: ProfileSummaryProps) {
  return (
    <div className="app-page-stack">
      <ProfileIdentity summary={summary} />

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="app-panel app-panel-solid p-4">
          <h2 className="text-lg font-semibold">Аккаунт</h2>
          <div className="mt-3">
            <DetailsRow label="Идентификатор" value={summary.user.id || 'Не указан'} />
            <DetailsRow label="Дата регистрации" value={formatDate(summary.user.joinedAt)} />
            <DetailsRow
              label="Последняя активность"
              value={formatDate(summary.user.lastActiveAt)}
            />
          </div>
        </div>

        <div className="app-panel app-panel-solid p-4">
          <h2 className="text-lg font-semibold">Источник профиля</h2>
          <p className="app-muted mt-2 text-sm">
            Используются только последние личные снимки факторов текущего аккаунта.
            Сырые ответы и значения другого человека здесь не отображаются.
          </p>
          <DetailsRow
            label="Версия реестра"
            value={String(summary.factorProfile.registryVersion)}
          />
          <DetailsRow
            label="Последний расчёт"
            value={formatDate(summary.factorProfile.latestCalculatedAt)}
          />
        </div>
      </section>

      <FactorCards summary={summary} />
    </div>
  );
}
