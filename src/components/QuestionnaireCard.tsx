'use client';

import Link from 'next/link';

type Axis =
  | 'communication'
  | 'domestic'
  | 'personalViews'
  | 'finance'
  | 'sexuality'
  | 'psyche';

type QuestionnaireCardDTO = {
  id: string;
  vector: Axis;
  audience: 'pair' | 'solo' | 'universal';
  title: string;
  subtitle: string;
  tagsPublic: string[];
  tagsHiddenCount: number;
  questionCount: number;
  estMinutesMin: number;
  estMinutesMax: number;
  level: 1 | 2 | 3 | 4 | 5;
  rewardCoins?: number;
  insightsCount?: number;
  status: 'new' | 'in_progress' | 'completed' | 'required' | 'locked';
  progressPct?: number;
  lockReason?: string;
  cta: 'start' | 'continue' | 'result' | 'locked';
  isStarter?: boolean;
  pairId?: string | null;
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

const statusBadge = (q: QuestionnaireCardDTO) => {
  if (q.status === 'required') return 'обязательная';
  if (q.status === 'locked') return 'нужна пара';
  if (q.status === 'completed') return 'пройдена';
  if (q.status === 'in_progress') return 'в процессе';
  return null;
};

const ctaLabel = (q: QuestionnaireCardDTO) => {
  if (q.cta === 'locked') return 'нужна пара';
  if (q.cta === 'result') return 'результат';
  if (q.cta === 'continue') return 'продолжить';
  if (q.isStarter) return 'начать стартовую';
  return 'начать';
};

const hrefFor = (q: QuestionnaireCardDTO) => {
  if (q.audience === 'pair' && q.pairId) return `/pair/${q.pairId}/questionnaire/${q.id}`;
  return `/questionnaire/${q.id}`;
};

export default function QuestionnaireCard({ q }: { q: QuestionnaireCardDTO }) {
  const badge = statusBadge(q);
  const href = hrefFor(q);

  return (
    <Link
      href={href}
      onClick={(e) => {
        if (q.status === 'locked') {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      className={
        'relative block rounded-lg border bg-white p-4 transition ' +
        'hover:-translate-y-0.5 hover:shadow-sm ' +
        (q.status === 'locked' ? 'opacity-75' : '') +
        (q.isStarter ? ' border-blue-200 bg-blue-50/40' : '')
      }
      aria-disabled={q.status === 'locked'}
    >
      <div className={`absolute left-0 top-0 h-full w-1.5 rounded-l-lg ${vectorStripe[q.vector]}`} />

      {/* Заголовок анкеты */}
      <div className="flex items-start justify-between gap-3 pl-3">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <span className="inline-flex h-2 w-2 rounded-full bg-gray-300" />
          <span>{vectorLabel[q.vector]}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs px-2 py-0.5 rounded bg-gray-100">{audienceLabel[q.audience]}</span>
          {badge && <span className="text-xs px-2 py-0.5 rounded bg-gray-100">{badge}</span>}
        </div>
      </div>

      {/* Подзаголовок */}
      <div className="mt-3 pl-3">
        <h3 className="text-base font-semibold text-gray-900 leading-snug max-h-12 overflow-hidden">
          {q.title}
        </h3>
        <p className="text-sm text-gray-600 mt-1 leading-5 max-h-10 overflow-hidden">
          {q.subtitle}
        </p>
      </div>

      {/* Сводка */}
      <div className="mt-3 pl-3 text-sm text-gray-700 flex flex-wrap gap-x-3 gap-y-1">
        <span>{q.estMinutesMin}–{q.estMinutesMax} мин</span>
        <span>{q.questionCount} вопросов</span>
        <span>уровень {q.level}</span>
        {typeof q.rewardCoins === 'number' && <span>{q.rewardCoins} монет</span>}
        {typeof q.insightsCount === 'number' && <span>{q.insightsCount} инсайтов</span>}
      </div>

      {/* Теги */}
      <div className="mt-3 pl-3 flex flex-wrap gap-2">
        {q.tagsPublic.map((t) => (
          <span key={t} className="text-[11px] px-2 py-0.5 rounded border border-gray-200">
            {t}
          </span>
        ))}
        {q.tagsHiddenCount > 0 && (
          <span className="text-[11px] px-2 py-0.5 rounded border border-gray-200">
            +{q.tagsHiddenCount}
          </span>
        )}
      </div>

      {/* Статус: прогресс + CTA */}
      <div className="mt-4 pl-3 flex items-center justify-between gap-3">
        {q.status === 'in_progress' && (
          <div className="flex-1">
            <div className="h-2 bg-gray-100 rounded">
              <div
                className="h-2 bg-blue-600 rounded"
                style={{ width: `${Math.min(100, q.progressPct ?? 0)}%` }}
              />
            </div>
            <div className="text-xs text-gray-500 mt-1">Прогресс {q.progressPct ?? 0}%</div>
          </div>
        )}
        {q.status === 'completed' && (
          <div className="text-xs text-gray-500">Готово</div>
        )}

        <button
          onClick={(e) => {
            if (q.status === 'locked') {
              e.preventDefault();
              return;
            }
            e.stopPropagation();
          }}
          className={
            'px-3 py-1.5 rounded text-sm ' +
            (q.status === 'locked'
              ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700')
          }
        >
          {ctaLabel(q)}
        </button>
      </div>

      {q.status === 'locked' && q.lockReason && (
        <div className="mt-2 pl-3 text-xs text-gray-500">{q.lockReason}</div>
      )}
    </Link>
  );
}
