'use client';

import QuestionnaireCard from '@/components/QuestionnaireCard';
import LoadingView from '@/components/ui/LoadingView';
import type {
  QuestionnaireCardVM,
  QuestionnaireScopeVM,
} from '@/client/viewmodels/questionnaire.viewmodels';

type QuestionnairesPageViewProps = {
  activeTab: QuestionnaireScopeVM;
  onChangeTab: (tab: QuestionnaireScopeVM) => void;
  canAccessCouple: boolean;
  personalCards: QuestionnaireCardVM[];
  coupleCards: QuestionnaireCardVM[];
  loadingCards: boolean;
  loadFailed: boolean;
  loadingByQuestionnaireId: Record<string, boolean>;
  onStartQuestionnaire: (questionnaire: QuestionnaireCardVM) => Promise<void> | void;
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
  loadFailed,
  loadingByQuestionnaireId,
  onStartQuestionnaire,
}: QuestionnairesPageViewProps) {
  const cards = activeTab === 'personal' ? personalCards : coupleCards;
  const coupleLockedMessage = 'Доступно после создания активной пары.';

  return (
    <div className="app-page-stack">
      <div className="app-panel-soft flex flex-wrap items-center gap-2 p-2" role="tablist" aria-label="Тип анкеты">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'personal'}
          className={tabClassName(activeTab === 'personal')}
          onClick={() => onChangeTab('personal')}
        >
          Персональные
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'couple'}
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

      <div className="app-collection-grid">
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

      {!loadingCards && !loadFailed && cards.length === 0 && (
        <p className="app-muted text-sm">
          {activeTab === 'personal' ? 'Нет персональных анкет.' : 'Нет парных анкет.'}
        </p>
      )}
    </div>
  );
}
