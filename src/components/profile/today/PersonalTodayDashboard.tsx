'use client';

import { useMemo, useState } from 'react';
import type {
  PersonalDailyCheckInRequest,
  PersonalTodayDataStatus,
  PersonalTodayDTO,
} from '@/client/api/types';
import { usersApi } from '@/client/api/users.api';
import { clampPercent } from '@/client/viewmodels/personalToday.viewmodels';
import ContinuationPanel from './ContinuationPanel';

type PersonalTodayDashboardProps = {
  today: PersonalTodayDTO;
  onRefresh?: () => Promise<void>;
};

type SliderKey =
  | 'energy'
  | 'stress'
  | 'closenessNeed'
  | 'spaceNeed'
  | 'supportNeed'
  | 'conversationReadiness'
  | 'conflictSensitivity';

type DailyAnswersDraft = {
  mood: PersonalDailyCheckInRequest['answers']['mood'] | null;
} & Record<SliderKey, number | null>;

const moodOptions: Array<{
  value: PersonalDailyCheckInRequest['answers']['mood'];
  label: string;
}> = [
  { value: 'calm', label: 'Спокойно' },
  { value: 'warm', label: 'Тепло' },
  { value: 'tired', label: 'Устало' },
  { value: 'anxious', label: 'Тревожно' },
  { value: 'irritated', label: 'Раздражённо' },
  { value: 'open', label: 'Открыто' },
];

const sliderLabels: Record<SliderKey, string> = {
  energy: 'Ресурс',
  stress: 'Стресс',
  closenessNeed: 'Хочется близости',
  spaceNeed: 'Нужно личное пространство',
  supportNeed: 'Нужна поддержка',
  conversationReadiness: 'Готовность к разговору',
  conflictSensitivity: 'Чувствительность к конфликту',
};

const scaleOptions = [
  { value: 0, label: 'Совсем нет' },
  { value: 0.25, label: 'Скорее нет' },
  { value: 0.5, label: 'Средне' },
  { value: 0.75, label: 'Заметно' },
  { value: 1, label: 'Очень сильно' },
] as const;

const emptyAnswersDraft = (): DailyAnswersDraft => ({
  mood: null,
  energy: null,
  stress: null,
  closenessNeed: null,
  spaceNeed: null,
  supportNeed: null,
  conversationReadiness: null,
  conflictSensitivity: null,
});

const submittedAnswers = (
  draft: DailyAnswersDraft
): PersonalDailyCheckInRequest['answers'] | null => {
  if (
    !draft.mood ||
    draft.energy === null ||
    draft.stress === null ||
    draft.closenessNeed === null ||
    draft.spaceNeed === null ||
    draft.supportNeed === null ||
    draft.conversationReadiness === null ||
    draft.conflictSensitivity === null
  ) {
    return null;
  }
  return {
    mood: draft.mood,
    energy: draft.energy,
    stress: draft.stress,
    closenessNeed: draft.closenessNeed,
    spaceNeed: draft.spaceNeed,
    supportNeed: draft.supportNeed,
    conversationReadiness: draft.conversationReadiness,
    conflictSensitivity: draft.conflictSensitivity,
  };
};

const iconGlyph: Record<string, string> = {
  heart: '♡',
  hand: '✦',
  cloud: '○',
  battery: '▮',
  alert: '!',
};

const formatPercent = (value: number): string => `${clampPercent(value)}%`;

const dataStatusLabels: Record<PersonalTodayDataStatus, string> = {
  AVAILABLE: 'Данные доступны',
  MISSING: 'Данных пока нет',
  INSUFFICIENT: 'Данных недостаточно',
};

function PersonalTodayHeader({ today }: { today: PersonalTodayDTO }) {
  const [open, setOpen] = useState(false);
  return (
    <header className="app-panel app-panel-solid p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="app-muted text-sm">{today.date.label}</div>
          <h1 className="mt-1 font-display text-2xl font-semibold sm:text-3xl">
            Привет, {today.user.name || 'друг'}
          </h1>
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            <span className="app-panel-soft app-panel-soft-solid rounded-full px-3 py-1">
              ♡ {today.pairContext.label}
            </span>
            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              className="app-panel-soft app-panel-soft-solid rounded-full px-3 py-1 text-left"
            >
              🔒 {today.privacy.label}
            </button>
          </div>
        </div>
        <div className="app-panel-soft app-panel-soft-solid w-full rounded-lg p-3 text-sm sm:max-w-xs">
          <div className="app-muted text-xs">
            {today.dataStatus.overall === 'AVAILABLE' ? 'Фокус дня' : 'Статус данных'}
          </div>
          <div className="mt-1 font-semibold">
            {today.dataStatus.overall === 'AVAILABLE'
              ? today.hero.title
              : dataStatusLabels[today.dataStatus.overall]}
          </div>
        </div>
      </div>
      {open && (
        <div className="app-panel-soft app-panel-soft-solid mt-3 rounded-lg p-3 text-sm">
          Лично. Видно только тебе. Партнёр увидит только явно отправленную фразу.
          Дневник и детали состояния не отправляются.
        </div>
      )}
    </header>
  );
}

