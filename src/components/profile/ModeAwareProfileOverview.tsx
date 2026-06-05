'use client';

import Image from 'next/image';
import Link from 'next/link';
import type { ProfileSummaryDTO } from '@/client/api/types';
import AxisRadar from '@/components/charts/AxisRadar';
import WeeklyCheckInCard from '@/components/checkins/WeeklyCheckInCard';
import UserActivityCard from '@/components/activities/UserActivityCard';
import UserActivitiesPlaceholder from '@/components/activities/UserActivitiesPlaceholder';
import InsightsList from '@/components/profile/InsightsList';
import PreferencesCard from '@/components/profile/PreferencesCard';
import SummaryTiles from '@/components/profile/SummaryTiles';

type ProfileSummaryProps = {
  summary: ProfileSummaryDTO;
};

const fallbackAvatar = 'https://cdn.discordapp.com/embed/avatars/0.png';

const levelLabels: Record<ProfileSummaryDTO['profileCompletion']['level'], string> = {
  empty: 'Пустой',
  basic: 'Базовый',
  good: 'Хороший',
  strong: 'Сильный',
};

const contributionLevelLabels: Record<
  NonNullable<ProfileSummaryDTO['pairedProfileState']>['contribution']['level'],
  string
> = {
  low: 'низкий',
  stable: 'стабильный',
  strong: 'сильный',
};

const genderLabels: Record<'male' | 'female', string> = {
  male: 'Мужской',
  female: 'Женский',
};

const relationshipStatusLabels: Record<'seeking' | 'in_relationship', string> = {
  seeking: 'В поиске',
  in_relationship: 'В отношениях',
};

const sectionLabels: Record<
  keyof ProfileSummaryDTO['profileCompletion']['sections'],
  string
> = {
  account: 'Аккаунт',
  matchCard: 'Карточка',
  preferences: 'Предпочтения',
  passport: 'Паспорт',
  pairContext: 'Пара',
};

const formatDate = (value?: string): string => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const formatPersonalValue = (value: string | number | null | undefined): string =>
  value === null || value === undefined || value === '' ? '-' : String(value);

const formatPercent = (value: number | undefined): string =>
  typeof value === 'number' && Number.isFinite(value)
    ? `${Math.round(value * 100)}%`
    : '-';

function ProfileNextStepCard({ nextStep }: { nextStep: ProfileSummaryDTO['nextStep'] }) {
  return (
    <section className="app-panel app-panel-solid p-4">
      <div className="app-muted text-xs">Главный следующий шаг</div>
      <h2 className="mt-2 text-lg font-semibold">{nextStep.title}</h2>
      <p className="app-muted mt-2 text-sm">{nextStep.description}</p>
      <Link href={nextStep.href} className="app-btn mt-4 inline-flex px-4 py-2 text-sm">
        {nextStep.ctaLabel}
      </Link>
    </section>
  );
}

