'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUserStore } from '@/store/useUserStore';
import CandidateCard from '@/components/CandidateCard';
import LikeModal from '@/components/LikeModal';
import { api } from '@/utils/api';
import { fetchEnvelope } from '@/utils/apiClient';
import MatchTabs from '@/components/MatchTabs';
import BackBar from '@/components/ui/BackBar';

interface Candidate {
  id: string;
  username: string;
  avatar: string;
  score: number;
}

type PairMeDTO = {
  pair: { _id?: string; status?: string } | null;
  hasActive: boolean;
};

type MatchCardDTO = {
  requirements: [string, string, string];
  give: [string, string, string];
  questions: [string, string];
  isActive: boolean;
  updatedAt?: string;
} | null;

export default function SearchPage() {
  const user = useUserStore((s) => s.user);
  const router = useRouter();

  const [list, setList] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<{ id: string; username: string; avatar: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!user) return;
    let on = true;

    (async () => {
      const [pairPayload, card] = await Promise.all([
        fetchEnvelope<PairMeDTO>(api('/api/pairs/me')),
        fetchEnvelope<MatchCardDTO>(api('/api/match/card')),
      ]);

      if (!on) return;

      if (pairPayload.hasActive) {
        router.replace('/couple-activity');
        return;
      }

      if (!card) {
        router.replace('/match-card/create');
        return;
      }

      setReady(true);
    })().catch(() => setReady(true));

    return () => {
      on = false;
    };
  }, [user, router]);

  useEffect(() => {
    if (!user || !ready) return;
    setLoading(true);
    setError(null);

    fetchEnvelope<Candidate[]>(api('/api/match/feed'))
      .then((items) => setList(Array.isArray(items) ? items : []))
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : 'Ошибка';
        setError(message);
      })
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
        candidate={selected}
        onSent={({ toId }) => {
          setList((xs) => xs.filter((x) => x.id !== toId));
          router.push('/match/inbox');
        }}
      />
    </div>
  );
}

