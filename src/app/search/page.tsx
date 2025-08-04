'use client';

import { useEffect, useState } from 'react';
import { useUserStore }        from '@/store/useUserStore';
import CandidateCard           from '@/components/CandidateCard';

interface Candidate {
  id: string;
  username: string;
  avatar: string;
  score: number;
}

export default function SearchPage() {
  const user = useUserStore((s) => s.user);
  const [list, setList] = useState<Candidate[]>([]);

  useEffect(() => {
    if (!user) return;

    fetch(`/api/match/feed?userId=${user.id}`)
      .then((r) => r.json() as Promise<Candidate[]>)
      .then(setList);
  }, [user]);

  if (!user) return <>No user</>;

  return (
    <div className="p-4 flex flex-col gap-2">
      {list.map((c) => (
        <CandidateCard key={c.id} c={c} />
      ))}
      {!list.length && <p className="text-center">Нет кандидатов</p>}
    </div>
  );
}
