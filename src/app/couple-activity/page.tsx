'use client';

import { useMemo, useState } from 'react';
import { useActivityOffers } from '@/client/hooks/useActivityOffers';
import { usePair } from '@/client/hooks/usePair';
import { toActivityCardVM, type ActivityCardVM } from '@/client/viewmodels';
import CoupleActivityView from '@/features/activities/CoupleActivityView';

type Tab = 'active' | 'suggested' | 'history';

export default function CoupleActivityPage() {
  const locale = 'ru';
  const [tab, setTab] = useState<Tab>('active');
  const [checkInFor, setCheckInFor] = useState<ActivityCardVM | null>(null);

  const { pairId } = usePair();
  const {
    active,
    suggested,
    history,
    loading,
    error,
    refetch,
    suggestNext,
    acceptActivity,
    cancelActivity,
    checkInActivity,
  } = useActivityOffers({
    pairId,
    enabled: Boolean(pairId),
  });

  const activeVm = useMemo(() => (active ? toActivityCardVM(active) : null), [active]);
  const suggestedVm = useMemo(() => suggested.map(toActivityCardVM), [suggested]);
  const historyVm = useMemo(() => history.map(toActivityCardVM), [history]);

  return (
    <CoupleActivityView
      tab={tab}
      loading={loading}
      error={error}
      locale={locale}
      active={activeVm}
      suggested={suggestedVm}
      history={historyVm}
      hasPair={Boolean(pairId)}
      onRetry={() => void refetch()}
      onSetTab={setTab}
      onSuggestNext={() => void suggestNext()}
      onAccept={(id) => void acceptActivity(id)}
      onCancel={(id) => void cancelActivity(id)}
      onOpenCheckIn={setCheckInFor}
      checkInFor={checkInFor}
      onCloseCheckIn={() => setCheckInFor(null)}
      onSubmitCheckIn={(activityId, answers) => {
        void checkInActivity(activityId, { answers }).then((done) => {
          if (done) {
            setCheckInFor(null);
          }
        });
      }}
    />
  );
}
