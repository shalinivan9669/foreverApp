'use client';

import { useParams } from 'next/navigation';
import PairProfilePageClient from '@/features/pair/PairProfilePageClient';

export default function PairProfileByIdPage() {
  const params = useParams<{ id: string }>();
  const pairId = params?.id;

  return <PairProfilePageClient pairIdFromRoute={pairId} />;
}
