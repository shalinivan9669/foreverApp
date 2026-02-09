'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import BackBar from '@/components/ui/BackBar';
import ErrorView from '@/components/ui/ErrorView';
import { ApiClientError } from '@/client/api/errors';
import { questionnairesApi } from '@/client/api/questionnaires.api';
import type { QuestionnaireCardDTO, QuestionnaireScope } from '@/client/api/types';
import { usePair } from '@/client/hooks/usePair';
import { useQuestionnaires } from '@/client/hooks/useQuestionnaires';
import { useApi } from '@/client/hooks/useApi';
import QuestionnairesPageView from '@/features/questionnaires/QuestionnairesPageView';

export default function QuestionnairesPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<QuestionnaireScope>('personal');
  const [loadingByQuestionnaireId, setLoadingByQuestionnaireId] = useState<Record<string, boolean>>({});

  const { cards, loading: loadingCards, refetch } = useQuestionnaires();
  const { pairId, status } = usePair();
  const { error, clearError, setErrorFromException } = useApi('questionnaire-start');

  const hasPair = Boolean(pairId || (status && status.hasActive));

  const personalCards = useMemo(
    () => cards.filter((card) => card.scope === 'personal'),
    [cards]
  );
  const coupleCards = useMemo(
    () => cards.filter((card) => card.scope === 'couple'),
    [cards]
  );

  useEffect(() => {
    if (activeTab === 'couple' && !hasPair) {
      setActiveTab('personal');
    }
  }, [activeTab, hasPair]);

  const setItemLoading = useCallback((questionnaireId: string, loading: boolean) => {
    setLoadingByQuestionnaireId((prev) => ({
      ...prev,
      [questionnaireId]: loading,
    }));
  }, []);

  const startQuestionnaire = useCallback(
    async (questionnaire: QuestionnaireCardDTO) => {
      clearError();
      setItemLoading(questionnaire.id, true);

      try {
        if (questionnaire.scope === 'couple') {
          if (!pairId) {
            throw new ApiClientError({
              status: 403,
              code: 'ACCESS_DENIED',
              message: 'Парная анкета доступна только участникам активной пары.',
            });
          }

          await questionnairesApi.startCoupleQuestionnaire(pairId, questionnaire.id);
          router.push(`/pair/${pairId}/questionnaire/${questionnaire.id}`);
          return;
        }

        await questionnairesApi.startPersonalQuestionnaire(questionnaire.id);
        router.push(`/questionnaire/${questionnaire.id}`);
      } catch (caughtError) {
        const normalized =
          caughtError instanceof Error ? caughtError : new Error('Не удалось запустить анкету');
        setErrorFromException(normalized);
      } finally {
        setItemLoading(questionnaire.id, false);
      }
    },
    [clearError, pairId, router, setErrorFromException, setItemLoading]
  );

  return (
    <div className="mx-auto w-full max-w-6xl p-3 sm:p-4 lg:p-6">
      <BackBar title="Анкеты" fallbackHref="/main-menu" />
      <h1 className="mb-4 text-lg font-semibold sm:text-xl">Анкеты</h1>

      <ErrorView
        error={error}
        onRetry={() => {
          void refetch();
        }}
        onAuthRequired={() => {
          router.push('/');
        }}
      />

      <QuestionnairesPageView
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        canAccessCouple={hasPair}
        personalCards={personalCards}
        coupleCards={coupleCards}
        loadingCards={loadingCards}
        loadingByQuestionnaireId={loadingByQuestionnaireId}
        onStartQuestionnaire={startQuestionnaire}
      />
    </div>
  );
}