function ProfileCompletionPanel({
  completion,
}: {
  completion: ProfileSummaryDTO['profileCompletion'];
}) {
  const sections = Object.entries(completion.sections) as Array<
    [
      keyof ProfileSummaryDTO['profileCompletion']['sections'],
      {
        score: number;
        completed: boolean;
        missing: string[];
        isActive?: boolean;
      },
    ]
  >;

  return (
    <section className="app-panel app-panel-solid p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="app-muted text-xs">Заполненность</div>
          <div className="mt-2 font-display text-3xl font-semibold leading-tight">
            {completion.score}%
          </div>
          <div className="app-muted text-sm">{levelLabels[completion.level]}</div>
        </div>
        <div className="min-w-[140px] flex-1 pt-2 sm:max-w-[220px]">
          <div className="h-2 overflow-hidden rounded-full bg-black/10">
            <div
              className="h-full rounded-full bg-[var(--app-accent,#8b5cf6)]"
              style={{ width: `${completion.score}%` }}
            />
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {sections.map(([key, section]) => (
          <div key={key} className="app-panel-soft app-panel-soft-solid p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{sectionLabels[key]}</span>
              <span className="app-muted">{section.score}%</span>
            </div>
            <div className="app-muted mt-1 text-xs">
              {section.completed
                ? 'Заполнено'
                : section.missing.length
                  ? section.missing.join(', ')
                  : 'Нужно дополнить'}
              {typeof section.isActive === 'boolean'
                ? section.isActive
                  ? ' · активна'
                  : ' · неактивна'
                : ''}
            </div>
          </div>
        ))}
      </div>

      {completion.missing.length > 0 && (
        <div className="mt-4 space-y-2">
          <div className="text-sm font-medium">Что можно улучшить</div>
          <div className="flex flex-wrap gap-2">
            {completion.missing.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                className="app-btn-secondary px-3 py-1.5 text-xs"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function ProfileHero({ summary }: ProfileSummaryProps) {
  const { user, profileMode, profileCompletion, nextStep, relationshipContext } = summary;
  const currentPair = relationshipContext.currentPair;

  return (
    <header className="app-panel app-panel-solid app-reveal p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <Image
          src={user.avatarUrl ?? user.avatar ?? fallbackAvatar}
          alt={user.handle || 'Профиль'}
          width={72}
          height={72}
          className="rounded-full ring-1 ring-white/80"
        />

        <div className="min-w-0 flex-1">
          <div className="font-display truncate text-2xl font-bold leading-tight">
            @{user.handle || user.name || 'user'}
          </div>
          <div className="mt-1 text-base font-semibold">{profileMode.label}</div>
          <p className="app-muted mt-1 max-w-2xl text-sm">{profileMode.description}</p>
          {currentPair && (
            <Link
              href={`/pair/${currentPair.id}`}
              className="mt-2 inline-flex text-sm underline"
            >
              Профиль пары · {currentPair.status === 'paused' ? 'пауза' : 'активна'}
            </Link>
          )}
        </div>

        <div className="flex flex-col items-start gap-2 sm:items-end">
          <div className="app-panel-soft app-panel-soft-solid px-3 py-2 text-sm">
            <span className="app-muted">Заполнено </span>
            <span className="font-semibold">{profileCompletion.score}%</span>
          </div>
          <Link href={nextStep.href} className="app-btn px-4 py-2 text-sm">
            {nextStep.ctaLabel}
          </Link>
        </div>
      </div>
    </header>
  );
}

function ModeContextPanel({ summary }: ProfileSummaryProps) {
  const currentPair = summary.relationshipContext.currentPair;

  if (summary.profileMode.kind === 'paired') {
    return (
      <section className="app-panel app-panel-solid p-4">
        <div className="app-muted text-xs">Статус в продукте</div>
        <h2 className="mt-2 text-lg font-semibold">{summary.profileMode.label}</h2>
        <p className="app-muted mt-2 text-sm">{summary.profileMode.description}</p>
        {currentPair && (
          <div className="mt-3 text-sm">
            Пара с {formatDate(currentPair.since)} · {currentPair.daysTogether ?? 0} дн.
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="app-panel app-panel-solid p-4">
      <div className="app-muted text-xs">Режим профиля</div>
      <h2 className="mt-2 text-lg font-semibold">{summary.profileMode.label}</h2>
      <p className="app-muted mt-2 text-sm">{summary.profileMode.description}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link href="/match-card/create" className="app-btn-secondary px-3 py-1.5 text-xs">
          Карточка знакомства
        </Link>
        <Link href="/questionnaires" className="app-btn-secondary px-3 py-1.5 text-xs">
          Анкеты
        </Link>
        <Link href="/search" className="app-btn-secondary px-3 py-1.5 text-xs">
          Поиск
        </Link>
      </div>
    </section>
  );
}

export default function ModeAwareProfileOverview({ summary }: ProfileSummaryProps) {
  return (
    <div className="space-y-4">
      <ProfileHero summary={summary} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ProfileNextStepCard nextStep={summary.nextStep} />
        </div>
        <ModeContextPanel summary={summary} />
      </div>
      <ProfileCompletionPanel completion={summary.profileCompletion} />
    </div>
  );
}

function PassportAndInsights({ summary }: ProfileSummaryProps) {
  return (
    <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div className="app-panel app-panel-solid p-4">
        <h2 className="mb-3 text-base font-semibold">Паспорт по осям</h2>
        <AxisRadar levels={summary.passport.levelsByAxis} />
      </div>
      <div className="app-panel app-panel-solid p-4">
        <h2 className="mb-3 text-base font-semibold">Инсайты</h2>
        <InsightsList items={summary.insights} />
      </div>
    </section>
  );
}

export function SoloProfileDashboard({ summary }: ProfileSummaryProps) {
  const ff = summary.featureFlags ?? { PERSONAL_ACTIVITIES: false };

  return (
    <div className="space-y-4">
      <SummaryTiles metrics={summary.metrics} readiness={summary.readiness} fatigue={summary.fatigue} />
      <WeeklyCheckInCard pairId={summary.currentPair?.id} />
      <PassportAndInsights summary={summary} />
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Личная активность</h2>
        {ff.PERSONAL_ACTIVITIES ? (
          <UserActivityCard activity={summary.activity.current} suggested={summary.activity.suggested} />
        ) : (
          <UserActivitiesPlaceholder />
        )}
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Предпочтения партнёра</h2>
        <div className="app-panel app-panel-solid p-4">
          <PreferencesCard value={summary.matching.filters} />
        </div>
      </section>
    </div>
  );
}

function MyRelationshipStateCard({
  state,
}: {
  state: NonNullable<ProfileSummaryDTO['pairedProfileState']>;
}) {
  const checkIn = state.myWeeklyCheckIn;
  const metrics = [
    ['Готовность', formatPercent(checkIn.readiness)],
    ['Усталость', formatPercent(checkIn.fatigue)],
    ['Раздражение', formatPercent(checkIn.irritation)],
    ['Близость', formatPercent(checkIn.closeness)],
  ];

  return (
    <section className="app-panel app-panel-solid p-4">
      <div className="app-muted text-xs">Моё состояние сейчас</div>
      <h2 className="mt-2 text-lg font-semibold">{state.resourceMessage.title}</h2>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {metrics.map(([label, value]) => (
          <div key={label} className="app-panel-soft app-panel-soft-solid p-3">
            <div className="app-muted text-xs">{label}</div>
            <div className="font-semibold">{value}</div>
          </div>
        ))}
      </div>
      <p className="app-muted mt-4 text-sm">{state.resourceMessage.description}</p>
      {!checkIn.submitted && (
        <Link href="/profile#weekly-checkin" className="app-btn-secondary mt-4 inline-flex px-3 py-2 text-sm">
          Пройти check-in
        </Link>
      )}
    </section>
  );
}

function MyContributionPanel({
  state,
}: {
  state: NonNullable<ProfileSummaryDTO['pairedProfileState']>;
}) {
  const pendingHref = state.contribution.pendingFromMe.some((item) => item.includes('check-in'))
    ? '/profile#weekly-checkin'
    : state.contribution.pendingFromMe.some((item) => item.includes('feedback'))
      ? '/couple-activity'
      : `/pair/${state.pairId}`;

  return (
    <section className="app-panel app-panel-solid p-4">
      <div className="app-muted text-xs">Мой вклад в пару</div>
      <h2 className="mt-2 text-lg font-semibold">
        {state.contribution.score}% · {contributionLevelLabels[state.contribution.level]}
      </h2>
      <p className="app-muted mt-2 text-sm">{state.contribution.message}</p>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <div className="text-sm font-medium">Сделано</div>
          <div className="app-muted mt-2 space-y-1 text-sm">
            {state.contribution.completedThisWeek.length > 0 ? (
              state.contribution.completedThisWeek.map((item) => <div key={item}>✓ {item}</div>)
            ) : (
              <div>Пока нет отмеченных действий за неделю.</div>
            )}
          </div>
        </div>
        <div>
          <div className="text-sm font-medium">Ждёт меня</div>
          <div className="app-muted mt-2 space-y-1 text-sm">
            {state.contribution.pendingFromMe.length > 0 ? (
              state.contribution.pendingFromMe.map((item) => <div key={item}>! {item}</div>)
            ) : (
              <div>Сейчас нет явных действий, которые ждут именно тебя.</div>
            )}
          </div>
        </div>
      </div>

      <Link href={pendingHref} className="app-btn-secondary mt-4 inline-flex px-3 py-2 text-sm">
        Открыть следующий шаг
      </Link>
    </section>
  );
}

function PairProfileShortcutCard({
  state,
}: {
  state: NonNullable<ProfileSummaryDTO['pairedProfileState']>;
}) {
  return (
    <section className="app-panel app-panel-solid p-4">
      <div className="app-muted text-xs">Пара</div>
      <h2 className="mt-2 text-lg font-semibold">
        {state.myActivityState.hasCurrentActivity
          ? 'Текущая активность пары'
          : 'Профиль пары'}
      </h2>
      <p className="app-muted mt-2 text-sm">
        {state.myActivityState.currentActivityTitle ??
          'Открой профиль пары, чтобы увидеть общий контекст и действия.'}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href={`/pair/${state.pairId}`} className="app-btn-secondary px-3 py-2 text-sm">
          Открыть пару
        </Link>
        <Link href="/couple-activity" className="app-btn-secondary px-3 py-2 text-sm">
          Активность пары
        </Link>
      </div>
    </section>
  );
}

export function PairedProfileDashboard({ summary }: ProfileSummaryProps) {
  const state = summary.pairedProfileState;

  if (!state) {
    return (
      <div className="app-panel app-panel-solid p-4 text-sm app-muted">
        Данных о текущей паре пока нет. Открой профиль пары, чтобы проверить состояние.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <MyRelationshipStateCard state={state} />
        <MyContributionPanel state={state} />
      </div>
      <section id="weekly-checkin">
        <WeeklyCheckInCard pairId={state.pairId} />
      </section>
      <PairProfileShortcutCard state={state} />
      <PassportAndInsights summary={summary} />
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
  const personal = summary.user.personal;
  const currentPair = summary.relationshipContext.currentPair;
  const matchCard = summary.profileCompletion.sections.matchCard;
  const passport = summary.profileCompletion.sections.passport;
  const passportAxesWithData = Math.round((passport.score / 100) * 6);

  return (
    <div className="space-y-4">
      <ProfileHero summary={summary} />

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="app-panel app-panel-solid p-4">
          <h2 className="text-lg font-semibold">Аккаунт</h2>
          <div className="mt-3 flex items-center gap-3">
            <Image
              src={summary.user.avatarUrl ?? summary.user.avatar ?? fallbackAvatar}
              alt={summary.user.handle || 'Профиль'}
              width={56}
              height={56}
              className="rounded-full ring-1 ring-white/80"
            />
            <div className="min-w-0">
              <div className="truncate font-semibold">@{summary.user.handle || 'user'}</div>
              <div className="app-muted truncate text-sm">{summary.user.name || 'Discord account'}</div>
            </div>
          </div>
          <div className="mt-4">
            <DetailsRow label="Дата регистрации" value={formatDate(summary.user.joinedAt)} />
            <DetailsRow label="Последняя активность" value={formatDate(summary.user.lastActiveAt)} />
          </div>
        </div>

        <div className="app-panel app-panel-solid p-4">
          <h2 className="text-lg font-semibold">Личные данные</h2>
          <div className="mt-3">
            <DetailsRow label="Возраст" value={formatPersonalValue(personal.age)} />
            <DetailsRow label="Город" value={formatPersonalValue(personal.city)} />
            <DetailsRow
              label="Пол"
              value={personal.gender ? genderLabels[personal.gender] : '-'}
            />
            <DetailsRow
              label="Статус отношений"
              value={
                personal.relationshipStatus
                  ? relationshipStatusLabels[personal.relationshipStatus]
                  : '-'
              }
            />
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="app-panel app-panel-solid p-4">
          <h2 className="text-lg font-semibold">Статус в продукте</h2>
          <p className="mt-2 font-medium">{summary.profileMode.label}</p>
          <p className="app-muted mt-1 text-sm">{summary.profileMode.description}</p>
          {currentPair && (
            <Link href={`/pair/${currentPair.id}`} className="app-btn-secondary mt-4 inline-flex px-3 py-2 text-sm">
              Открыть профиль пары
            </Link>
          )}
        </div>

        <ProfileCompletionPanel completion={summary.profileCompletion} />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="app-panel app-panel-solid p-4">
          <h2 className="text-lg font-semibold">Карточка знакомства</h2>
          <div className="app-muted mt-2 text-sm">
            {matchCard.score > 0 ? 'Карточка создана' : 'Карточка ещё не создана'} ·{' '}
            {matchCard.isActive ? 'активна' : 'неактивна'}
          </div>
          {matchCard.missing.length > 0 && (
            <div className="mt-3 text-sm">Не хватает: {matchCard.missing.join(', ')}</div>
          )}
          <Link href="/match-card/create" className="app-btn-secondary mt-4 inline-flex px-3 py-2 text-sm">
            Открыть карточку
          </Link>
        </div>

        <div className="app-panel app-panel-solid p-4">
          <h2 className="text-lg font-semibold">Паспорт данных</h2>
          <p className="app-muted mt-2 text-sm">
            Данные есть примерно по {passportAxesWithData} из 6 осей.
          </p>
          {summary.passport.strongSides.length > 0 && (
            <div className="mt-3 text-sm">
              Сильные стороны: {summary.passport.strongSides.join(', ')}
            </div>
          )}
          {summary.passport.growthAreas.length > 0 && (
            <div className="mt-2 text-sm">
              Зоны роста: {summary.passport.growthAreas.join(', ')}
            </div>
          )}
          <Link href="/questionnaires" className="app-btn-secondary mt-4 inline-flex px-3 py-2 text-sm">
            Открыть анкеты
          </Link>
        </div>
      </section>

      <div className="app-panel-soft app-panel-soft-solid p-4 text-sm app-muted">
        Полное редактирование профиля будет добавлено в следующей итерации.
      </div>
    </div>
  );
}