function Ring({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone: string;
}) {
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.max(0, Math.min(1, value)));
  return (
    <div className="min-w-0 flex flex-col items-center gap-2 text-center">
      <svg className="h-auto w-full max-w-24" width="96" height="96" viewBox="0 0 96 96" role="img" aria-label={`${label} ${formatPercent(value)}`}>
        <circle cx="48" cy="48" r={radius} fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="8" />
        <circle
          cx="48"
          cy="48"
          r={radius}
          fill="none"
          stroke={tone}
          strokeLinecap="round"
          strokeWidth="8"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 48 48)"
        />
        <text x="48" y="52" textAnchor="middle" className="fill-current text-sm font-semibold">
          {formatPercent(value)}
        </text>
      </svg>
      <div className="app-muted text-xs">{label}</div>
    </div>
  );
}

function PersonalPulseRing({
  today,
  onRefresh,
}: {
  today: PersonalTodayDTO;
  onRefresh?: () => Promise<void>;
}) {
  const [refreshing, setRefreshing] = useState(false);
  const { resource, closeness, tension } = today.hero.rings;
  const metricsAvailable =
    today.dataStatus.overall === 'AVAILABLE' &&
    typeof resource === 'number' &&
    typeof closeness === 'number' &&
    typeof tension === 'number';

  if (!metricsAvailable) {
    const refresh = async () => {
      if (!onRefresh) return;
      setRefreshing(true);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
      }
    };

    return (
      <section className="app-panel app-panel-solid p-4 sm:p-5">
        <div className="max-w-2xl">
          <div className="app-muted text-xs">Личная сводка</div>
          <h2 className="mt-2 text-xl font-semibold">Числовых выводов пока нет</h2>
          <p className="app-muted mt-2 text-sm">
            Мы не подставляем средние значения вместо ваших данных. Отметьте текущее
            состояние, чтобы сводка появилась.
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <span className="app-panel-soft app-panel-soft-solid rounded-full px-3 py-1.5">
              Ресурс: {dataStatusLabels[today.dataStatus.metricGroups.resource]}
            </span>
            <span className="app-panel-soft app-panel-soft-solid rounded-full px-3 py-1.5">
              Контакт: {dataStatusLabels[today.dataStatus.metricGroups.connection]}
            </span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <a href="#personal-daily-check-in" className="app-btn-primary px-4 py-2 text-sm">
              Отметить состояние
            </a>
            {onRefresh && (
              <button
                type="button"
                onClick={() => void refresh()}
                disabled={refreshing}
                className="app-btn-secondary px-4 py-2 text-sm disabled:opacity-60"
              >
                {refreshing ? 'Проверяем...' : 'Проверить снова'}
              </button>
            )}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="app-panel app-panel-solid p-4 sm:p-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.2fr_1fr] lg:items-center">
        <div>
          <div className="app-muted text-xs">Фокус дня</div>
          <h2 className="mt-2 font-display text-3xl font-semibold leading-tight">
            {today.hero.title}
          </h2>
          <p className="mt-2 text-base">{today.hero.subtitle}</p>
          <div className="mt-4 flex flex-wrap gap-2 text-sm">
            {today.hero.hints.map((hint) => (
              <span key={hint} className="app-panel-soft app-panel-soft-solid rounded-full px-3 py-1">
                {hint}
              </span>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Ring value={resource} label="Ресурс" tone="#10b981" />
          <Ring value={closeness} label="Близость" tone="#f59e0b" />
          <Ring value={tension} label="Напряжение" tone="#ef4444" />
        </div>
      </div>
    </section>
  );
}

function PersonalQuickCards({ today }: { today: PersonalTodayDTO }) {
  if (today.dataStatus.overall !== 'AVAILABLE' || today.quickCards.length === 0) {
    return null;
  }
  return (
    <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {today.quickCards.map((card) => (
        <article key={`${card.key}-${card.title}`} className="app-panel app-panel-solid p-4">
          <div className="app-panel-soft app-panel-soft-solid flex h-8 w-8 items-center justify-center rounded-full text-sm">
            {iconGlyph[card.icon] ?? '•'}
          </div>
          <h3 className="mt-3 font-semibold">{card.title}</h3>
          <p className="app-muted mt-2 text-sm leading-relaxed">{card.body}</p>
        </article>
      ))}
    </section>
  );
}

function PartnerSignalCard({
  today,
  draftText,
  onRefresh,
}: {
  today: PersonalTodayDTO;
  draftText: string;
  onRefresh?: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [text, setText] = useState(draftText);
  const [status, setStatus] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!today.checkIn.id) {
      setStatus('Сначала отметь состояние за сегодня, потом можно отправить сигнал.');
      return;
    }
    if (!today.partnerSignal.available) {
      setStatus('Сигнал сейчас недоступен. Обновите личную сводку и попробуйте ещё раз.');
      return;
    }
    const normalizedText = text.trim();
    if (!normalizedText) {
      setStatus('Введите короткую фразу перед отправкой.');
      return;
    }
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setSending(true);
    setStatus(null);
    try {
      await usersApi.sendPartnerSignal(today.checkIn.id, { text: normalizedText });
      setStatus('Сигнал отправлен.');
      setConfirming(false);
      await onRefresh?.();
    } catch {
      setStatus('Не удалось отправить сигнал. Можно попробовать ещё раз.');
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="app-panel app-panel-solid p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="app-muted text-xs">
            {today.partnerSignal.visibility === 'sent' ? 'Отправлено' : 'Черновик'}
          </div>
          <h2 className="mt-1 text-lg font-semibold">{today.partnerSignal.title}</h2>
        </div>
        <span className="app-panel-soft app-panel-soft-solid rounded-full px-2.5 py-1 text-xs">
          {today.partnerSignal.available ? 'можно отправить' : 'лично'}
        </span>
      </div>

      {editing ? (
        <textarea
          value={text}
          maxLength={300}
          onChange={(event) => {
            setText(event.target.value);
            setConfirming(false);
            setStatus(null);
          }}
          aria-label="Фраза для партнёра"
          className="mt-4 min-h-28 w-full rounded-lg border border-black/10 bg-white/60 p-3 text-sm outline-none focus:border-[var(--app-accent,#8b5cf6)]"
        />
      ) : (
        <p className="app-panel-soft app-panel-soft-solid mt-4 rounded-lg p-3 text-sm leading-relaxed">
          {text}
        </p>
      )}

      {confirming && (
        <div className="app-panel-soft app-panel-soft-solid mt-3 rounded-lg p-3 text-sm">
          Партнёр увидит только эту фразу. Дневник, детали состояния и ответы останутся личными.
        </div>
      )}

      {status && <p className="app-muted mt-3 text-sm" role="status" aria-live="polite">{status}</p>}

      {today.partnerSignal.visibility !== 'sent' && <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={send}
          disabled={sending || !today.partnerSignal.available || !text.trim()}
          className="app-btn-primary px-4 py-2 text-sm disabled:opacity-60"
        >
          {sending
            ? 'Отправляем...'
            : confirming
              ? 'Подтвердить отправку'
              : today.partnerSignal.primaryCta}
        </button>
        <button
          type="button"
          onClick={() => {
            setEditing((value) => !value);
            setConfirming(false);
            setStatus(null);
          }}
          className="app-btn-secondary px-4 py-2 text-sm"
        >
          {editing ? 'Готово' : 'Изменить'}
        </button>
        <button
          type="button"
          onClick={() => {
            setConfirming(false);
            setStatus('Оставлено только для тебя.');
          }}
          className="app-btn-secondary px-4 py-2 text-sm"
        >
          {today.partnerSignal.secondaryCta}
        </button>
      </div>}
    </section>
  );
}

function SoftOptionCard({
  option,
  onSelectPhrase,
}: {
  option: NonNullable<PersonalTodayDTO['softOption']>;
  onSelectPhrase: (phrase: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="app-panel app-panel-solid p-4">
      <h2 className="text-lg font-semibold">{option.title}</h2>
      <p className="app-muted mt-2 text-sm">{option.intro}</p>
      <div className="app-panel-soft app-panel-soft-solid mt-4 rounded-lg p-3 text-sm">
        {option.phrase}
      </div>
      {open && (
        <div className="mt-3 space-y-2">
          {option.alternatives.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => onSelectPhrase(item)}
              className="app-panel-soft app-panel-soft-solid w-full rounded-lg p-3 text-left text-sm"
            >
              {item}
            </button>
          ))}
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onSelectPhrase(option.phrase)}
          className="app-btn-primary px-4 py-2 text-sm"
        >
          {option.primaryCta}
        </button>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="app-btn-secondary px-4 py-2 text-sm"
        >
          {open ? 'Свернуть' : 'Варианты'}
        </button>
      </div>
    </section>
  );
}

function TodayMapStrip({ today }: { today: PersonalTodayDTO }) {
  if (today.dataStatus.overall !== 'AVAILABLE') return null;

  return (
    <section className="app-panel app-panel-solid p-4">
      <h2 className="text-lg font-semibold">Моя карта сегодня</h2>
      {today.todayMap.length > 0 ? (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {today.todayMap.map((item) => (
            <div key={item.key}>
              <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                <span>{item.label}</span>
                <span className="app-muted">{formatPercent(item.value)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-black/10">
                <div
                  className="h-full rounded-full bg-[var(--app-accent,#8b5cf6)]"
                  style={{ width: `${clampPercent(item.value)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="app-muted mt-3 text-sm">
          Для карты пока нет данных. Значения появятся после вашей отметки состояния.
        </p>
      )}
    </section>
  );
}

function PrivateJournalCard({ today }: { today: PersonalTodayDTO }) {
  const text = today.privateJournal.text?.trim() ?? '';
  return (
    <section className="app-panel app-panel-solid p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-lg font-semibold">Личный дневник 🔒</h2>
        {text && <span className="app-muted text-xs">{text.length}/{today.privateJournal.maxLength}</span>}
      </div>
      <p className="app-muted mt-2 text-sm">
        Только для тебя. Здесь можно писать честно и без оценки.
      </p>
      <div className="app-panel-soft app-panel-soft-solid mt-4 min-h-24 rounded-lg p-3 text-sm leading-relaxed">
        {text || 'Личная запись пока не сохранена.'}
      </div>
      <p className="app-muted mt-3 text-sm">
        {today.checkIn.submittedToday
          ? 'Чтобы изменить запись, откройте форму ниже и сохраните отметку состояния ещё раз.'
          : 'Сначала отметьте состояние за сегодня — запись сохраняется вместе с ним.'}
      </p>
      <a href="#personal-daily-check-in" className="app-btn-secondary mt-3 inline-flex px-4 py-2 text-sm">
        {today.checkIn.submittedToday ? 'Изменить в форме' : 'Перейти к форме'}
      </a>
    </section>
  );
}

function IncomingPartnerSignalCard({ today }: { today: PersonalTodayDTO }) {
  const signal = today.incomingPartnerSignal;
  if (!signal) return null;
  return (
    <section className="app-panel app-panel-solid p-4">
      <div className="app-muted text-xs">Сигнал от партнёра</div>
      <h2 className="mt-1 text-lg font-semibold">{signal.from.username}</h2>
      <p className="app-panel-soft app-panel-soft-solid mt-4 rounded-lg p-3 text-sm">
        {signal.text}
      </p>
    </section>
  );
}

function DailyCheckInCard({
  today,
  onRefresh,
}: {
  today: PersonalTodayDTO;
  onRefresh?: () => Promise<void>;
}) {
  const [open, setOpen] = useState(!today.checkIn.submittedToday);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [journalDraft, setJournalDraft] = useState<string | null>(null);
  const journalText = journalDraft ?? today.privateJournal.text ?? '';
  const [answers, setAnswers] = useState<DailyAnswersDraft>(emptyAnswersDraft);

  const updateSlider = (key: SliderKey, value: number) => {
    setAnswers((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const submit = async () => {
    const completeAnswers = submittedAnswers(answers);
    if (!completeAnswers) {
      setMessage('Выберите состояние и ответьте на все пункты без значений по умолчанию.');
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      await usersApi.submitPersonalDailyCheckIn({
        dateKey: today.date.dateKey,
        timezoneOffsetMin: new Date().getTimezoneOffset(),
        answers: completeAnswers,
        privateJournal: journalDraft === null ? undefined : { text: journalText.trim() ? journalText : '' },
        share: {
          partnerSignal: {
            enabled: today.pairContext.hasPair,
            ...(today.partnerSignal.text.trim()
              ? { text: today.partnerSignal.text }
              : {}),
          },
          pairMap: {
            enabled: false,
          },
        },
      });
      setMessage('Отметка сохранена.');
      setOpen(false);
      await onRefresh?.();
      setJournalDraft((current) => current === journalDraft ? null : current);
    } catch {
      setMessage('Не удалось сохранить отметку. Можно попробовать ещё раз.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section id="personal-daily-check-in" className="app-panel app-panel-solid p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="app-muted text-xs">
            {today.checkIn.submittedToday ? 'Сегодня отмечено' : 'Сегодня ещё нет отметки'}
          </div>
          <h2 className="mt-1 text-lg font-semibold">
            Можно понять своё состояние за 30 секунд.
          </h2>
        </div>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="app-btn-secondary px-3 py-2 text-sm"
        >
          {open ? 'Свернуть' : 'Отметить состояние'}
        </button>
      </div>

      {open && (
        <div className="mt-4 space-y-4">
          <div>
            <label className="text-sm font-medium" htmlFor="personal-today-mood">
              Состояние
            </label>
            <select
              id="personal-today-mood"
              value={answers.mood ?? ''}
              onChange={(event) =>
                setAnswers((current) => ({
                  ...current,
                  mood: event.target.value as PersonalDailyCheckInRequest['answers']['mood'],
                }))
              }
              className="mt-2 w-full rounded-lg border border-black/10 bg-white/60 p-2 text-sm"
            >
              <option value="" disabled>
                Выберите состояние
              </option>
              {moodOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(Object.keys(sliderLabels) as SliderKey[]).map((key) => (
              <fieldset
                key={key}
                className="app-panel-soft app-panel-soft-solid rounded-lg p-3 text-sm"
              >
                <legend className="px-1 font-medium">{sliderLabels[key]}</legend>
                <div className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-3 xl:grid-cols-5">
                  {scaleOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={answers[key] === option.value}
                      onClick={() => updateSlider(key, option.value)}
                      className={`rounded-md px-2 py-2 text-xs ${
                        answers[key] === option.value
                          ? 'bg-[var(--app-accent,#8b5cf6)] text-white'
                          : 'bg-white/50'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                {answers[key] === null && (
                  <div className="app-muted mt-2 text-xs">Не выбрано</div>
                )}
              </fieldset>
            ))}
          </div>

          <div>
            <label className="text-sm font-medium" htmlFor="personal-today-journal">
              Личный дневник
            </label>
            <textarea
              id="personal-today-journal"
              value={journalText}
              maxLength={today.privateJournal.maxLength}
              onChange={(event) => setJournalDraft(event.target.value)}
              placeholder={today.privateJournal.placeholder}
              className="mt-2 min-h-28 w-full rounded-lg border border-black/10 bg-white/60 p-3 text-sm outline-none focus:border-[var(--app-accent,#8b5cf6)]"
            />
          </div>

          {message && <p className="app-muted text-sm" role="status" aria-live="polite">{message}</p>}
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="app-btn-primary px-4 py-2 text-sm disabled:opacity-60"
          >
            {saving ? 'Сохраняем...' : 'Сохранить отметку'}
          </button>
        </div>
      )}
    </section>
  );
}

export default function PersonalTodayDashboard({
  today,
  onRefresh,
}: PersonalTodayDashboardProps) {
  const [draftOverride, setDraftOverride] = useState<string | null>(null);
  const draftText = draftOverride ?? today.partnerSignal.text;
  const softOption = today.softOption;
  const firstRow = useMemo(
    () =>
      today.dataStatus.overall === 'AVAILABLE' && softOption ? (
        <div className="app-dashboard-grid">
          <div className="app-grid-wide">
            <PartnerSignalCard key={draftText} today={today} draftText={draftText} onRefresh={onRefresh} />
          </div>
          <div className="app-grid-narrow">
            <SoftOptionCard option={softOption} onSelectPhrase={setDraftOverride} />
          </div>
        </div>
      ) : null,
    [draftText, onRefresh, softOption, today]
  );

  return (
    <section className="app-page-stack">
      <PersonalTodayHeader today={today} />
      <ContinuationPanel pairId={today.pairContext.pairId} pairStatus={today.pairContext.status} />
      <PersonalPulseRing today={today} onRefresh={onRefresh} />
      <PersonalQuickCards today={today} />
      {today.incomingPartnerSignal && <IncomingPartnerSignalCard today={today} />}
      {firstRow}
      <TodayMapStrip today={today} />
      <div className="app-dashboard-grid">
        <PrivateJournalCard key={today.privateJournal.text ?? ''} today={today} />
        <DailyCheckInCard today={today} onRefresh={onRefresh} />
      </div>
    </section>
  );
}
