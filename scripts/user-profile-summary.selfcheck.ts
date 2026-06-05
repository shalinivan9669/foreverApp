import {
  buildProfileCompletion,
  buildProfileMode,
  buildProfileNextStep,
  buildRelationshipContext,
  type PassportCompletionAxisInput,
} from '@/domain/services/userProfileSummary.service';
import {
  buildContribution,
  buildMyActivityState,
  buildPairedProfileNextStep,
  buildPairedProfileState,
  buildResourceMessage,
} from '@/domain/services/pairedUserProfileState.service';
import {
  buildExperienceSummary,
  buildNeedsAndBoundariesLite,
  buildPartnerHelpfulNotes,
  buildPersonalAxisCards,
  type ProfileExperienceAxisInput,
} from '@/domain/services/profileExperience.service';

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

const experienceAxes = (): Record<
  'communication' | 'domestic' | 'personalViews' | 'finance' | 'sexuality' | 'psyche',
  ProfileExperienceAxisInput
> => ({
  communication: {
    level: 70,
    confidenceLabel: 'high',
    positives: ['direct', 'clear'],
    negatives: [],
    dataStatus: 'enough',
  },
  domestic: {
    level: 40,
    confidenceLabel: 'medium',
    positives: [],
    negatives: ['routine', 'planning'],
    dataStatus: 'enough',
  },
  personalViews: {
    level: 50,
    confidenceLabel: 'medium',
    positives: ['values'],
    negatives: ['expectations'],
    dataStatus: 'enough',
  },
  finance: {
    level: 0,
    confidenceLabel: 'low',
    positives: [],
    negatives: [],
    dataStatus: 'missing',
  },
  sexuality: {
    level: 55,
    confidenceLabel: 'medium',
    positives: ['clarity'],
    negatives: [],
    dataStatus: 'enough',
  },
  psyche: {
    level: 60,
    confidenceLabel: 'medium',
    positives: ['pause'],
    negatives: [],
    dataStatus: 'enough',
  },
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

assert(
  buildPairedProfileNextStep({
    mode: soloNewMode,
    completion: soloNewCompletion,
    pairedProfileState: null,
  }) === null,
  'solo user should not have pairedProfileState next step'
);

const pairedNoWeeklyState = buildPairedProfileState({
  pairId: 'active-pair',
  pairStatus: 'active',
  weeklySummary: {
    pairId: 'active-pair',
    weekKey: '2026-W23',
    currentUser: { userId: 'u1', submitted: false },
    peer: { userId: 'u2', submitted: false },
    pair: {
      submittedCount: 0,
      bothSubmitted: false,
      unresolvedTopicCount: 0,
      hasDivergence: false,
      status: 'missing',
    },
  },
  myActivityState: buildMyActivityState(null),
});
assert(pairedNoWeeklyState.myWeeklyCheckIn.submitted === false, 'weekly should be missing');
assert(
  pairedNoWeeklyState.pairWeeklyCheckIn.status === 'missing',
  'pair weekly status should be missing'
);
assert(
  buildPairedProfileNextStep({
    mode: activeMode,
    completion: activeCompletion,
    pairedProfileState: pairedNoWeeklyState,
  })?.kind === 'weekly_checkin',
  'paired active without weekly should ask for weekly_checkin'
);

const feedbackActivity = buildMyActivityState({
  hasCurrentActivity: true,
  currentActivityId: 'activity-1',
  currentActivityTitle: 'Activity',
  status: 'awaiting_checkin',
  currentUserRole: 'A',
  submittedBy: ['B'],
});
const pairedFeedbackState = buildPairedProfileState({
  pairId: 'active-pair',
  pairStatus: 'active',
  weeklySummary: {
    pairId: 'active-pair',
    weekKey: '2026-W23',
    currentUser: {
      userId: 'u1',
      submitted: true,
      readiness: 0.6,
      fatigue: 0.3,
      closeness: 0.7,
      irritation: 0.2,
    },
    peer: { userId: 'u2', submitted: true },
    pair: {
      submittedCount: 2,
      bothSubmitted: true,
      unresolvedTopicCount: 0,
      hasDivergence: false,
      status: 'complete',
    },
  },
  myActivityState: feedbackActivity,
});
assert(
  buildPairedProfileNextStep({
    mode: activeMode,
    completion: activeCompletion,
    pairedProfileState: pairedFeedbackState,
  })?.kind === 'activity_feedback',
  'activity awaiting my feedback should be next'
);
assert(
  pairedFeedbackState.contribution.pendingFromMe.includes('Оставить feedback по активности'),
  'pendingFromMe should contain feedback'
);

const openActivityState = buildPairedProfileState({
  pairId: 'active-pair',
  pairStatus: 'active',
  weeklySummary: {
    pairId: 'active-pair',
    weekKey: '2026-W23',
    currentUser: { userId: 'u1', submitted: true, readiness: 0.6, fatigue: 0.3 },
    peer: { userId: 'u2', submitted: true },
    pair: {
      submittedCount: 2,
      bothSubmitted: true,
      unresolvedTopicCount: 0,
      hasDivergence: false,
      status: 'complete',
    },
  },
  myActivityState: buildMyActivityState({
    hasCurrentActivity: true,
    currentActivityId: 'activity-2',
    currentActivityTitle: 'Activity',
    status: 'in_progress',
  }),
});
assert(
  buildPairedProfileNextStep({
    mode: activeMode,
    completion: activeCompletion,
    pairedProfileState: openActivityState,
  })?.kind === 'open_activity',
  'current activity should become open_activity next step'
);

const noPendingState = buildPairedProfileState({
  pairId: 'active-pair',
  pairStatus: 'active',
  weeklySummary: {
    pairId: 'active-pair',
    weekKey: '2026-W23',
    currentUser: { userId: 'u1', submitted: true, readiness: 0.6, fatigue: 0.3 },
    peer: { userId: 'u2', submitted: true },
    pair: {
      submittedCount: 2,
      bothSubmitted: true,
      unresolvedTopicCount: 0,
      hasDivergence: false,
      status: 'complete',
    },
  },
  myActivityState: buildMyActivityState(null),
});
assert(
  buildPairedProfileNextStep({
    mode: activeMode,
    completion: activeCompletion,
    pairedProfileState: noPendingState,
  })?.kind === 'open_pair',
  'paired active without pending actions should open pair'
);
assert(
  buildPairedProfileNextStep({
    mode: pausedMode,
    completion: pausedCompletion,
    pairedProfileState: { ...noPendingState, pairStatus: 'paused' },
  })?.kind === 'resume_pair',
  'paired paused should keep resume_pair'
);

assert(buildResourceMessage({ submitted: false }).tone === 'low_data', 'low_data expected');
assert(
  buildResourceMessage({ submitted: true, fatigue: 0.8, readiness: 0.5 }).tone === 'tired',
  'tired expected for high fatigue'
);
assert(
  buildResourceMessage({ submitted: true, fatigue: 0.2, readiness: 0.3 }).tone === 'tired',
  'tired expected for low readiness'
);
assert(
  buildResourceMessage({ submitted: true, fatigue: 0.2, readiness: 0.7, irritation: 0.7 })
    .tone === 'tense',
  'tense expected for high irritation'
);
assert(
  buildResourceMessage({ submitted: true, fatigue: 0.2, readiness: 0.7, irritation: 0.2 })
    .tone === 'stable',
  'stable expected for normal values'
);

const contribution = buildContribution({
  myWeeklySubmitted: true,
  bothSubmitted: true,
  awaitsMyFeedback: false,
});
assert(contribution.score >= 0 && contribution.score <= 100, 'contribution score range');
assert(
  contribution.level === 'low' ||
    contribution.level === 'stable' ||
    contribution.level === 'strong',
  'contribution level expected'
);
assert(
  contribution.pendingFromMe.every((item) => item.trim().length > 0),
  'pendingFromMe should not contain empty strings'
);
assert(
  contribution.completedThisWeek.every((item) => item.trim().length > 0),
  'completedThisWeek should not contain empty strings'
);

const personalAxisCards = buildPersonalAxisCards(experienceAxes());
assert(personalAxisCards.length === 6, 'six personal axis cards expected');
assert(
  personalAxisCards.find((card) => card.axis === 'finance')?.status === 'low_data',
  'missing axis should be low_data'
);
assert(
  personalAxisCards.find((card) => card.axis === 'communication')?.status === 'strength',
  'two positives should produce strength'
);
assert(
  personalAxisCards.find((card) => card.axis === 'domestic')?.status === 'growth',
  'two negatives should produce growth'
);
assert(
  personalAxisCards.find((card) => card.axis === 'personalViews')?.status === 'balanced',
  'mixed axis should produce balanced'
);
assert(
  personalAxisCards.every((card) => card.label.trim().length > 0),
  'axis labels should be non-empty'
);

const soloEmptyExperience = buildExperienceSummary({
  mode: soloNewMode,
  completion: soloNewCompletion,
  pairedProfileState: null,
  nextStep: soloNewNextStep,
});
assert(soloEmptyExperience.tone === 'empty', 'empty solo experience expected');
assert(
  soloEmptyExperience.primaryAction.href === soloNewNextStep.href,
  'solo experience should use next step action'
);

const soloMissingCardExperience = buildExperienceSummary({
  mode: soloCardMode,
  completion: soloCardCompletion,
  pairedProfileState: null,
  nextStep: buildProfileNextStep({
    mode: soloCardMode,
    completion: soloCardCompletion,
    relationshipContext: soloCardContext,
  }),
});
assert(
  soloMissingCardExperience.tone === 'attention',
  'missing match card should need attention'
);

const noWeeklyExperience = buildExperienceSummary({
  mode: activeMode,
  completion: activeCompletion,
  pairedProfileState: pairedNoWeeklyState,
  nextStep: buildPairedProfileNextStep({
    mode: activeMode,
    completion: activeCompletion,
    pairedProfileState: pairedNoWeeklyState,
  }) as NonNullable<ReturnType<typeof buildPairedProfileNextStep>>,
});
assert(noWeeklyExperience.tone === 'attention', 'missing weekly should need attention');
assert(
  noWeeklyExperience.primaryAction.href === '/profile#weekly-checkin',
  'missing weekly should link to check-in'
);

const tiredState = {
  ...noPendingState,
  resourceMessage: buildResourceMessage({
    submitted: true,
    readiness: 0.4,
    fatigue: 0.8,
  }),
};
const tiredExperience = buildExperienceSummary({
  mode: activeMode,
  completion: activeCompletion,
  pairedProfileState: tiredState,
  nextStep: activeNextStep,
});
assert(tiredExperience.tone === 'attention', 'tired experience should need attention');

const tenseState = {
  ...noPendingState,
  resourceMessage: buildResourceMessage({
    submitted: true,
    readiness: 0.8,
    fatigue: 0.2,
    irritation: 0.8,
  }),
};
const tenseExperience = buildExperienceSummary({
  mode: activeMode,
  completion: activeCompletion,
  pairedProfileState: tenseState,
  nextStep: activeNextStep,
});
assert(tenseExperience.tone === 'warning', 'tense experience should warn softly');

const stableExperience = buildExperienceSummary({
  mode: activeMode,
  completion: activeCompletion,
  pairedProfileState: noPendingState,
  nextStep: activeNextStep,
});
assert(stableExperience.tone === 'good', 'stable experience should be good');

const pausedExperience = buildExperienceSummary({
  mode: pausedMode,
  completion: pausedCompletion,
  pairedProfileState: { ...noPendingState, pairStatus: 'paused' },
  nextStep: pausedNextStep,
});
assert(pausedExperience.tone === 'calm', 'paused experience should be calm');

const lowDataExperienceAxes = experienceAxes();
for (const axis of Object.keys(lowDataExperienceAxes) as Array<
  keyof typeof lowDataExperienceAxes
>) {
  lowDataExperienceAxes[axis] = {
    level: 0,
    confidenceLabel: 'low',
    positives: [],
    negatives: [],
    dataStatus: 'missing',
  };
}

const lowDataNotes = buildPartnerHelpfulNotes({
  mode: soloNewMode,
  pairedProfileState: null,
  personalAxisCards: buildPersonalAxisCards(lowDataExperienceAxes),
});
assert(lowDataNotes.items.length === 1, 'low data should return one safe note');
assert(
  lowDataNotes.disclaimer.includes('только тебе'),
  'helpful notes disclaimer should state private visibility'
);

const tiredNotes = buildPartnerHelpfulNotes({
  mode: activeMode,
  pairedProfileState: tiredState,
  personalAxisCards,
});
assert(
  tiredNotes.items.some((item) => item.includes('короткого разговора')),
  'tired notes should recommend a short conversation'
);
assert(tiredNotes.items.length <= 5, 'helpful notes should be limited to five');
assert(tiredNotes.items.every((item) => item.trim().length > 0), 'notes should be non-empty');

const tiredNeeds = buildNeedsAndBoundariesLite({
  mode: activeMode,
  pairedProfileState: tiredState,
  personalAxisCards,
});
assert(
  tiredNeeds.items.some((item) => item.includes('коротких и спокойных')),
  'tired needs should prefer short calm actions'
);

const tenseNeeds = buildNeedsAndBoundariesLite({
  mode: activeMode,
  pairedProfileState: tenseState,
  personalAxisCards,
});
assert(
  tenseNeeds.items.some((item) => item.includes('без обвинений')),
  'tense needs should avoid blame'
);

const soloNeeds = buildNeedsAndBoundariesLite({
  mode: soloNewMode,
  pairedProfileState: null,
  personalAxisCards: lowDataNotes.items.length ? [] : personalAxisCards,
});
assert(soloNeeds.items.length > 0, 'solo needs fallback should be non-empty');

const generatedText = JSON.stringify({
  personalAxisCards,
  soloEmptyExperience,
  soloMissingCardExperience,
  noWeeklyExperience,
  tiredExperience,
  tenseExperience,
  stableExperience,
  pausedExperience,
  lowDataNotes,
  tiredNotes,
  tiredNeeds,
  tenseNeeds,
  soloNeeds,
}).toLowerCase();
const forbiddenPhrases = [
  'диагноз',
  'депрессия',
  'тревожность',
  'лечиться',
  'токсичный',
  'психическое расстройство',
  'партнёр должен',
  'ты обязан',
];
for (const phrase of forbiddenPhrases) {
  assert(!generatedText.includes(phrase), `forbidden wording found: ${phrase}`);
}

console.log('user-profile-summary selfcheck passed');
