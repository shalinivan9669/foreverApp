'use client';

import Link from 'next/link';
import type { MouseEvent } from 'react';
import type { QuestionnaireCardVM } from '@/client/viewmodels/questionnaire.viewmodels';

type Axis = QuestionnaireCardVM['vector'];

type QuestionnaireCardProps = {
  q: QuestionnaireCardVM;
  loading?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  onStart?: (questionnaire: QuestionnaireCardVM) => Promise<void> | void;
};

const vectorStripe: Record<Axis, string> = {
  communication: 'bg-sky-500',
  domestic: 'bg-amber-500',
  personalViews: 'bg-violet-500',
  finance: 'bg-emerald-500',
  sexuality: 'bg-rose-500',
  psyche: 'bg-indigo-500',
};

const vectorLabel: Record<Axis, string> = {
  communication: 'коммуникация',
  domestic: 'быт',
  personalViews: 'взгляды',
  finance: 'финансы',
  sexuality: 'интим',
  psyche: 'психика',
};

const audienceLabel = {
  pair: 'пара',
  solo: 'соло',
  universal: 'универсальная',
} as const;

const scopeLabel = {
  personal: 'персональная',
  couple: 'для пары',
} as const;

const statusBadge = (questionnaire: QuestionnaireCardVM) => {
  if (questionnaire.status === 'required') return 'обязательная';
  if (questionnaire.status === 'locked') return 'нужна пара';
  if (questionnaire.status === 'completed') return 'пройдена';
  if (questionnaire.status === 'in_progress') return 'в процессе';
  return null;
};

const ctaLabel = (questionnaire: QuestionnaireCardVM) => {
  if (questionnaire.cta === 'locked') return 'нужна пара';
  if (questionnaire.cta === 'result') return 'результат';
  if (questionnaire.cta === 'continue') return 'продолжить';
  if (questionnaire.isStarter) return 'начать стартовую';
  return 'начать';
};

const hrefFor = (questionnaire: QuestionnaireCardVM) => {
  if (questionnaire.scope === 'couple' && questionnaire.pairId) {
    return `/pair/${questionnaire.pairId}/questionnaire/${questionnaire.id}`;
  }
  return `/questionnaire/${questionnaire.id}`;
};

export default function QuestionnaireCard({
  q,
  loading = false,
  disabled = false,
  disabledReason,
  onStart,
}: QuestionnaireCardProps) {
  const badge = statusBadge(q);
  const href = hrefFor(q);
  const actionDisabled = q.status === 'locked' || disabled || loading;

  const handleStart = (event: MouseEvent) => {
    if (!onStart) return;
    event.preventDefault();
    event.stopPropagation();
    if (actionDisabled) return;
    void onStart(q);
  };

  return (
    <Link
      href={href}
      onClick={(event) => {
        if (onStart) {
          handleStart(event);
          return;
        }
        if (q.status === 'locked') {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      className={
        'app-panel app-lift relative block p-4 transition ' +
        'hover:-translate-y-0.5 hover:shadow-md ' +
        (q.status === 'locked' || disabled ? 'opacity-75' : '') +
        (q.isStarter ? ' border-blue-200 bg-blue-50/40' : '')
      }
      aria-disabled={actionDisabled}
    >
      <div className={`absolute left-0 top-0 h-full w-1.5 rounded-l-lg ${vectorStripe[q.vector]}`} />

      <div className="flex flex-col gap-2 pl-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="app-muted flex items-center gap-2 text-sm">
          <span className="inline-flex h-2 w-2 rounded-full bg-slate-300" />
          <span>{vectorLabel[q.vector]}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{scopeLabel[q.scope]}</span>
          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{audienceLabel[q.audience]}</span>
          {badge && <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{badge}</span>}
        </div>
      </div>

      <div className="mt-3 pl-3">
        <h3 className="font-display max-h-12 overflow-hidden text-base font-semibold leading-tight text-slate-900">
          {q.title}
        </h3>
        <p className="app-muted mt-1 max-h-10 overflow-hidden text-sm leading-5">{q.subtitle}</p>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 pl-3 text-sm text-slate-700">
        <span>
          {q.estMinutesMin}-{q.estMinutesMax} мин
        </span>
        <span>{q.questionCount} вопросов</span>
        <span>уровень {q.level}</span>
        {typeof q.rewardCoins === 'number' && <span>{q.rewardCoins} монет</span>}
        {typeof q.insightsCount === 'number' && <span>{q.insightsCount} инсайтов</span>}
      </div>

      <div className="mt-3 pl-3 flex flex-wrap gap-2">
        {q.tagsPublic.map((tag) => (
          <span key={tag} className="rounded border border-slate-200 px-2 py-0.5 text-[11px] text-slate-700">
            {tag}
          </span>
        ))}
        {q.tagsHiddenCount > 0 && (
          <span className="rounded border border-slate-200 px-2 py-0.5 text-[11px] text-slate-700">
            +{q.tagsHiddenCount}
          </span>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-3 pl-3 sm:flex-row sm:items-center sm:justify-between">
        {q.status === 'in_progress' && (
          <div className="flex-1">
            <div className="h-2 rounded bg-slate-100">
              <div className="h-2 rounded bg-blue-600" style={{ width: `${Math.min(100, q.progressPct ?? 0)}%` }} />
            </div>
            <div className="app-muted mt-1 text-xs">Прогресс {q.progressPct ?? 0}%</div>
          </div>
        )}
        {q.status === 'completed' && <div className="app-muted text-xs">Готово</div>}

        <button
          type="button"
          onClick={(event) => {
            if (onStart) {
              handleStart(event);
              return;
            }
            if (q.status === 'locked') {
              event.preventDefault();
              event.stopPropagation();
            }
          }}
          disabled={actionDisabled}
          className={
            'rounded px-3 py-1.5 text-sm ' +
            (actionDisabled ? 'cursor-not-allowed bg-slate-200 text-slate-500' : 'app-btn-primary text-white')
          }
        >
          {loading ? 'Запускаем...' : ctaLabel(q)}
        </button>
      </div>

      {q.status === 'locked' && q.lockReason && <div className="app-muted mt-2 pl-3 text-xs">{q.lockReason}</div>}
      {!q.lockReason && disabledReason && <div className="app-muted mt-2 pl-3 text-xs">{disabledReason}</div>}
    </Link>
  );
}
