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
  const coupleLockedMessage = 'Р вЂќР С•РЎРѓРЎвЂљРЎС“Р С—Р Р…Р С• Р С—Р С•РЎРѓР В»Р Вµ РЎРѓР С•Р В·Р Т‘Р В°Р Р…Р С‘РЎРЏ Р В°Р С”РЎвЂљР С‘Р Р†Р Р…Р С•Р в„– Р С—Р В°РЎР‚РЎвЂ№.';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={tabClassName(activeTab === 'personal')}
          onClick={() => onChangeTab('personal')}
        >
          Р СџР ВµРЎР‚РЎРѓР С•Р Р…Р В°Р В»РЎРЉР Р…РЎвЂ№Р Вµ
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
          Р вЂќР В»РЎРЏ Р С—Р В°РЎР‚РЎвЂ№
        </button>
      </div>

      {!canAccessCouple && activeTab === 'couple' && (
        <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {coupleLockedMessage}
        </div>
      )}

      {loadingCards && cards.length === 0 && <LoadingView compact label="Р вЂ”Р В°Р С–РЎР‚РЎС“Р В·Р С”Р В° Р В°Р Р…Р С”Р ВµРЎвЂљ..." />}

      <div className="grid gap-4 md:grid-cols-2">
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
          {activeTab === 'personal'
            ? 'Р СњР ВµРЎвЂљ Р С—Р ВµРЎР‚РЎРѓР С•Р Р…Р В°Р В»РЎРЉР Р…РЎвЂ№РЎвЂ¦ Р В°Р Р…Р С”Р ВµРЎвЂљ.'
            : 'Р СњР ВµРЎвЂљ Р С—Р В°РЎР‚Р Р…РЎвЂ№РЎвЂ¦ Р В°Р Р…Р С”Р ВµРЎвЂљ.'}
        </p>
      )}
    </div>
  );
}

