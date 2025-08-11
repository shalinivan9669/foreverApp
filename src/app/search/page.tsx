'use client';

import { useEffect, useState } from 'react';   // ← useMemo убран
import { useRouter } from 'next/navigation';
import { useUserStore } from '@/store/useUserStore';
import CandidateCard from '@/components/CandidateCard';
import LikeModal from '@/components/LikeModal';
import { api } from '@/utils/api';

interface Candidate {
  id: string;
  username: string;
  avatar: string;
  score: number;
}

export default function SearchPage() {
  const user = useUserStore(s => s.user);
  const router = useRouter();
  const [list, setList] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<{ id: string; username: string; avatar: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // гварды
  useEffect(() => {
    if (!user) return;
    Promise.all([
      fetch(api(`/api/pairs/me?userId=${user.id}`)).then(r => (r.ok ? r.json() : null)),
      fetch(api(`/api/match/card?userId=${user.id}`)).then(r => (r.ok ? r.json() : null))
    ])
      .then(([pair, card]) => {
        if (pair) router.replace('/couple-activity');
        else if (!card) router.replace('/match-card/create');
      })
      .catch(() => {});
  }, [user, router]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    fetch(api(`/api/match/feed?userId=${user.id}`))
      .then(r => (r.ok ? r.json() : Promise.reject(r)))
      .then(setList)
      .catch(async (r: Response) => setError((await r.json().catch(() => ({})))?.error || 'Ошибка'))
      .finally(() => setLoading(false));
  }, [user]);

  if (!user) return <>No user</>;
  if (loading) return <div className="p-4">Загрузка…</div>;
  if (error) return <div className="p-4 text-red-600">{error}</div>;

  return (
    <div className="p-4 flex flex-col gap-2">
      {list.map(c => (
        <CandidateCard key={c.id} c={c} onLike={setSelected} />
      ))}
      {!list.length && <p className="text-center">Нет кандидатов</p>}

      <LikeModal
        open={!!selected}
        onClose={() => setSelected(null)}
        fromId={user.id}
        candidate={selected}
        onSent={() => {}}
      />
    </div>
  );
}
