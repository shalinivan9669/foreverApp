import { DomainError } from '@/domain/errors';
import { disclosePairEvaluation } from '@/domain/model/privacy/disclosure';
import type {
  PairFactorEvaluationSnapshot as DomainPairFactorEvaluationSnapshot,
} from '@/domain/model/snapshots/snapshots';
import type { FactorValue } from '@/domain/model/values/factorValue';
import { emitEvent } from '@/lib/audit/emitEvent';
import type { AuditRequestContext } from '@/lib/audit/eventTypes';
import { toUserDTO, type UserDTO } from '@/lib/dto/user.dto';
import { connectToDatabase } from '@/lib/mongodb';
import { Like } from '@/models/Like';
import { MvpOnboardingSession } from '@/models/MvpOnboardingSession';
import { Notification } from '@/models/Notification';
import { Pair } from '@/models/Pair';
import { PairActivity, type PairActivityType } from '@/models/PairActivity';
import { PairQuestionnaireAnswer } from '@/models/PairQuestionnaireAnswer';
import { PairStateSnapshot } from '@/models/PairStateSnapshot';
import { PartnerSignal } from '@/models/PartnerSignal';
import { PersonalDailyCheckIn } from '@/models/PersonalDailyCheckIn';
import { PersonalQuestionnaireSubmission } from '@/models/PersonalQuestionnaireSubmission';
import { SafetyGate } from '@/models/SafetyGate';
import {
  User,
  type UserType,
} from '@/models/User';
import { WeeklyCheckIn } from '@/models/WeeklyCheckIn';
import {
  EvidenceEvent,
  type EvidenceEventType,
} from '@/models/EvidenceEvent';
import {
  IndividualFactorSnapshot,
  type IndividualFactorSnapshotType,
} from '@/models/IndividualFactorSnapshot';
import {
  PairFactorEvaluationSnapshot,
  type PairFactorEvaluationSnapshotType,
} from '@/models/PairFactorEvaluationSnapshot';
import {
  fromStoredFactorValue,
  type StoredFactorValue,
} from '@/models/factorEngineSchemas';

const EXPORT_LIMITS = {
  onboardingSessions: 10,
  personalDailyCheckIns: 366,
  weeklyCheckIns: 104,
  personalQuestionnaireSubmissions: 200,
  pairMemberships: 100,
  pairStateSummaries: 200,
  sharedActivities: 250,
  pairQuestionnaireAnswers: 500,
  partnerSignals: 500,
  matchInteractions: 250,
  safetySettings: 100,
  notifications: 250,
  factorEvidenceEvents: 250,
  individualFactorSnapshots: 250,
  pairFactorEvaluationSummaries: 250,
} as const;

const NESTED_EXPORT_LIMITS = {
  onboardingAnswersPerSession: 200,
  onboardingMultiSelectOptions: 50,
  dailyCustomTags: 12,
  snapshotReasonCodes: 10,
  snapshotSignals: 4,
  questionnaireAnswersPerSubmission: 100,
  factorValueSetItems: 50,
  factorSnapshotEvidenceIds: 100,
} as const;

const MAX_EXPORT_TEXT_CHARS = 4_000;
const MAX_EXPORT_ID_CHARS = 256;

const FACTOR_ENGINE_EXPORT_MANIFEST = {
  manifestVersion: 'factor-engine-privacy-manifest-v1',
  projectionVersion: 'factor-engine-owner-export-v1',
  disclosurePolicyVersion: 'central-factor-disclosure-v1',
  ownerEvidenceScope: 'SELF_SUBJECT_AND_ACTOR_ONLY',
  ownerEvidenceProvenance: 'SOURCE_AND_POLICY_METADATA_INCLUDED',
  ownerSnapshotScope: 'SELF_SUBJECT_ONLY',
  pairEvaluationScope: 'CENTRAL_PAIR_MEMBER_SUMMARY_ONLY',
  bounds: {
    evidenceEvents: EXPORT_LIMITS.factorEvidenceEvents,
    individualFactorSnapshots: EXPORT_LIMITS.individualFactorSnapshots,
    pairEvaluationSummaries: EXPORT_LIMITS.pairFactorEvaluationSummaries,
    pairContexts: EXPORT_LIMITS.pairMemberships,
    evidenceIdsPerSnapshot:
      NESTED_EXPORT_LIMITS.factorSnapshotEvidenceIds,
    setValuesPerFactorValue: NESTED_EXPORT_LIMITS.factorValueSetItems,
    maxTextChars: MAX_EXPORT_TEXT_CHARS,
    maxIdentifierChars: MAX_EXPORT_ID_CHARS,
  },
  excluded: [
    'partner and observer evidence',
    'partner individual factor snapshots and raw values',
    'pair member and source snapshot identifiers',
    'pair raw values, exact confidence, fit metrics, evidence links, and hashes',
  ],
} as const;

const boundedText = (
  value: string | null | undefined,
  limit = MAX_EXPORT_TEXT_CHARS
): string => String(value ?? '').slice(0, limit);

const boundedTextArray = (
  values: readonly string[],
  itemLimit: number,
  itemCharLimit = MAX_EXPORT_TEXT_CHARS
): string[] =>
  values
    .slice(0, itemLimit)
    .map((value) => boundedText(value, itemCharLimit));

const boundedFactorValue = (stored: StoredFactorValue): FactorValue => {
  const value = fromStoredFactorValue(stored);
  switch (value.kind) {
    case 'CATEGORY':
    case 'CONSTRAINT':
      return {
        kind: value.kind,
        value: boundedText(value.value, MAX_EXPORT_ID_CHARS),
      };
    case 'ORDINAL':
      return {
        kind: value.kind,
        value: boundedText(value.value, MAX_EXPORT_ID_CHARS),
        rank: value.rank,
      };
    case 'SET':
      return {
        kind: value.kind,
        values: boundedTextArray(
          value.values,
          NESTED_EXPORT_LIMITS.factorValueSetItems,
          MAX_EXPORT_ID_CHARS
        ),
      };
    case 'TEXT':
      return { kind: value.kind, value: boundedText(value.value) };
    default:
      return value;
  }
};

