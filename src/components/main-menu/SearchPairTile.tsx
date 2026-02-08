'use client';

import { usePair } from '@/client/hooks/usePair';
import SearchPairTileView from './SearchPairTileView';

export default function SearchPairTile() {
  const { status } = usePair();

  const hasActive = status?.hasActive === true;
  const peer = status?.hasActive ? status.peer : undefined;

  return <SearchPairTileView hasActive={hasActive} peer={peer} />;
}
