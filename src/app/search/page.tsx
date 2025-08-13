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
  const user = useUserStore(s => s.user);
  const router = useRouter();

  const [list, setList] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<{ id: string; username: string; avatar: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // редиректы-гварды
  useEffect(() => {
    if (!user) return;
    Promise.all([
      fetch(api(`/api/pairs/me?userId=${user.id}`)).then(r => (r.ok ? r.json() : null)),
      fetch(api(`/api/match/card?userId=${user.id}`)).then(r => (r.ok ? r.json() : null)),
    ])
      .then(([pair, card]) => {
        if (pair) router.replace('/couple-activity');
        else if (!card) router.replace('/match-card/create');
      })
      .catch(() => {});
  }, [user, router]);

  // загрузка фида
  useEffect(() => {
    if (!user) return;
    setLoading(true);
    fetch(api(`/api/match/feed?userId=${user.id}`))
      .then(r => (r.ok ? r.json() : Promise.reject(r)))
      .then((data: Candidate[]) => setList(data))
      .catch(async (r: Response) => setError((await r.json().catch(() => ({})))?.error || 'Ошибка'))
      .finally(() => setLoading(false));
  }, [user]);

  // после отправки лайка — сразу убираем кандидата из списка
  const handleSent = () => {
    if (!selected) return;
    const goneId = selected.id;
    setList(prev => prev.filter(x => x.id !== goneId));
    setSelected(null);
  };

  if (!user) return <>No user</>;
  if (loading) return <div className="p-4">Загрузка…</div>;
  if (error) return <div className="p-4 text-red-600">{error}</div>;

  return (
    <div className="p-4 flex flex-col gap-2">
      <BackBar title="Поиск пары" fallbackHref="/main-menu" />
      <MatchTabs />

      {list.map(c => (
        <CandidateCard key={c.id} c={c} onLike={setSelected} />
      ))}
      {!list.length && <p className="text-center">Нет кандидатов</p>}

      <LikeModal
        open={!!selected}
        onClose={() => setSelected(null)}
        fromId={user.id}
        candidate={selected}
        onSent={handleSent}
      />
    </div>
  );
}