const toDomainPairEvaluationSnapshot = (
  row: PairFactorEvaluationSnapshotType
): DomainPairFactorEvaluationSnapshot => ({
  snapshotId: row.snapshotId,
  pairId: row.pairId,
  memberAId: row.memberAId,
  memberBId: row.memberBId,
  factorKey: row.factorKey,
  context: row.context,
  strategy: row.strategy,
  strategyVersion: row.strategyVersion,
  directionality: row.directionality,
  revision: row.revision,
  evaluation: {
    strategy: row.evaluation.strategy,
    context: row.evaluation.context,
    status: row.evaluation.status,
    ...(row.evaluation.internalFit !== undefined
      ? { internalFit: row.evaluation.internalFit }
      : {}),
    confidence: row.evaluation.confidence,
    reasonCodes: [...row.evaluation.reasonCodes],
    actionability: row.evaluation.actionability,
    ...(row.evaluation.directionalFit
      ? { directionalFit: { ...row.evaluation.directionalFit } }
      : {}),
    ...(row.evaluation.roleMetrics
      ? { roleMetrics: { ...row.evaluation.roleMetrics } }
      : {}),
  },
  individualSnapshotIds: [
    row.individualSnapshotIds[0],
    row.individualSnapshotIds[1],
  ],
  ...(row.pairSnapshotId ? { pairSnapshotId: row.pairSnapshotId } : {}),
  versions: {
    ...row.versions,
    measurementRefs: row.versions.measurementRefs.map((reference) => ({
      key: reference.key,
      version: reference.version,
    })),
    instrumentRefs: row.versions.instrumentRefs.map((reference) => ({
      key: reference.key,
      version: reference.version,
    })),
  },
  inputHash: row.inputHash,
  outputHash: row.outputHash,
  calculatedAt: new Date(row.calculatedAt.getTime()),
  effectiveFrom: new Date(row.effectiveFrom.getTime()),
  effectiveUntil: row.effectiveUntil
    ? new Date(row.effectiveUntil.getTime())
    : undefined,
});

type ExportSection<T> = {
  items: T[];
  truncated: boolean;
  limit: number;
};

const bounded = <T>(rows: T[], limit: number): ExportSection<T> => ({
  items: rows.slice(0, limit),
  truncated: rows.length > limit,
  limit,
});

const requiredIso = (value: Date): string => value.toISOString();

type PairMembershipExport = {
  pairId: string;
  role: 'A' | 'B';
  status: 'active' | 'paused' | 'ended';
  createdAt?: string;
  updatedAt?: string;
};

type FactorEvidenceEventExport = {
  eventId: string;
  contextPairId?: string;
  factorKey: string;
  measurementKey: string;
  instrumentKey: string;
  sourceType: EvidenceEventType['sourceType'];
  sourceRef: string;
  sourceRevision: string;
  sourceHash: string;
  submittedValue: FactorValue;
  normalizedValue?: FactorValue;
  reliability: number;
  observedAt: string;
  recordedAt: string;
  context: EvidenceEventType['context'];
  purpose: EvidenceEventType['purpose'];
  privacyClass: EvidenceEventType['privacyClass'];
  captureMode: EvidenceEventType['captureMode'];
  policyVersion: string;
  consentRevision: string;
  retentionClass: EvidenceEventType['retentionClass'];
  versions: EvidenceEventType['versions'];
  status: EvidenceEventType['status'];
  rejectionCode?: EvidenceEventType['rejectionCode'];
};

type IndividualFactorSnapshotExport = {
  snapshotId: string;
  contextPairId?: string;
  projectionPurpose: IndividualFactorSnapshotType['projectionPurpose'];
  factorKey: string;
  revision: number;
  status: IndividualFactorSnapshotType['status'];
  value: FactorValue;
  metrics: IndividualFactorSnapshotType['metrics'];
  evidenceIds: string[];
  evidenceIdsTruncated: boolean;
  evidenceIdsLimit: number;
  versions: IndividualFactorSnapshotType['versions'];
  calculatedAt: string;
};

type PairFactorEvaluationSummaryExport = {
  pairId: string;
  disclosure: 'SUMMARY_ONLY';
  factorKey: string;
  status: PairFactorEvaluationSnapshotType['evaluation']['status'];
  confidenceBand: 'LOW' | 'MEDIUM' | 'HIGH';
  actionability: PairFactorEvaluationSnapshotType['evaluation']['actionability'];
  reasonCode: 'PAIR_EVALUATION_SAFE_SUMMARY';
  calculatedAt: string;
};

type FactorEnginePrivacyExport = {
  manifest: typeof FACTOR_ENGINE_EXPORT_MANIFEST;
  evidenceEvents: ExportSection<FactorEvidenceEventExport>;
  individualFactorSnapshots: ExportSection<IndividualFactorSnapshotExport>;
  pairEvaluationSummaries: ExportSection<PairFactorEvaluationSummaryExport>;
};

