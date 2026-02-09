'use client';

import QuestionnaireCard from '@/components/QuestionnaireCard';
import type { QuestionnaireCardDTO, QuestionnaireScope } from '@/client/api/types';
import LoadingView from '@/components/ui/LoadingView';

type QuestionnairesPageViewProps = {
  activeTab: QuestionnaireScope;
  onChangeTab: (tab: QuestionnaireScope) => void;
  canAccessCouple: boolean;
  personalCards: QuestionnaireCardDTO[];
  coupleCards: QuestionnaireCardDTO[];
  loadingCards: boolean;
  loadingByQuestionnaireId: Record<string, boolean>;
  onStartQuestionnaire: (questionnaire: QuestionnaireCardDTO) => Promise<void> | void;
};

const tabClassName = (active: boolean, disabled = false): string => {
  if (disabled) return 'app-btn-secondary cursor-not-allowed rounded px-3 py-1.5 text-sm text-slate-400';
  if (active) return 'app-btn-primary rounded px-3 py-1.5 text-sm text-white';
  return 'app-btn-secondary rounded px-3 py-1.5 text-sm text-slate-800';
};

export default function QuestionnairesPageView({
  activeTab,
  onChangeTab,
  canAccessCouple,
  personalCards,
  coupleCards,
  loadingCards,
  loadingByQuestionnaireId,
  onStartQuestionnaire,
}: QuestionnairesPageViewProps) {
  const cards = activeTab === 'personal' ? personalCards : coupleCards;
  const coupleLockedMessage = 'Доступно после создания активной пары.';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={tabClassName(activeTab === 'personal')} onClick={() => onChangeTab('personal')}>
          Персональные
        </button>
        <button
          type="button"
          className={tabClassName(activeTab === 'couple', !canAccessCouple)}
          onClick={() => {
            if (!canAccessCouple) return;
            onChangeTab('couple');
          }}
          disabled={!canAccessCouple}
          title={!canAccessCouple ? coupleLockedMessage : undefined}
        >
          Для пары
        </button>
      </div>

      {!canAccessCouple && activeTab === 'couple' && (
        <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {coupleLockedMessage}
        </div>
      )}

      {loadingCards && cards.length === 0 && <LoadingView compact label="Загрузка анкет..." />}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((questionnaire) => {
          const isCoupleBlocked = questionnaire.scope === 'couple' && !canAccessCouple;
          return (
            <QuestionnaireCard
              key={questionnaire.id}
              q={questionnaire}
              loading={Boolean(loadingByQuestionnaireId[questionnaire.id])}
              disabled={isCoupleBlocked}
              disabledReason={isCoupleBlocked ? coupleLockedMessage : undefined}
              onStart={onStartQuestionnaire}
            />
          );
        })}
      </div>

      {!loadingCards && cards.length === 0 && (
        <p className="app-muted text-sm">
          {activeTab === 'personal' ? 'Нет персональных анкет.' : 'Нет парных анкет.'}
        </p>
      )}
    </div>
  );
}
