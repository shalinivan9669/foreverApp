'use client';

import { useEffect, useState } from 'react';
import { useUserStore } from '@/store/useUserStore';
import { api } from '@/utils/api';
import ActivityCard from '@/components/activities/ActivityCard';
import CheckInModal from '@/components/activities/CheckInModal';
import BackBar from '@/components/ui/BackBar';

/* Типы, совместимые с PairActivity */
type I18nText = Record<string, string>;
type CheckIn = { id: string; scale: 'likert5'|'bool'; map: number[]; text: I18nText; weight?: number };
type Activity = {
  _id: string;
  title: I18nText;
  description?: I18nText;
  axis: string[];
  archetype: string;
  intent: 'improve'|'celebrate';
  difficulty: 1|2|3|4|5;
  intensity: 1|2|3;
  timeEstimateMin?: number;
  dueAt?: string;
  status: 'offered'|'accepted'|'in_progress'|'awaiting_checkin'|'completed_success'|'completed_partial'|'failed'|'cancelled'|'expired';
  checkIns: CheckIn[];
};

type Tab = 'active' | 'suggested' | 'history';

export default function CoupleActivityPage() {
  const user = useUserStore(s => s.user);
  const [pairId, setPairId] = useState<string | null>(null);

  const [tab, setTab] = useState<Tab>('active');
  const [active, setActive] = useState<Activity | null>(null);
  const [suggested, setSuggested] = useState<Activity[]>([]);
  const [history, setHistory] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(false);
  const [suggestBusy, setSuggestBusy] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);

  const locale = 'ru';

 // загрузка pairId
useEffect(() => {
  if (!user) return;
  let on = true;
  fetch(api(`/api/pairs/me?userId=${user.id}`))
    .then(r => (r.ok ? r.json() : null))
    .then(d => {
      if (!on) return;
      // API /api/pairs/me возвращает сам документ пары (или {pair: ...}) — поддержим оба варианта
      const id = d?.pair?._id ?? d?._id ?? null;
      if (id) setPairId(String(id));
    })
    .catch(() => {});
  return () => {
    on = false;
  };
}, [user]);


  // загрузка активностей
  // загрузка активностей
useEffect(() => {
  if (!pairId) return;
  let on = true;

  (async () => {
    setLoading(true);

    // Нормализуем ответ: API сейчас отдаёт массив, а фронт ранее ожидал {items:[]}
    const grab = async (s: string) => {
      const res = await fetch(api(`/api/pairs/${pairId}/activities?s=${s}`));
      if (!res.ok) return [] as Activity[];
      const d = await res.json();
      return Array.isArray(d) ? (d as Activity[]) : (Array.isArray(d?.items) ? (d.items as Activity[]) : []);
    };

    const [cur, sug, hist] = await Promise.all([
      grab('current'),
      grab('suggested'),
      grab('history'),
    ]);

    if (!on) return;
    setActive(cur[0] ?? null);
    setSuggested(sug);
    setHistory(hist);
    setLoading(false);
  })();

  return () => {
    on = false;
  };
}, [pairId, tab]);


  const refresh = () => setTab(t => t); // триггерит useEffect

    const onSuggestNext = async () => {
    if (!pairId || suggestBusy) return;
    setSuggestBusy(true);
    setSuggestError(null);
    try {
      const res = await fetch(api(`/api/pairs/${pairId}/suggest`), { method: 'POST' });
      if (!res.ok) throw new Error('Не удалось предложить активности');
      refresh();
    } catch (e) {
      setSuggestError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setSuggestBusy(false);
    }
  };

  const onAccept = async (id: string) => {
    await fetch(api(`/api/activities/${id}/accept`), { method: 'POST' });
    refresh();
  };

  const onCancel = async (id: string) => {
    await fetch(api(`/api/activities/${id}/cancel`), { method: 'POST' });
    refresh();
  };

  const [checkInFor, setCheckInFor] = useState<Activity | null>(null);

  const onComplete = (a: Activity) => setCheckInFor(a);

const onSubmitCheckIn = async (
  id: string,
  answers: Array<{ checkInId: string; ui: number }>
) => {
  await fetch(api(`/api/activities/${id}/checkin`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // TODO: подставить 'A' или 'B' по текущему пользователю относительно pair.members
    body: JSON.stringify({ by: 'A', answers }),
  });
  setCheckInFor(null);
  refresh();
};


  const tabBtn = (t: Tab, text: string) => (
    <button
      onClick={() => setTab(t)}
      className={`px-4 py-2 rounded ${tab === t ? 'bg-black text-white' : 'bg-gray-200 hover:bg-gray-300'}`}
    >
      {text}
    </button>
  );

  return (
    <main className="p-4 max-w-3xl mx-auto space-y-4">
       <BackBar  title="Активности пары" fallbackHref="/main-menu" />
      <h1 className="text-2xl font-bold">Активности пары</h1>

      <div className="flex gap-2">{tabBtn('active','Активная')}{tabBtn('suggested','Предложено')}{tabBtn('history','История')}</div>

      {loading && <div className="text-sm text-gray-500">Загрузка…</div>}

      {!loading && tab === 'active' && (
        <div>
          {active ? (
            <ActivityCard
              activity={active}
              locale={locale}
              variant="active"
              onAccept={() => undefined}
              onCancel={() => onCancel(active._id)}
              onComplete={() => onComplete(active)}
              onSuggestNext={onSuggestNext}
            />
          ) : (
            <div className="rounded border p-4 flex items-center justify-between">
              <div>
                <div className="font-medium">Нет активной активности</div>
                <div className="text-sm text-gray-500">Предложим подходящее задание</div>
              </div>
              <button onClick={onSuggestNext} className="px-3 py-2 rounded bg-black text-white">Предложить</button>
            </div>
          )}
        </div>
      )}

      {!loading && tab === 'suggested' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button onClick={onSuggestNext} className="px-3 py-2 rounded bg-black text-white">Ещё варианты</button>
          </div>
          {suggested.length === 0 && <div className="text-sm text-gray-500">Пока пусто</div>}
          {suggested.map(s => (
            <ActivityCard
              key={s._id}
              activity={s}
              locale={locale}
              variant="suggested"
              onAccept={() => onAccept(s._id)}
              onCancel={() => onCancel(s._id)}
              onComplete={() => onComplete(s)}
              onSuggestNext={() => {}}
            />
          ))}
        </div>
      )}

      {!loading && tab === 'history' && (
        <div className="space-y-3">
          {history.length === 0 && <div className="text-sm text-gray-500">Истории пока нет</div>}
          {history.map(h => (
            <ActivityCard
              key={h._id}
              activity={h}
              locale={locale}
              variant="history"
              onAccept={() => {}}
              onCancel={() => {}}
              onComplete={() => {}}
              onSuggestNext={() => {}}
            />
          ))}
        </div>
      )}

      {checkInFor && (
        <CheckInModal
          activity={checkInFor}
          locale={locale}
          onClose={() => setCheckInFor(null)}
          onSubmit={(answers) => onSubmitCheckIn(checkInFor._id, answers)}
        />
      )}
    </main>
  );
}