type OwnerPrivacyExportDTO = {
  exportVersion: 'owner-export-v1';
  generatedAt: string;
  scope: {
    ownerOnlyRawData: true;
    sharedDataPolicy: 'ALREADY_DISCLOSED_PAIR_PROJECTIONS_ONLY';
    bounds: {
      sectionCountsAreHardLimited: true;
      textMayBeTruncated: true;
      maxTextChars: number;
      maxIdentifierChars: number;
    };
    excluded: string[];
  };
  account: UserDTO & {
    relationshipLens?: NonNullable<UserType['profile']>['relationshipLens'];
  };
  onboardingSessions: ExportSection<{
    status: 'in_progress' | 'completed';
    contentRevision: string;
    policyVersion: string;
    consent: {
      adultConfirmed: boolean;
      voluntaryParticipationConfirmed: boolean;
      privacyAcknowledged: boolean;
      confirmedAt: string;
    };
    cursor: number;
    answersTruncated: boolean;
    answersLimit: number;
    answers: Array<{
      questionId: string;
      questionRevision: string;
      answerRevision: number;
      capturePolicy: 'PRIVATE' | 'PAIR_MODEL_ONLY' | 'SHARED';
      value: {
        kind: 'single' | 'multi' | 'boolean' | 'skipped';
        optionId?: string;
        optionIds?: string[];
        booleanValue?: boolean;
      };
      answeredAt: string;
    }>;
    startedAt: string;
    completedAt?: string;
  }>;
  personalDailyCheckIns: ExportSection<{
    id: string;
    pairId?: string;
    dateKey: string;
    timezoneOffsetMin?: number;
    lens: {
      type: 'feminine' | 'masculine' | 'balanced' | 'custom';
      source: 'gender_default' | 'user_setting';
    };
    answers: {
      mood: 'calm' | 'warm' | 'tired' | 'anxious' | 'sad' | 'irritated' | 'closed' | 'open';
      energy: number;
      stress: number;
      closenessNeed: number;
      spaceNeed: number;
      supportNeed: number;
      conflictSensitivity: number;
      conversationReadiness: number;
    };
    context?: {
      sleep?: 'good' | 'medium' | 'bad';
      workload?: 'low' | 'medium' | 'high';
      body?: {
        enabled: boolean;
        type?: 'cycle' | 'pain' | 'fatigue' | 'health' | 'other';
        note?: string;
        visibility: 'private';
      };
      customTags?: string[];
    };
    privateJournal?: { text?: string; updatedAt?: string };
    share: {
      partnerSignal: {
        enabled: boolean;
        text?: string;
        status: 'none' | 'draft' | 'sent' | 'hidden';
        sentSignalId?: string;
        sentAt?: string;
      };
      pairMap: { enabled: boolean; visibility: 'none' | 'aggregate_only' };
    };
    createdAt: string;
    updatedAt: string;
  }>;
  weeklyCheckIns: ExportSection<{
    id: string;
    pairId?: string;
    weekKey: string;
    answers: {
      closeness: number;
      fatigue: number;
      irritation: number;
      readiness: number;
      unresolvedTopic: boolean;
      note?: string;
    };
    createdAt: string;
    updatedAt: string;
  }>;
  personalQuestionnaireSubmissions: ExportSection<{
    submissionId: string;
    questionnaireId: string;
    questionnaireVersion: number;
    questionnaireContentModel: 'SEMANTIC_V1';
    answersTruncated: boolean;
    answersLimit: number;
    answers: Array<{
      questionId: string;
      ui: number;
      contentRevision: string;
    }>;
    captureMode: 'PRIVATE';
    retentionClass: 'OWNER_CONTROLLED';
    semanticStatus: 'UNMAPPED';
    submittedAt: string;
    createdAt: string;
  }>;
  pairMemberships: ExportSection<PairMembershipExport>;
  pairStateSummaries: ExportSection<{
    pairId: string;
    cycleKey: string;
    revision: number;
    memberCompletion: Array<{ member: 'owner' | 'partner'; status: string }>;
    dataStatus: string;
    reasonCodes: string[];
    signals: Array<{
      key: string;
      status: string;
      reasonCode: string;
      nextStepHint: string;
    }>;
    displayVersion: string;
    generatedAt: string;
  }>;
  sharedActivities: ExportSection<{
    id: string;
    pairId: string;
    title: { ru: string; en: string };
    status: string;
    lifecycleVersion?: string;
    feedbackSchemaVersion?: string;
    resultSummary?: {
      dataStatus: 'PARTIAL' | 'ENOUGH';
      bothSubmitted: boolean;
      status: NonNullable<PairActivityType['resultSummary']>['status'];
      completedAt?: string;
      resultVersion: NonNullable<
        PairActivityType['resultSummary']
      >['resultVersion'];
    };
    offeredAt: string;
    acceptedAt?: string;
    startedAt?: string;
    createdAt?: string;
    updatedAt?: string;
  }>;
  pairQuestionnaireAnswers: ExportSection<{
    pairId: string;
    questionnaireId: string;
    questionId: string;
    role: 'A' | 'B';
    ui: number;
    answeredAt: string;
  }>;
  partnerSignals: ExportSection<{
    pairId: string;
    direction: 'sent' | 'received';
    dateKey: string;
    text: string;
    tone: string;
    status: string;
    createdAt: string;
    updatedAt: string;
  }>;
  matchInteractions: ExportSection<{
    id: string;
    role: 'initiator' | 'recipient';
    status: string;
    ownCardSnapshot?: {
      requirements: [string, string, string];
      questions: [string, string];
      updatedAt?: string;
    };
    ownResponse?: {
      agreements: [boolean, boolean, boolean];
      answers: [string, string];
      at: string;
    };
    ownDecision?: { accepted: boolean; at: string };
    createdAt?: string;
    updatedAt?: string;
  }>;
  safetySettings: ExportSection<{
    pairId: string;
    enabled: boolean;
    retentionClass: 'UNTIL_REVOKED_OR_PAIR_END';
    revokedAt?: string;
    createdAt: string;
    updatedAt: string;
  }>;
  notifications: ExportSection<{
    id: string;
    pairId: string;
    type: string;
    readAt?: string;
    createdAt: string;
  }>;
  factorEngine: FactorEnginePrivacyExport;
};

