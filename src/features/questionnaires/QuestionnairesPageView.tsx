'use client';

import QuestionnaireCard from '@/components/QuestionnaireCard';
import type { ReactNode } from 'react';
import { MeasurementCatalog } from '@/features/measurements/MeasurementPages';
import AssessmentHubPage from '@/features/assessments/AssessmentHubPage';
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
  legacyErrors?: ReactNode;
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
  legacyErrors,
}: QuestionnairesPageViewProps) {
  const cards = activeTab === 'personal' ? personalCards : coupleCards;
  const coupleLockedMessage = 'Доступно после создания активной пары.';

  return (
    <div className="app-page-stack">
      <AssessmentHubPage embedded />
      <details className="app-panel p-4">
        <summary className="cursor-pointer text-lg font-semibold">Прежние короткие анкеты и результаты</summary>
        <div className="mt-4 space-y-4">
          <p className="app-muted">Здесь сохранены прежние персональные и парные анкеты, включая короткие самооценки по шести областям. Их ответы и характеристики хранятся отдельно от результатов новых анкет выше.</p>
          {legacyErrors}
      <MeasurementCatalog />
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
      </details>
    </div>
  );
}
