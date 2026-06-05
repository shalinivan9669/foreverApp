import {
  buildProfileCompletion,
  buildProfileMode,
  buildProfileNextStep,
  buildRelationshipContext,
  type PassportCompletionAxisInput,
} from '@/domain/services/userProfileSummary.service';

const assert = (condition: boolean, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

const emptyAxes = (): Record<string, PassportCompletionAxisInput> => ({
  communication: { dataStatus: 'missing', confidence: 0, evidenceCount: 0 },
  domestic: { dataStatus: 'missing', confidence: 0, evidenceCount: 0 },
  personalViews: { dataStatus: 'missing', confidence: 0, evidenceCount: 0 },
  finance: { dataStatus: 'missing', confidence: 0, evidenceCount: 0 },
  sexuality: { dataStatus: 'missing', confidence: 0, evidenceCount: 0 },
  psyche: { dataStatus: 'missing', confidence: 0, evidenceCount: 0 },
});

const axesWithThreeDataPoints = (): Record<string, PassportCompletionAxisInput> => ({
  ...emptyAxes(),
  communication: { dataStatus: 'enough', confidence: 0.7, evidenceCount: 5 },
  domestic: { dataStatus: 'low_confidence', confidence: 0.25, evidenceCount: 2 },
  finance: { dataStatus: 'enough', confidence: 0.8, evidenceCount: 7 },
});

const completedPersonal = {
  gender: 'female' as const,
  age: 28,
  city: 'Алматы',
  relationshipStatus: 'seeking' as const,
};

const completedPreferences = {
  desiredAgeRange: { min: 24, max: 35 },
  maxDistanceKm: 30,
};

const completedMatchCard = {
  requirements: ['Честность', 'Диалог', 'Уважение'],
  give: ['Поддержка', 'Время', 'Забота'],
  questions: ['Что для тебя близость?', 'Как ты решаешь конфликты?'],
  isActive: true,
};

const buildCompletion = (input: {
  hasPair?: boolean;
  personal?: typeof completedPersonal;
  matchCard?: typeof completedMatchCard | null;
  passportAxes?: Record<string, PassportCompletionAxisInput>;
}) => {
  const relationshipContext = buildRelationshipContext({
    activeOrPausedPair: input.hasPair
      ? {
          id: 'pair-1',
          status: 'active',
          createdAt: '2026-06-01T00:00:00.000Z',
        }
      : null,
    lastAnyPair: null,
    now: new Date('2026-06-05T00:00:00.000Z'),
  });
  const mode = buildProfileMode(relationshipContext);

  return {
    mode,
    relationshipContext,
    completion: buildProfileCompletion({
      mode,
      relationshipContext,
      personal: input.personal,
      preferences: input.personal ? completedPreferences : {},
      matchCard: input.matchCard,
      passportAxes: input.passportAxes ?? emptyAxes(),
    }),
  };
};

const soloNewContext = buildRelationshipContext({
  activeOrPausedPair: null,
  lastAnyPair: null,
});
const soloNewMode = buildProfileMode(soloNewContext);
assert(soloNewMode.status === 'solo_new', 'solo_new status expected');
const soloNewCompletion = buildProfileCompletion({
  mode: soloNewMode,
  relationshipContext: soloNewContext,
  personal: {},
  preferences: {},
  matchCard: null,
  passportAxes: emptyAxes(),
});
const soloNewNextStep = buildProfileNextStep({
  mode: soloNewMode,
  completion: soloNewCompletion,
  relationshipContext: soloNewContext,
});
assert(
  soloNewNextStep.kind === 'complete_account',
  'solo_new should start with complete_account when account is empty'
);

const soloCardContext = buildRelationshipContext({
  activeOrPausedPair: null,
  lastAnyPair: null,
});
const soloCardMode = buildProfileMode(soloCardContext);
const soloCardCompletion = buildProfileCompletion({
  mode: soloCardMode,
  relationshipContext: soloCardContext,
  personal: completedPersonal,
  preferences: completedPreferences,
  matchCard: null,
  passportAxes: emptyAxes(),
});
assert(
  buildProfileNextStep({
    mode: soloCardMode,
    completion: soloCardCompletion,
    relationshipContext: soloCardContext,
  }).kind === 'create_match_card',
  'solo_new should ask for match card after account completion'
);

const soloHistoryMode = buildProfileMode(
  buildRelationshipContext({
    activeOrPausedPair: null,
    lastAnyPair: {
      id: 'old-pair',
      status: 'ended',
      createdAt: '2026-05-01T00:00:00.000Z',
    },
  })
);
assert(soloHistoryMode.status === 'solo_with_history', 'solo_with_history status expected');

const activeContext = buildRelationshipContext({
  activeOrPausedPair: {
    id: 'active-pair',
    status: 'active',
    createdAt: '2026-06-01T00:00:00.000Z',
  },
  lastAnyPair: null,
  now: new Date('2026-06-05T00:00:00.000Z'),
});
const activeMode = buildProfileMode(activeContext);
const activeCompletion = buildProfileCompletion({
  mode: activeMode,
  relationshipContext: activeContext,
  personal: completedPersonal,
  preferences: completedPreferences,
  matchCard: completedMatchCard,
  passportAxes: axesWithThreeDataPoints(),
});
const activeNextStep = buildProfileNextStep({
  mode: activeMode,
  completion: activeCompletion,
  relationshipContext: activeContext,
});
assert(activeMode.status === 'paired_active', 'paired_active status expected');
assert(activeContext.currentPair?.status === 'active', 'active currentPair expected');
assert(
  activeContext.currentPair?.daysTogether === 4,
  'daysTogether should be calculated'
);
assert(activeNextStep.kind === 'open_pair', 'paired_active should open pair');

const pausedContext = buildRelationshipContext({
  activeOrPausedPair: {
    id: 'paused-pair',
    status: 'paused',
    createdAt: '2026-06-01T00:00:00.000Z',
  },
  lastAnyPair: null,
});
const pausedMode = buildProfileMode(pausedContext);
const pausedCompletion = buildProfileCompletion({
  mode: pausedMode,
  relationshipContext: pausedContext,
  personal: completedPersonal,
  preferences: completedPreferences,
  matchCard: completedMatchCard,
  passportAxes: axesWithThreeDataPoints(),
});
const pausedNextStep = buildProfileNextStep({
  mode: pausedMode,
  completion: pausedCompletion,
  relationshipContext: pausedContext,
});
assert(pausedMode.status === 'paired_paused', 'paired_paused status expected');
assert(pausedContext.currentPair?.status === 'paused', 'paused currentPair expected');
assert(pausedNextStep.kind === 'resume_pair', 'paired_paused should resume pair');

const emptyCompletion = buildCompletion({}).completion;
const accountCompletion = buildCompletion({ personal: completedPersonal }).completion;
const fullSoloCompletion = buildCompletion({
  personal: completedPersonal,
  matchCard: completedMatchCard,
  passportAxes: axesWithThreeDataPoints(),
}).completion;
assert(emptyCompletion.score < 25, 'empty profile should have low score');
assert(
  accountCompletion.score > emptyCompletion.score,
  'completed account should increase score'
);
assert(
  fullSoloCompletion.sections.matchCard.completed,
  'completed matchCard should be completed'
);
assert(
  fullSoloCompletion.sections.passport.completed,
  'passport with 3+ axes should be completed'
);
assert(fullSoloCompletion.missing.length <= 5, 'missing should be limited to 5 items');
for (const item of fullSoloCompletion.missing) {
  assert(item.key.length > 0, 'missing item key expected');
  assert(item.label.length > 0, 'missing item label expected');
  assert(item.href.length > 0, 'missing item href expected');
}

console.log('user-profile-summary selfcheck passed');