export const privacyExportService = {
  async buildOwnerExport(params: {
    ownerUserId: string;
    auditRequest?: AuditRequestContext;
  }): Promise<OwnerPrivacyExportDTO> {
    await connectToDatabase();
    const ownerUserId = params.ownerUserId.trim();
    if (!ownerUserId || ownerUserId.length > 128) {
      throw new DomainError({
        code: 'AUTH_INVALID_SESSION',
        status: 401,
        message: 'unauthorized',
      });
    }

    const [
      user,
      onboardingRows,
      dailyRows,
      weeklyRows,
      personalQuestionnaireRows,
      pairRows,
      signalRows,
      likeRows,
      safetyRows,
      notificationRows,
      factorEvidenceRows,
      individualFactorRows,
    ] = await Promise.all([
      User.findOne({ id: ownerUserId }).select({
        id: 1,
        username: 1,
        avatar: 1,
        personal: 1,
        preferences: 1,
        profile: 1,
        location: 1,
        createdAt: 1,
        updatedAt: 1,
      }),
      MvpOnboardingSession.find({ userId: ownerUserId })
        .select({
          status: 1,
          contentRevision: 1,
          policyVersion: 1,
          consent: 1,
          cursor: 1,
          answers: 1,
          startedAt: 1,
          completedAt: 1,
        })
        .sort({ updatedAt: -1 })
        .limit(EXPORT_LIMITS.onboardingSessions + 1),
      PersonalDailyCheckIn.find({ userId: ownerUserId })
        .select({
          pairId: 1,
          dateKey: 1,
          timezoneOffsetMin: 1,
          lens: 1,
          answers: 1,
          context: 1,
          privateJournal: 1,
          share: 1,
          createdAt: 1,
          updatedAt: 1,
        })
        .sort({ dateKey: -1 })
        .limit(EXPORT_LIMITS.personalDailyCheckIns + 1),
      WeeklyCheckIn.find({ userId: ownerUserId })
        .select({ pairId: 1, weekKey: 1, answers: 1, createdAt: 1, updatedAt: 1 })
        .sort({ weekKey: -1 })
        .limit(EXPORT_LIMITS.weeklyCheckIns + 1),
      PersonalQuestionnaireSubmission.find({ userId: ownerUserId })
        .select({
          submissionId: 1,
          questionnaireId: 1,
          questionnaireVersion: 1,
          questionnaireContentModel: 1,
          answers: 1,
          captureMode: 1,
          retentionClass: 1,
          semanticStatus: 1,
          submittedAt: 1,
          createdAt: 1,
        })
        .sort({ submittedAt: -1, submissionId: -1 })
        .limit(EXPORT_LIMITS.personalQuestionnaireSubmissions + 1),
      Pair.find({ members: ownerUserId })
        .select({ members: 1, status: 1, createdAt: 1, updatedAt: 1 })
        .sort({ createdAt: -1 })
        .limit(EXPORT_LIMITS.pairMemberships + 1),
      PartnerSignal.find({
        $or: [
          { fromUserId: ownerUserId },
          {
            toUserId: ownerUserId,
            status: { $in: ['sent', 'read', 'dismissed_by_receiver'] },
          },
        ],
      })
        .select({
          pairId: 1,
          fromUserId: 1,
          dateKey: 1,
          text: 1,
          tone: 1,
          status: 1,
          createdAt: 1,
          updatedAt: 1,
        })
        .sort({ createdAt: -1 })
        .limit(EXPORT_LIMITS.partnerSignals + 1),
      Like.find({ $or: [{ fromId: ownerUserId }, { toId: ownerUserId }] })
        .select({
          fromId: 1,
          toId: 1,
          fromCardSnapshot: 1,
          recipientResponse: 1,
          recipientDecision: 1,
          initiatorDecision: 1,
          status: 1,
          createdAt: 1,
          updatedAt: 1,
        })
        .sort({ createdAt: -1 })
        .limit(EXPORT_LIMITS.matchInteractions + 1),
      SafetyGate.find({ ownerUserId })
        .select({ pairId: 1, enabled: 1, retentionClass: 1, revokedAt: 1, createdAt: 1, updatedAt: 1 })
        .sort({ updatedAt: -1 })
        .limit(EXPORT_LIMITS.safetySettings + 1),
      Notification.find({ userId: ownerUserId })
        .select({ pairId: 1, type: 1, readAt: 1, createdAt: 1 })
        .sort({ createdAt: -1 })
        .limit(EXPORT_LIMITS.notifications + 1),
      EvidenceEvent.find({
        actorId: ownerUserId,
        subjectKind: 'INDIVIDUAL',
        subjectId: ownerUserId,
        observationScope: 'SELF',
        $or: [
          { observedSubjectId: { $exists: false } },
          { observedSubjectId: ownerUserId },
        ],
      })
        .select({
          eventId: 1,
          pairId: 1,
          factorKey: 1,
          measurementKey: 1,
          instrumentKey: 1,
          sourceType: 1,
          sourceRef: 1,
          sourceRevision: 1,
          sourceHash: 1,
          submittedValue: 1,
          normalizedValue: 1,
          reliability: 1,
          observedAt: 1,
          recordedAt: 1,
          context: 1,
          purpose: 1,
          privacyClass: 1,
          captureMode: 1,
          policyVersion: 1,
          consentRevision: 1,
          retentionClass: 1,
          versions: 1,
          status: 1,
          rejectionCode: 1,
        })
        .sort({ recordedAt: -1, eventId: -1 })
        .limit(EXPORT_LIMITS.factorEvidenceEvents + 1),
      IndividualFactorSnapshot.find({ subjectId: ownerUserId })
        .select({
          snapshotId: 1,
          contextPairId: 1,
          projectionPurpose: 1,
          factorKey: 1,
          revision: 1,
          status: 1,
          value: 1,
          metrics: 1,
          evidenceIds: 1,
          versions: 1,
          calculatedAt: 1,
        })
        .sort({ calculatedAt: -1, snapshotId: -1 })
        .limit(EXPORT_LIMITS.individualFactorSnapshots + 1),
    ]);

    if (!user) {
      throw new DomainError({
        code: 'USER_NOT_FOUND',
        status: 404,
        message: 'user not found',
      });
    }

    const pairRowsBounded = pairRows.slice(0, EXPORT_LIMITS.pairMemberships);
    const pairIds = pairRowsBounded.map((pair) => pair._id);
    const pairIdStrings = pairIds.map(String);
    const ownedPairIds = new Set(pairIdStrings);
    const questionnaireOwnerClauses = pairRowsBounded.map((pair) => ({
      pairId: pair._id,
      by: pair.members[0] === ownerUserId ? ('A' as const) : ('B' as const),
    }));
    const pairFactorOwnerClauses = pairRowsBounded.flatMap((pair) => {
      const pairId = pair._id.toString();
      const [memberAId, memberBId] = pair.members;
      return [
        { pairId, memberAId, memberBId },
        { pairId, memberAId: memberBId, memberBId: memberAId },
      ];
    });

    const [summaryRows, activityRows, questionnaireRows] = pairIds.length
      ? await Promise.all([
          PairStateSnapshot.find({ pairId: { $in: pairIds } })
            .select({
              pairId: 1,
              cycleKey: 1,
              revision: 1,
              memberCompletion: 1,
              dataStatus: 1,
              reasonCodes: 1,
              signals: 1,
              displayVersion: 1,
              generatedAt: 1,
            })
            .sort({ generatedAt: -1 })
            .limit(EXPORT_LIMITS.pairStateSummaries + 1),
          PairActivity.find({ pairId: { $in: pairIds }, visibility: 'both' })
            .select({
              pairId: 1,
              title: 1,
              status: 1,
              lifecycleVersion: 1,
              feedbackSchemaVersion: 1,
              'resultSummary.bothSubmitted': 1,
              'resultSummary.status': 1,
              'resultSummary.completedAt': 1,
              'resultSummary.resultVersion': 1,
              offeredAt: 1,
              acceptedAt: 1,
              startedAt: 1,
              createdAt: 1,
              updatedAt: 1,
            })
            .sort({ offeredAt: -1 })
            .limit(EXPORT_LIMITS.sharedActivities + 1),
          PairQuestionnaireAnswer.find({ $or: questionnaireOwnerClauses })
            .select({
              pairId: 1,
              questionnaireId: 1,
              questionId: 1,
              by: 1,
              ui: 1,
              at: 1,
            })
            .sort({ at: -1 })
            .limit(EXPORT_LIMITS.pairQuestionnaireAnswers + 1),
        ])
      : [[], [], []];

    const pairFactorEvaluationRows = pairFactorOwnerClauses.length
      ? await PairFactorEvaluationSnapshot.find({
          $or: pairFactorOwnerClauses,
        })
          .sort({ calculatedAt: -1, snapshotId: -1 })
          .limit(EXPORT_LIMITS.pairFactorEvaluationSummaries + 1)
      : [];

    const account = toUserDTO(user, {
      scope: 'private',
      includeOnboarding: true,
      includeMatchCard: true,
      includeLocation: true,
    }) as OwnerPrivacyExportDTO['account'];
    account.id = boundedText(account.id, 128);
    account.username = boundedText(account.username, MAX_EXPORT_ID_CHARS);
    account.avatar = boundedText(account.avatar, 2_048);
    if (account.personal) {
      account.personal = {
        ...account.personal,
        city: boundedText(account.personal.city, MAX_EXPORT_ID_CHARS),
      };
    }
    const seeking = account.profile?.onboarding?.seeking;
    if (seeking) {
      seeking.valuedQualities = boundedTextArray(
        seeking.valuedQualities,
        3,
        MAX_EXPORT_ID_CHARS
      );
      seeking.dealBreakers = boundedText(seeking.dealBreakers);
    }
    const matchCard = account.profile?.matchCard;
    if (matchCard) {
      matchCard.requirements = [
        boundedText(matchCard.requirements[0], 80),
        boundedText(matchCard.requirements[1], 80),
        boundedText(matchCard.requirements[2], 80),
      ];
      matchCard.give = [
        boundedText(matchCard.give[0], 80),
        boundedText(matchCard.give[1], 80),
        boundedText(matchCard.give[2], 80),
      ];
      matchCard.questions = [
        boundedText(matchCard.questions[0], 120),
        boundedText(matchCard.questions[1], 120),
      ];
    }
    if (user.profile?.relationshipLens) {
      account.relationshipLens = user.profile.relationshipLens;
    }

    const pairFactorEvaluationSummaries: PairFactorEvaluationSummaryExport[] = [];
    for (const row of pairFactorEvaluationRows) {
      const disclosure = disclosePairEvaluation(
        toDomainPairEvaluationSnapshot(row),
        'PAIR_MEMBER',
        true
      );
      if (disclosure.disclosure !== 'SUMMARY_ONLY') continue;
      pairFactorEvaluationSummaries.push({
        pairId: boundedText(row.pairId, MAX_EXPORT_ID_CHARS),
        ...disclosure,
        factorKey: boundedText(disclosure.factorKey, MAX_EXPORT_ID_CHARS),
        calculatedAt: requiredIso(row.calculatedAt),
      });
    }

    const exportDto: OwnerPrivacyExportDTO = {
      exportVersion: 'owner-export-v1',
      generatedAt: new Date().toISOString(),
      scope: {
        ownerOnlyRawData: true,
        sharedDataPolicy: 'ALREADY_DISCLOSED_PAIR_PROJECTIONS_ONLY',
        bounds: {
          sectionCountsAreHardLimited: true,
          textMayBeTruncated: true,
          maxTextChars: MAX_EXPORT_TEXT_CHARS,
          maxIdentifierChars: MAX_EXPORT_ID_CHARS,
        },
        excluded: [
          'partner raw answers and private notes',
          'system-only safety vetoes owned by another user',
          'exact compatibility scores',
          'partner Factor Engine evidence, values, snapshots, and identifiers',
          'pair Factor Engine raw values, exact confidence or fit, hashes, and evidence links',
          'tokens, cookies, secrets, and internal abuse-control records',
        ],
      },
      account,
      onboardingSessions: bounded(
        onboardingRows.map((row) => ({
          status: row.status,
          contentRevision: boundedText(
            row.contentRevision,
            MAX_EXPORT_ID_CHARS
          ),
          policyVersion: boundedText(row.policyVersion, MAX_EXPORT_ID_CHARS),
          consent: {
            adultConfirmed: row.consent.adultConfirmed,
            voluntaryParticipationConfirmed:
              row.consent.voluntaryParticipationConfirmed,
            privacyAcknowledged: row.consent.privacyAcknowledged,
            confirmedAt: requiredIso(row.consent.confirmedAt),
          },
          cursor: row.cursor,
          answersTruncated:
            row.answers.length >
            NESTED_EXPORT_LIMITS.onboardingAnswersPerSession,
          answersLimit: NESTED_EXPORT_LIMITS.onboardingAnswersPerSession,
          answers: row.answers
            .slice(0, NESTED_EXPORT_LIMITS.onboardingAnswersPerSession)
            .map((answer) => ({
              questionId: boundedText(
                answer.questionId,
                MAX_EXPORT_ID_CHARS
              ),
              questionRevision: boundedText(
                answer.questionRevision,
                MAX_EXPORT_ID_CHARS
              ),
              answerRevision: answer.answerRevision,
              capturePolicy: answer.capturePolicy,
              value: {
                kind: answer.value.kind,
                ...(answer.value.optionId
                  ? {
                      optionId: boundedText(
                        answer.value.optionId,
                        MAX_EXPORT_ID_CHARS
                      ),
                    }
                  : {}),
                ...(answer.value.optionIds
                  ? {
                      optionIds: boundedTextArray(
                        answer.value.optionIds,
                        NESTED_EXPORT_LIMITS.onboardingMultiSelectOptions,
                        MAX_EXPORT_ID_CHARS
                      ),
                    }
                  : {}),
                ...(answer.value.booleanValue !== undefined
                  ? { booleanValue: answer.value.booleanValue }
                  : {}),
              },
              answeredAt: requiredIso(answer.answeredAt),
            })),
          startedAt: requiredIso(row.startedAt),
          ...(row.completedAt
            ? { completedAt: requiredIso(row.completedAt) }
            : {}),
        })),
        EXPORT_LIMITS.onboardingSessions
      ),
      personalDailyCheckIns: bounded(
        dailyRows.map((row) => ({
          id: row._id.toString(),
          ...(row.pairId ? { pairId: row.pairId.toString() } : {}),
          dateKey: boundedText(row.dateKey, 10),
          ...(row.timezoneOffsetMin !== undefined
            ? { timezoneOffsetMin: row.timezoneOffsetMin }
            : {}),
          lens: {
            type: row.lens.type,
            source: row.lens.source,
          },
          answers: {
            mood: row.answers.mood,
            energy: row.answers.energy,
            stress: row.answers.stress,
            closenessNeed: row.answers.closenessNeed,
            spaceNeed: row.answers.spaceNeed,
            supportNeed: row.answers.supportNeed,
            conflictSensitivity: row.answers.conflictSensitivity,
            conversationReadiness: row.answers.conversationReadiness,
          },
          ...(row.context
            ? {
                context: {
                  ...(row.context.sleep ? { sleep: row.context.sleep } : {}),
                  ...(row.context.workload
                    ? { workload: row.context.workload }
                    : {}),
                  ...(row.context.body
                    ? {
                        body: {
                          enabled: row.context.body.enabled,
                          ...(row.context.body.type
                            ? { type: row.context.body.type }
                            : {}),
                          ...(row.context.body.note
                            ? { note: boundedText(row.context.body.note) }
                            : {}),
                          visibility: 'private' as const,
                        },
                      }
                    : {}),
                  ...(row.context.customTags
                    ? {
                        customTags: boundedTextArray(
                          row.context.customTags,
                          NESTED_EXPORT_LIMITS.dailyCustomTags,
                          MAX_EXPORT_ID_CHARS
                        ),
                      }
                    : {}),
                },
              }
            : {}),
          ...(row.privateJournal
            ? {
                privateJournal: {
                  ...(row.privateJournal.text
                    ? { text: boundedText(row.privateJournal.text) }
                    : {}),
                  ...(row.privateJournal.updatedAt
                    ? { updatedAt: requiredIso(row.privateJournal.updatedAt) }
                    : {}),
                },
              }
            : {}),
          share: {
            partnerSignal: {
              enabled: row.share.partnerSignal.enabled,
              ...(row.share.partnerSignal.text
                ? { text: boundedText(row.share.partnerSignal.text) }
                : {}),
              status: row.share.partnerSignal.status,
              ...(row.share.partnerSignal.sentSignalId
                ? {
                    sentSignalId:
                      row.share.partnerSignal.sentSignalId.toString(),
                  }
                : {}),
              ...(row.share.partnerSignal.sentAt
                ? { sentAt: requiredIso(row.share.partnerSignal.sentAt) }
                : {}),
            },
            pairMap: {
              enabled: row.share.pairMap.enabled,
              visibility: row.share.pairMap.visibility,
            },
          },
          createdAt: requiredIso(row.createdAt),
          updatedAt: requiredIso(row.updatedAt),
        })),
        EXPORT_LIMITS.personalDailyCheckIns
      ),
      weeklyCheckIns: bounded(
        weeklyRows.map((row) => ({
          id: row._id.toString(),
          ...(row.pairId ? { pairId: row.pairId.toString() } : {}),
          weekKey: boundedText(row.weekKey, 16),
          answers: {
            closeness: row.answers.closeness,
            fatigue: row.answers.fatigue,
            irritation: row.answers.irritation,
            readiness: row.answers.readiness,
            unresolvedTopic: row.answers.unresolvedTopic,
            ...(row.answers.note
              ? { note: boundedText(row.answers.note) }
              : {}),
          },
          createdAt: requiredIso(row.createdAt),
          updatedAt: requiredIso(row.updatedAt),
        })),
        EXPORT_LIMITS.weeklyCheckIns
      ),
      personalQuestionnaireSubmissions: bounded(
        personalQuestionnaireRows.map((row) => ({
          submissionId: boundedText(row.submissionId, MAX_EXPORT_ID_CHARS),
          questionnaireId: boundedText(
            row.questionnaireId,
            MAX_EXPORT_ID_CHARS
          ),
          questionnaireVersion: row.questionnaireVersion,
          questionnaireContentModel: row.questionnaireContentModel,
          answersTruncated:
            row.answers.length >
            NESTED_EXPORT_LIMITS.questionnaireAnswersPerSubmission,
          answersLimit:
            NESTED_EXPORT_LIMITS.questionnaireAnswersPerSubmission,
          answers: row.answers
            .slice(0, NESTED_EXPORT_LIMITS.questionnaireAnswersPerSubmission)
            .map((answer) => ({
              questionId: boundedText(
                answer.questionId,
                MAX_EXPORT_ID_CHARS
              ),
              ui: answer.ui,
              contentRevision: boundedText(
                answer.contentRevision,
                MAX_EXPORT_ID_CHARS
              ),
            })),
          captureMode: row.captureMode,
          retentionClass: row.retentionClass,
          semanticStatus: row.semanticStatus,
          submittedAt: requiredIso(row.submittedAt),
          createdAt: requiredIso(row.createdAt),
        })),
        EXPORT_LIMITS.personalQuestionnaireSubmissions
      ),
      pairMemberships: bounded(
        pairRows.map((pair): PairMembershipExport => ({
          pairId: pair._id.toString(),
          role: pair.members[0] === ownerUserId ? 'A' : 'B',
          status: pair.status,
          ...(pair.createdAt ? { createdAt: requiredIso(pair.createdAt) } : {}),
          ...(pair.updatedAt ? { updatedAt: requiredIso(pair.updatedAt) } : {}),
        })),
        EXPORT_LIMITS.pairMemberships
      ),
      pairStateSummaries: bounded(
        summaryRows.map((row) => {
          return {
            pairId: row.pairId.toString(),
            cycleKey: boundedText(row.cycleKey, 32),
            revision: row.revision,
            memberCompletion: row.memberCompletion.map((member) => ({
              member:
                member.userId === ownerUserId
                  ? ('owner' as const)
                  : ('partner' as const),
              status: member.status,
            })),
            dataStatus: row.dataStatus,
            reasonCodes: boundedTextArray(
              row.reasonCodes,
              NESTED_EXPORT_LIMITS.snapshotReasonCodes,
              MAX_EXPORT_ID_CHARS
            ),
            signals: row.signals
              .slice(0, NESTED_EXPORT_LIMITS.snapshotSignals)
              .map((signal) => ({
                key: signal.key,
                status: signal.status,
                reasonCode: signal.reasonCode,
                nextStepHint: signal.nextStepHint,
              })),
            displayVersion: boundedText(
              row.displayVersion,
              MAX_EXPORT_ID_CHARS
            ),
            generatedAt: requiredIso(row.generatedAt),
          };
        }),
        EXPORT_LIMITS.pairStateSummaries
      ),
      sharedActivities: bounded(
        activityRows.map((row) => ({
          id: row._id.toString(),
          pairId: row.pairId.toString(),
          title: {
            ru: boundedText(row.title.ru),
            en: boundedText(row.title.en),
          },
          status: row.status,
          ...(row.lifecycleVersion
            ? { lifecycleVersion: row.lifecycleVersion }
            : {}),
          ...(row.feedbackSchemaVersion
            ? { feedbackSchemaVersion: row.feedbackSchemaVersion }
            : {}),
          ...(row.resultSummary
            ? {
                resultSummary: {
                  dataStatus: row.resultSummary.bothSubmitted
                    ? ('ENOUGH' as const)
                    : ('PARTIAL' as const),
                  bothSubmitted: row.resultSummary.bothSubmitted,
                  status: row.resultSummary.status,
                  ...(row.resultSummary.completedAt
                    ? {
                        completedAt: requiredIso(
                          row.resultSummary.completedAt
                        ),
                      }
                    : {}),
                  resultVersion: row.resultSummary.resultVersion,
                },
              }
            : {}),
          offeredAt: requiredIso(row.offeredAt),
          ...(row.acceptedAt ? { acceptedAt: requiredIso(row.acceptedAt) } : {}),
          ...(row.startedAt ? { startedAt: requiredIso(row.startedAt) } : {}),
          ...(row.createdAt ? { createdAt: requiredIso(row.createdAt) } : {}),
          ...(row.updatedAt ? { updatedAt: requiredIso(row.updatedAt) } : {}),
        })),
        EXPORT_LIMITS.sharedActivities
      ),
      pairQuestionnaireAnswers: bounded(
        questionnaireRows.map((row) => ({
          pairId: row.pairId.toString(),
          questionnaireId: boundedText(
            row.questionnaireId,
            MAX_EXPORT_ID_CHARS
          ),
          questionId: boundedText(row.questionId, MAX_EXPORT_ID_CHARS),
          role: row.by,
          ui: row.ui,
          answeredAt: requiredIso(row.at),
        })),
        EXPORT_LIMITS.pairQuestionnaireAnswers
      ),
      partnerSignals: bounded(
        signalRows.map((row) => ({
          pairId: row.pairId.toString(),
          direction:
            row.fromUserId === ownerUserId
              ? ('sent' as const)
              : ('received' as const),
          dateKey: boundedText(row.dateKey, 10),
          text: boundedText(row.text),
          tone: row.fromUserId === ownerUserId ? row.tone : 'neutral',
          status: row.status,
          createdAt: requiredIso(row.createdAt),
          updatedAt: requiredIso(row.updatedAt),
        })),
        EXPORT_LIMITS.partnerSignals
      ),
      matchInteractions: bounded(
        likeRows.map((row) => {
          const isInitiator = row.fromId === ownerUserId;
          const ownDecision = isInitiator
            ? row.initiatorDecision
            : row.recipientDecision;
          return {
            id: row._id.toString(),
            role: isInitiator
              ? ('initiator' as const)
              : ('recipient' as const),
            status: row.status,
            ...(isInitiator && row.fromCardSnapshot
              ? {
                  ownCardSnapshot: {
                    requirements: [
                      boundedText(row.fromCardSnapshot.requirements[0], 80),
                      boundedText(row.fromCardSnapshot.requirements[1], 80),
                      boundedText(row.fromCardSnapshot.requirements[2], 80),
                    ],
                    questions: [
                      boundedText(row.fromCardSnapshot.questions[0], 120),
                      boundedText(row.fromCardSnapshot.questions[1], 120),
                    ],
                    ...(row.fromCardSnapshot.updatedAt
                      ? {
                          updatedAt: requiredIso(
                            row.fromCardSnapshot.updatedAt
                          ),
                        }
                      : {}),
                  },
                }
              : {}),
            ...(!isInitiator && row.recipientResponse
              ? {
                  ownResponse: {
                    agreements: row.recipientResponse.agreements,
                    answers: [
                      boundedText(row.recipientResponse.answers[0]),
                      boundedText(row.recipientResponse.answers[1]),
                    ],
                    at: requiredIso(row.recipientResponse.at),
                  },
                }
              : {}),
            ...(ownDecision
              ? {
                  ownDecision: {
                    accepted: ownDecision.accepted,
                    at: requiredIso(ownDecision.at),
                  },
                }
              : {}),
            ...(row.createdAt ? { createdAt: requiredIso(row.createdAt) } : {}),
            ...(row.updatedAt ? { updatedAt: requiredIso(row.updatedAt) } : {}),
          };
        }),
        EXPORT_LIMITS.matchInteractions
      ),
      safetySettings: bounded(
        safetyRows.map((row) => ({
          pairId: row.pairId.toString(),
          enabled: row.enabled,
          retentionClass: row.retentionClass,
          ...(row.revokedAt ? { revokedAt: requiredIso(row.revokedAt) } : {}),
          createdAt: requiredIso(row.createdAt),
          updatedAt: requiredIso(row.updatedAt),
        })),
        EXPORT_LIMITS.safetySettings
      ),
      notifications: bounded(
        notificationRows.map((row) => ({
          id: row._id.toString(),
          pairId: row.pairId.toString(),
          type: row.type,
          ...(row.readAt ? { readAt: requiredIso(row.readAt) } : {}),
          createdAt: requiredIso(row.createdAt),
        })),
        EXPORT_LIMITS.notifications
      ),
      factorEngine: {
        manifest: FACTOR_ENGINE_EXPORT_MANIFEST,
        evidenceEvents: bounded(
          factorEvidenceRows.map((row): FactorEvidenceEventExport => ({
            eventId: boundedText(row.eventId, MAX_EXPORT_ID_CHARS),
            ...(row.pairId && ownedPairIds.has(row.pairId)
              ? {
                  contextPairId: boundedText(
                    row.pairId,
                    MAX_EXPORT_ID_CHARS
                  ),
                }
              : {}),
            factorKey: boundedText(row.factorKey, MAX_EXPORT_ID_CHARS),
            measurementKey: boundedText(
              row.measurementKey,
              MAX_EXPORT_ID_CHARS
            ),
            instrumentKey: boundedText(
              row.instrumentKey,
              MAX_EXPORT_ID_CHARS
            ),
            sourceType: row.sourceType,
            sourceRef: boundedText(row.sourceRef, MAX_EXPORT_ID_CHARS),
            sourceRevision: boundedText(
              row.sourceRevision,
              MAX_EXPORT_ID_CHARS
            ),
            sourceHash: boundedText(row.sourceHash, MAX_EXPORT_ID_CHARS),
            submittedValue: boundedFactorValue(row.submittedValue),
            ...(row.status === 'ACCEPTED' && row.normalizedValue
              ? {
                  normalizedValue: boundedFactorValue(row.normalizedValue),
                }
              : {}),
            reliability: row.reliability,
            observedAt: requiredIso(row.observedAt),
            recordedAt: requiredIso(row.recordedAt),
            context: row.context,
            purpose: row.purpose,
            privacyClass: row.privacyClass,
            captureMode: row.captureMode,
            policyVersion: boundedText(
              row.policyVersion,
              MAX_EXPORT_ID_CHARS
            ),
            consentRevision: boundedText(
              row.consentRevision,
              MAX_EXPORT_ID_CHARS
            ),
            retentionClass: row.retentionClass,
            versions: {
              registryVersion: row.versions.registryVersion,
              definitionVersion: row.versions.definitionVersion,
              measurementVersion: row.versions.measurementVersion,
              instrumentVersion: row.versions.instrumentVersion,
              algorithmVersion: row.versions.algorithmVersion,
            },
            status: row.status,
            ...(row.rejectionCode
              ? { rejectionCode: row.rejectionCode }
              : {}),
          })),
          EXPORT_LIMITS.factorEvidenceEvents
        ),
        individualFactorSnapshots: bounded(
          individualFactorRows.map(
            (row): IndividualFactorSnapshotExport => ({
              snapshotId: boundedText(row.snapshotId, MAX_EXPORT_ID_CHARS),
              ...(row.contextPairId && ownedPairIds.has(row.contextPairId)
                ? {
                    contextPairId: boundedText(
                      row.contextPairId,
                      MAX_EXPORT_ID_CHARS
                    ),
                  }
                : {}),
              projectionPurpose: row.projectionPurpose,
              factorKey: boundedText(row.factorKey, MAX_EXPORT_ID_CHARS),
              revision: row.revision,
              status: row.status,
              value: boundedFactorValue(row.value),
              metrics: {
                confidence: row.metrics.confidence,
                coverage: row.metrics.coverage,
                freshness: row.metrics.freshness,
                consistency: row.metrics.consistency,
                evidenceCount: row.metrics.evidenceCount,
              },
              evidenceIds: boundedTextArray(
                row.evidenceIds,
                NESTED_EXPORT_LIMITS.factorSnapshotEvidenceIds,
                MAX_EXPORT_ID_CHARS
              ),
              evidenceIdsTruncated:
                row.evidenceIds.length >
                NESTED_EXPORT_LIMITS.factorSnapshotEvidenceIds,
              evidenceIdsLimit:
                NESTED_EXPORT_LIMITS.factorSnapshotEvidenceIds,
              versions: {
                registryVersion: row.versions.registryVersion,
                definitionVersion: row.versions.definitionVersion,
                algorithmVersion: row.versions.algorithmVersion,
                snapshotVersion: row.versions.snapshotVersion,
                displayVersion: row.versions.displayVersion,
                measurementRefs: row.versions.measurementRefs.map(
                  (reference) => ({
                    key: boundedText(reference.key, MAX_EXPORT_ID_CHARS),
                    version: reference.version,
                  })
                ),
                instrumentRefs: row.versions.instrumentRefs.map(
                  (reference) => ({
                    key: boundedText(reference.key, MAX_EXPORT_ID_CHARS),
                    version: reference.version,
                  })
                ),
              },
              calculatedAt: requiredIso(row.calculatedAt),
            })
          ),
          EXPORT_LIMITS.individualFactorSnapshots
        ),
        pairEvaluationSummaries: bounded(
          pairFactorEvaluationSummaries,
          EXPORT_LIMITS.pairFactorEvaluationSummaries
        ),
      },
    };

    if (params.auditRequest) {
      await emitEvent({
        event: 'PRIVACY_EXPORT_CREATED',
        actor: { userId: ownerUserId },
        request: params.auditRequest,
        target: { type: 'user', id: ownerUserId },
        metadata: { exportVersion: 'owner-export-v1' },
      });
    }

    return exportDto;
  },
};

export type { OwnerPrivacyExportDTO };
