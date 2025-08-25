'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUserStore } from '@/store/useUserStore';
import CandidateCard from '@/components/CandidateCard';
import LikeModal from '@/components/LikeModal';
import { api } from '@/utils/api';
import MatchTabs from '@/components/MatchTabs';
import BackBar from '@/components/ui/BackBar';

interface Candidate {
  id: string;
  username: string;
  avatar: string;
  score: number;
}

export default function SearchPage() {
  const user = useUserStore((s) => s.user);
  const router = useRouter();

  const [list, setList] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<{ id: string; username: string; avatar: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false); // грузим ленту только если не редиректим

  // гвард: активная пара / наличие карточки
  useEffect(() => {
    if (!user) return;
    let on = true;

    (async () => {
      const [pairPayload, card] = await Promise.all([
        fetch(api(`/api/pairs/me?userId=${user.id}`)).then((r) => (r.ok ? r.json() : null)),
        fetch(api(`/api/match/card?userId=${user.id}`)).then((r) => (r.ok ? r.json() : null)),
      ]);

      // поддерживаем оба формата: {pair: ...} и плоский doc/null
      const p = pairPayload && typeof pairPayload === 'object'
        ? ('pair' in pairPayload ? pairPayload.pair : pairPayload)
        : null;

      const isActive = !!(p && p._id && p.status === 'active');

      if (!on) return;

      if (isActive) {
        router.replace('/couple-activity');
        return;
      }

      if (!card) {
        router.replace('/match-card/create');
        return;
      }

      setReady(true);
    })().catch(() => setReady(true));

    return () => { on = false; };
  }, [user, router]);

  // загрузка ленты кандидатов
  useEffect(() => {
    if (!user || !ready) return;
    setLoading(true);
    setError(null);

    fetch(api(`/api/match/feed?userId=${user.id}`))
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((items: Candidate[]) => setList(items ?? []))
      .catch(async (r: Response) => setError((await r.json().catch(() => ({})))?.error || 'Ошибка'))
      .finally(() => setLoading(false));
  }, [user, ready]);

  if (!user) return <>No user</>;
  if (!ready && loading) return <div className="p-4">Загрузка…</div>;
  if (error) return <div className="p-4 text-red-600">{error}</div>;

  return (
    <div className="p-4 flex flex-col gap-2">
      <BackBar title="Поиск пары" fallbackHref="/main-menu" />
      <MatchTabs />

      {list.map((c) => (
        <CandidateCard key={c.id} c={c} onLike={setSelected} />
      ))}
      {!list.length && <p className="text-center">Нет кандидатов</p>}

      <LikeModal
        open={!!selected}
        onClose={() => setSelected(null)}
        fromId={user.id}
        candidate={selected}
        onSent={({ toId }) => {
          setList((xs) => xs.filter((x) => x.id !== toId));
          router.push('/match/inbox');
        }}
      />
    </div>
  );
}
