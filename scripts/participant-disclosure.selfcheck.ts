import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { Types } from "mongoose";
import ts from "typescript";
import { ApiClientError, toUiErrorState } from "../src/client/api/errors";
import {
  normalizePairSummary,
  type PairSummaryInput,
} from "../src/client/viewmodels/pair.viewmodels";
import { toDomainError } from "../src/domain/errors";
import { MVP_FACTOR_REGISTRY } from "../src/domain/model/definitions/mvpDefinitions";
import {
  discloseFactor,
  disclosePairEvaluation,
} from "../src/domain/model/privacy/disclosure";
import type { PairFactorEvaluationSnapshot } from "../src/domain/model/snapshots/snapshots";
import type {
  WeeklyFactorKey,
  WeeklyPairEvaluationMetadata,
} from "../src/domain/services/factorEngineRuntime.service";
import { projectCanonicalHistoryCycle } from "../src/domain/services/pairHistory.service";
import { sanitizeIncomingPartnerSignal } from "../src/domain/services/personalToday.service";
import {
  buildPairStateProjection,
  type PairStateCheckInInput,
} from "../src/domain/services/weeklyCycle.service";
import { sanitizeAuditMetadata } from "../src/lib/audit/emitEvent";
import {
  toActivityResultSummaryDTO,
  toPairActivityDTO,
} from "../src/lib/dto/activity.dto";
import { toNotificationDTO } from "../src/lib/dto/notification.dto";
import { toPairDTO } from "../src/lib/dto/pair.dto";
import { toPairEventDTO } from "../src/lib/dto/pairEvent.dto";
import { recordProductAnalyticsEvent } from "../src/lib/observability/productAnalytics";
import type { NotificationDocumentType } from "../src/models/Notification";
import type {
  ActivityResultSummary,
  PairActivityType,
} from "../src/models/PairActivity";
import type { PairEventTypeModel } from "../src/models/PairEvent";
import type { PairType } from "../src/models/Pair";
import type { PartnerSignalType } from "../src/models/PartnerSignal";
import { WeeklyCheckIn } from "../src/models/WeeklyCheckIn";

const root = process.cwd();
const sourceCache = new Map<string, ts.SourceFile>();

const sourceFile = (path: string): ts.SourceFile => {
  const cached = sourceCache.get(path);
  if (cached) return cached;
  const absolute = join(root, path);
  const parsed = ts.createSourceFile(
    absolute,
    readFileSync(absolute, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  sourceCache.set(path, parsed);
  return parsed;
};

const propertyName = (
  name: ts.PropertyName | undefined,
): string | undefined => {
  if (!name) return undefined;
  if (
    ts.isIdentifier(name) ||
    ts.isStringLiteral(name) ||
    ts.isNumericLiteral(name)
  ) {
    return name.text;
  }
  return undefined;
};

const declaredTypeNode = (
  path: string,
  declarationName: string,
): ts.TypeNode => {
  const declaration = sourceFile(path).statements.find(
    (
      statement,
    ): statement is ts.TypeAliasDeclaration | ts.InterfaceDeclaration =>
      (ts.isTypeAliasDeclaration(statement) ||
        ts.isInterfaceDeclaration(statement)) &&
      statement.name.text === declarationName,
  );
  assert.ok(declaration, `${path} must declare ${declarationName}`);
  if (ts.isTypeAliasDeclaration(declaration)) return declaration.type;
  return ts.factory.createTypeLiteralNode([...declaration.members]);
};

const typeMember = (
  node: ts.TypeNode,
  memberName: string,
): ts.PropertySignature => {
  const literal = ts.isParenthesizedTypeNode(node) ? node.type : node;
  assert.ok(
    ts.isTypeLiteralNode(literal),
    `${memberName} must be in a type literal`,
  );
  const member = literal.members.find(
    (candidate): candidate is ts.PropertySignature =>
      ts.isPropertySignature(candidate) &&
      propertyName(candidate.name) === memberName,
  );
  assert.ok(member?.type, `type member ${memberName} must exist`);
  return member;
};

const typeAtPath = (
  path: string,
  declarationName: string,
  memberPath: readonly string[] = [],
): ts.TypeNode => {
  let node = declaredTypeNode(path, declarationName);
  for (const segment of memberPath) {
    node = typeMember(node, segment).type as ts.TypeNode;
  }
  return node;
};

const nestedPropertyNames = (node: ts.Node): Set<string> => {
  const names = new Set<string>();
  const visit = (current: ts.Node): void => {
    if (ts.isPropertySignature(current) || ts.isPropertyAssignment(current)) {
      const cannotCarryAValue =
        ts.isPropertySignature(current) &&
        current.type?.kind === ts.SyntaxKind.NeverKeyword;
      const name = propertyName(current.name);
      if (name && !cannotCarryAValue) names.add(name);
    }
    current.forEachChild(visit);
  };
  visit(node);
  return names;
};

const assertTypeOmits = (
  path: string,
  declarationName: string,
  forbidden: readonly string[],
  memberPath: readonly string[] = [],
): void => {
  const names = nestedPropertyNames(
    typeAtPath(path, declarationName, memberPath),
  );
  for (const key of forbidden) {
    assert.equal(
      names.has(key),
      false,
      `${path}:${declarationName}${memberPath.length ? `.${memberPath.join(".")}` : ""} exposes ${key}`,
    );
  }
};

const variableObjectProperties = (
  path: string,
  variableName: string,
): Set<string> => {
  const declaration = sourceFile(path)
    .statements.filter(ts.isVariableStatement)
    .flatMap((statement) => [...statement.declarationList.declarations])
    .find(
      (candidate) =>
        ts.isIdentifier(candidate.name) && candidate.name.text === variableName,
    );
  assert.ok(
    declaration?.initializer,
    `${path} must initialize ${variableName}`,
  );
  let expression: ts.Expression = declaration.initializer;
  if (ts.isArrowFunction(expression)) {
    assert.ok(
      !ts.isBlock(expression.body),
      `${variableName} must have an inspectable object expression`,
    );
    expression = expression.body;
  }
  while (ts.isParenthesizedExpression(expression))
    expression = expression.expression;
  assert.ok(
    ts.isObjectLiteralExpression(expression),
    `${variableName} must resolve to an object literal`,
  );
  return nestedPropertyNames(expression);
};

const assertSerializedOmits = (
  label: string,
  value: object,
  forbidden: readonly string[],
): void => {
  const serialized = JSON.stringify(value);
  for (const key of forbidden) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.doesNotMatch(
      serialized,
      new RegExp(`"${escaped}"\\s*:`),
      `${label} exposes ${key}`,
    );
  }
};

const assertNoSecrets = (
  label: string,
  value: object,
  secrets: readonly string[],
): void => {
  const serialized = JSON.stringify(value);
  for (const secret of secrets) {
    assert.equal(
      serialized.includes(secret),
      false,
      `${label} exposes a private sentinel`,
    );
  }
};

const RAW_PARTICIPANT_FIELDS = [
  "answers",
  "peerAnswers",
  "rawAnswers",
  "note",
  "notes",
  "ui",
  "value",
  "delta",
  "deltas",
  "confidence",
  "evidenceCount",
  "evidenceIds",
  "evidenceEventIds",
  "individualSnapshotIds",
  "pairSnapshotIds",
  "pairEvaluationSnapshotIds",
  "internalFit",
  "directionalFit",
  "roleMetrics",
  "matchScore",
  "successScore",
  "sourceHash",
  "inputHash",
  "outputHash",
  "safetyGate",
  "safetyGateState",
  "safetyVeto",
  "sensitiveReason",
  "rawReason",
] as const;

const INTERNAL_ACTIVITY_FIELDS = [
  "answers",
  "submittedBy",
  "submittedCount",
  "successScore",
  "usefulnessAvg",
  "comfortAvg",
  "tensionAvg",
  "wantsSimilarRatio",
  "participationRatio",
  "subjectiveChangeAvg",
  "difficultyAvg",
  "factorEvidence",
  "recommendationProvenance",
  "stateMeta",
  "consentA",
  "consentB",
] as const;

// Participant contract types must make accidental re-exposure a compile-time edit.
assertTypeOmits(
  "src/domain/services/weeklyCheckIn.service.ts",
  "WeeklyCheckInDTO",
  ["computed", ...RAW_PARTICIPANT_FIELDS.filter((key) => key !== "answers")],
);
assertTypeOmits("src/client/api/types.ts", "WeeklyCheckInDTO", [
  "computed",
  ...RAW_PARTICIPANT_FIELDS.filter((key) => key !== "answers"),
]);
assertTypeOmits(
  "src/domain/services/weeklyCheckIn.service.ts",
  "PairWeeklyCheckInPairDTO",
  RAW_PARTICIPANT_FIELDS,
);
for (const [path, typeName] of [
  ["src/domain/services/weeklyCycle.service.ts", "CurrentWeeklyCycleDTO"],
  ["src/client/api/weeklyCycles.api.ts", "CurrentWeeklyCycleDTO"],
] as const) {
  assertTypeOmits(path, typeName, RAW_PARTICIPANT_FIELDS);
}

for (const [path, typeName] of [
  ["src/lib/dto/pair.dto.ts", "PairDTO"],
  ["src/client/api/types.ts", "PairDTO"],
] as const) {
  assertTypeOmits(path, typeName, [
    ...RAW_PARTICIPANT_FIELDS,
    "activeActivity",
    "progress",
  ]);
}
for (const typeName of ["PairSummaryInput", "PairSummaryDTO"] as const) {
  assertTypeOmits("src/client/viewmodels/pair.viewmodels.ts", typeName, [
    ...RAW_PARTICIPANT_FIELDS,
    "lastLike",
    "progress",
    "activeActivity",
  ]);
}

for (const path of [
  "src/domain/services/recommendationDecision.service.ts",
  "src/client/api/recommendations.api.ts",
] as const) {
  assertTypeOmits(path, "RecommendationDecisionDTO", RAW_PARTICIPANT_FIELDS);
  assertTypeOmits(
    path,
    "RecommendationDecisionDTO",
    ["targetFactorKeys"],
    ["activity"],
  );
}
assert.equal(
  variableObjectProperties(
    "src/domain/services/recommendationDecision.service.ts",
    "activityPreview",
  ).has("targetFactorKeys"),
  false,
  "recommendation activity mapper exposes factor topics",
);

for (const [path, typeName] of [
  ["src/lib/dto/activity.dto.ts", "PairActivityDTO"],
  ["src/client/api/types.ts", "PairActivityDTO"],
] as const) {
  assertTypeOmits(path, typeName, INTERNAL_ACTIVITY_FIELDS);
}
for (const [path, typeName] of [
  ["src/lib/dto/activity.dto.ts", "ActivityResultSummaryDTO"],
  ["src/client/api/types.ts", "ActivityResultSummaryDTO"],
] as const) {
  assertTypeOmits(path, typeName, INTERNAL_ACTIVITY_FIELDS);
  assertTypeOmits(path, typeName, RAW_PARTICIPANT_FIELDS);
}
for (const [path, typeName] of [
  ["src/lib/dto/activity.dto.ts", "ActivityOfferDTO"],
  ["src/client/api/types.ts", "ActivityOfferDTO"],
] as const) {
  assertTypeOmits(path, typeName, [
    ...RAW_PARTICIPANT_FIELDS,
    "recommendationProvenance",
    "stateMeta",
  ]);
}

for (const [path, typeName] of [
  ["src/lib/dto/pairEvent.dto.ts", "PairEventDTO"],
  ["src/client/api/types.ts", "PairEventDTO"],
  ["src/client/viewmodels/pairEvent.viewmodels.ts", "PairEventCardVM"],
] as const) {
  assertTypeOmits(path, typeName, [
    ...RAW_PARTICIPANT_FIELDS,
    "priority",
    "severity",
    "targetFactorKeys",
    "generatedActivityIds",
    "source",
  ]);
}

for (const path of [
  "src/domain/services/pairHistory.service.ts",
  "src/client/api/pairHistory.api.ts",
] as const) {
  for (const typeName of [
    "PairHistorySignalDTO",
    "PairHistoryCycleItemDTO",
    "PairHistoryActivityItemDTO",
    "PairHistoryPageDTO",
  ] as const) {
    assertTypeOmits(path, typeName, RAW_PARTICIPANT_FIELDS);
  }
}

for (const path of [
  "src/lib/dto/notification.dto.ts",
  "src/client/api/notifications.api.ts",
] as const) {
  assertTypeOmits(path, "NotificationDTO", [
    ...RAW_PARTICIPANT_FIELDS,
    "payload",
    "factorKey",
    "factorKeys",
    "targetFactorKeys",
    "topic",
    "topics",
  ]);
}
assertTypeOmits(
  "src/domain/services/personalToday.service.ts",
  "IncomingPartnerSignalDTO",
  [...RAW_PARTICIPANT_FIELDS, "pairId", "sourceCheckInId", "computed"],
);
for (const path of [
  "src/domain/services/partnerSignal.service.ts",
  "src/client/api/types.ts",
] as const) {
  assertTypeOmits(path, "PartnerSignalSendResponse", [
    ...RAW_PARTICIPANT_FIELDS,
    "text",
    "tone",
    "sourceCheckInId",
    "pairId",
  ]);
}
for (const path of [
  "src/domain/services/safetyGate.service.ts",
  "src/client/api/safetyGate.api.ts",
] as const) {
  assertTypeOmits(path, "OwnerSafetyGateDTO", [
    "reason",
    "reasonCode",
    "note",
    "notes",
    "sensitiveReason",
  ]);
}
assertTypeOmits(
  "src/domain/services/privacyExport.service.ts",
  "PairFactorEvaluationSummaryExport",
  [
    "confidence",
    "internalFit",
    "directionalFit",
    "roleMetrics",
    "reasonCodes",
    "individualSnapshotIds",
    "pairSnapshotId",
    "inputHash",
    "outputHash",
  ],
);

// Weekly submission identity is immutable and unique, so repeated writes cannot be
// used as an oracle for a partner's answer.
for (const path of ["userId", "pairId", "weekKey", "answers"] as const) {
  assert.equal(
    WeeklyCheckIn.schema.path(path).options.immutable,
    true,
    `WeeklyCheckIn.${path} must be immutable`,
  );
}
assert.ok(
  WeeklyCheckIn.schema
    .indexes()
    .some(
      ([keys, options]) =>
        options.unique === true &&
        JSON.stringify(keys) ===
          JSON.stringify({ userId: 1, pairId: 1, weekKey: 1 }),
    ),
  "WeeklyCheckIn must have one immutable submission per owner/pair/week",
);
const immutableCheckIn = new WeeklyCheckIn({
  userId: "member-a",
  pairId: new Types.ObjectId("507f1f77bcf86cd799439011"),
  weekKey: "2026-W32",
  answers: {
    closeness: 0.2,
    fatigue: 0.3,
    irritation: 0.4,
    readiness: 0.5,
    unresolvedTopic: false,
    note: "owner-private-note",
  },
});
immutableCheckIn.isNew = false;
immutableCheckIn.set("answers", {
  closeness: 0.99,
  fatigue: 0.99,
  irritation: 0.99,
  readiness: 0.99,
  unresolvedTopic: true,
  note: "binary-probe-attempt",
});
assert.equal(immutableCheckIn.answers.closeness, 0.2);
assert.equal(immutableCheckIn.answers.note, "owner-private-note");

type PrivateProjectionCheckIn = PairStateCheckInInput & {
  answers: {
    closeness: number;
    fatigue: number;
    irritation: number;
    readiness: number;
    unresolvedTopic: boolean;
    note: string;
  };
};

const evaluationKeys: readonly WeeklyFactorKey[] = [
  "communication.weekly.connection",
  "communication.weekly.tension",
  "wellbeing.current.overload",
  "wellbeing.current.readiness",
];
const evaluations = (
  privateVariant: "low" | "high",
): WeeklyPairEvaluationMetadata[] =>
  evaluationKeys.map((factorKey, index) => ({
    snapshotId: `pair-evaluation-${index}`,
    pairId: "pair-1",
    factorKey,
    revision: privateVariant === "low" ? 1 : 999,
    context: "COMMITTED_RELATIONSHIP",
    strategy: "SIMILARITY",
    status: factorKey.endsWith("tension") ? "TENSION" : "ALIGNED",
    confidence: privateVariant === "low" ? 0.01 : 0.99,
    reasonCodes:
      privateVariant === "low" ? ["VALUES_ALIGNED"] : ["GAP_EXCEEDS_BOUND"],
    actionability: privateVariant === "low" ? "NONE" : "DECISION_REQUIRED",
    individualSnapshotIds:
      privateVariant === "low"
        ? ["private-individual-a", "private-individual-b"]
        : ["other-private-a", "other-private-b"],
    inputHash:
      privateVariant === "low" ? "private-input-low" : "private-input-high",
    outputHash:
      privateVariant === "low" ? "private-output-low" : "private-output-high",
    calculatedAt: new Date("2026-08-11T11:00:00.000Z"),
  }));

const checkIns = (privateVariant: "low" | "high"): PrivateProjectionCheckIn[] =>
  ["member-a", "member-b"].map((userId, index) => ({
    _id: new Types.ObjectId(
      index === 0 ? "507f1f77bcf86cd799439012" : "507f1f77bcf86cd799439013",
    ),
    userId,
    createdAt: new Date("2026-08-11T10:00:00.000Z"),
    computed: {
      factorEngine: {
        status: "MATERIALIZED",
        evidenceEventIds:
          privateVariant === "low"
            ? ["private-evidence-low"]
            : ["private-evidence-high"],
        individualSnapshotIds:
          privateVariant === "low"
            ? ["private-snapshot-low"]
            : ["private-snapshot-high"],
        pairEvaluationSnapshotIds: evaluationKeys.map(
          (_factorKey, evaluationIndex) => `pair-evaluation-${evaluationIndex}`,
        ),
      },
    },
    answers: {
      closeness: privateVariant === "low" ? 0.01 : 0.99,
      fatigue: privateVariant === "low" ? 0.02 : 0.98,
      irritation: privateVariant === "low" ? 0.03 : 0.97,
      readiness: privateVariant === "low" ? 0.04 : 0.96,
      unresolvedTopic: privateVariant === "high",
      note:
        privateVariant === "low" ? "PRIVATE_WEEKLY_LOW" : "PRIVATE_WEEKLY_HIGH",
    },
  }));

const projectionInput = {
  cycleKey: "2026-W32",
  members: ["member-a", "member-b"] as [string, string],
  endsAt: new Date("2026-08-17T00:00:00.000Z"),
  now: new Date("2026-08-11T12:00:00.000Z"),
};
const projectionLow = buildPairStateProjection({
  ...projectionInput,
  checkIns: checkIns("low"),
  evaluations: evaluations("low"),
});
const projectionHigh = buildPairStateProjection({
  ...projectionInput,
  checkIns: checkIns("high"),
  evaluations: evaluations("high"),
});
assert.deepEqual(
  projectionLow,
  projectionHigh,
  "coarse weekly projection must not reconstruct exact answers or evaluation internals",
);
const oneSidedLow = buildPairStateProjection({
  ...projectionInput,
  checkIns: checkIns("low").slice(0, 1),
  evaluations: evaluations("low"),
});
const oneSidedHigh = buildPairStateProjection({
  ...projectionInput,
  checkIns: checkIns("high").slice(0, 1),
  evaluations: evaluations("high"),
});
assert.deepEqual(oneSidedLow, oneSidedHigh);
assert.equal(oneSidedLow.dataStatus, "PARTIAL");
assert.deepEqual(oneSidedLow.signals, []);

// Central pair disclosure returns only a coarse band and stable semantic status.
const pairEvaluation = (
  variant: "left" | "right",
): PairFactorEvaluationSnapshot => ({
  snapshotId:
    variant === "left" ? "PRIVATE_PAIR_EVAL_LEFT" : "PRIVATE_PAIR_EVAL_RIGHT",
  pairId: "pair-1",
  memberAId: variant === "left" ? "PRIVATE_MEMBER_A" : "OTHER_MEMBER_A",
  memberBId: variant === "left" ? "PRIVATE_MEMBER_B" : "OTHER_MEMBER_B",
  factorKey: "communication.weekly.connection",
  context: "COMMITTED_RELATIONSHIP",
  strategy: "SIMILARITY",
  strategyVersion: 1,
  directionality: "SYMMETRIC",
  revision: variant === "left" ? 1 : 999,
  evaluation: {
    strategy: "SIMILARITY",
    context: "COMMITTED_RELATIONSHIP",
    status: "ALIGNED",
    internalFit: variant === "left" ? 0.41 : 0.74,
    confidence: variant === "left" ? 0.41 : 0.74,
    reasonCodes: variant === "left" ? ["VALUES_ALIGNED"] : ["GAP_WORKABLE"],
    actionability: "AWARENESS",
    directionalFit: {
      aAcceptsB: variant === "left" ? 0.01 : 0.99,
      bAcceptsA: variant === "left" ? 0.02 : 0.98,
    },
    roleMetrics: {
      coverage: variant === "left" ? 0.01 : 0.99,
      loadImbalance: variant === "left" ? 0.99 : 0.01,
      preferenceSatisfaction: variant === "left" ? 0.02 : 0.98,
    },
  },
  individualSnapshotIds:
    variant === "left"
      ? ["PRIVATE_INDIVIDUAL_A", "PRIVATE_INDIVIDUAL_B"]
      : ["OTHER_INDIVIDUAL_A", "OTHER_INDIVIDUAL_B"],
  pairSnapshotId:
    variant === "left" ? "PRIVATE_PAIR_SNAPSHOT" : "OTHER_PAIR_SNAPSHOT",
  versions: {
    registryVersion: 2,
    definitionVersion: 2,
    algorithmVersion: 2,
    snapshotVersion: 1,
    displayVersion: 1,
    measurementRefs: [],
    instrumentRefs: [],
  },
  inputHash: variant === "left" ? "PRIVATE_INPUT_HASH" : "OTHER_INPUT_HASH",
  outputHash: variant === "left" ? "PRIVATE_OUTPUT_HASH" : "OTHER_OUTPUT_HASH",
  calculatedAt: new Date("2026-08-11T00:00:00.000Z"),
  effectiveFrom: new Date("2026-08-11T00:00:00.000Z"),
});
const normalPartnerFactor = MVP_FACTOR_REGISTRY.factors.find(
  (factor) => factor.privacyClass === "NORMAL",
);
const sensitivePartnerFactor = MVP_FACTOR_REGISTRY.factors.find(
  (factor) => factor.privacyClass === "SENSITIVE",
);
const matchingOnlyPartnerFactor = MVP_FACTOR_REGISTRY.factors.find(
  (factor) => factor.privacyClass === "MATCHING_ONLY",
);
assert.ok(normalPartnerFactor);
assert.ok(sensitivePartnerFactor);
assert.ok(matchingOnlyPartnerFactor);
const disclosedNormalPartnerFactor = discloseFactor(
  normalPartnerFactor,
  {
    status: "AVAILABLE",
    value: { kind: "SCALAR", value: 0.61 },
    confidence: 0.93,
  },
  "PARTNER",
  { partnerDisclosure: true, matchingUse: true },
);
assert.equal(disclosedNormalPartnerFactor.disclosure, "SUMMARY_ONLY");
assertSerializedOmits(
  "normal partner Factor disclosure",
  disclosedNormalPartnerFactor,
  ["value", "confidence"],
);
const forbiddenPartnerFactorDisclosures = [
  sensitivePartnerFactor,
  matchingOnlyPartnerFactor,
].map((definition) => ({
  definition,
  disclosure: discloseFactor(
    definition,
    {
      status: "AVAILABLE",
      value: { kind: "SCALAR", value: 0.61 },
      confidence: 0.93,
    },
    "PARTNER",
    { partnerDisclosure: true, matchingUse: true },
  ),
}));
for (const { definition, disclosure } of forbiddenPartnerFactorDisclosures) {
  assert.equal(disclosure.disclosure, "WITHHELD");
  assertSerializedOmits(
    `${definition.privacyClass} partner Factor disclosure`,
    disclosure,
    ["status", "value", "confidence", "confidenceBand"],
  );
}
assert.deepEqual(
  forbiddenPartnerFactorDisclosures[0]?.disclosure,
  forbiddenPartnerFactorDisclosures[1]?.disclosure,
  "withheld partner disclosure must not identify sensitive vs matching-only privacy class",
);

const pairDisclosureLeft = disclosePairEvaluation(
  pairEvaluation("left"),
  "PAIR_MEMBER",
  true,
);
const pairDisclosureRight = disclosePairEvaluation(
  pairEvaluation("right"),
  "PAIR_MEMBER",
  true,
);
assert.deepEqual(pairDisclosureLeft, pairDisclosureRight);
assertSerializedOmits(
  "pair evaluation disclosure",
  pairDisclosureLeft,
  RAW_PARTICIPANT_FIELDS,
);
assert.equal(
  disclosePairEvaluation(pairEvaluation("left"), "PUBLIC", true).disclosure,
  "WITHHELD",
);
assert.equal(
  disclosePairEvaluation(pairEvaluation("left"), "PAIR_MEMBER", false)
    .disclosure,
  "WITHHELD",
);

// Activity projection is invariant to private feedback values, evidence IDs and
// recommendation provenance.
const activityResult = (variant: "left" | "right"): ActivityResultSummary => ({
  submittedBy: ["A", "B"],
  submittedCount: 2,
  bothSubmitted: true,
  successScore: variant === "left" ? 0.01 : 0.99,
  status: "completed_success",
  usefulnessAvg: variant === "left" ? 0.01 : 0.99,
  comfortAvg: variant === "left" ? 0.02 : 0.98,
  tensionAvg: variant === "left" ? 0.99 : 0.01,
  wantsSimilarRatio: variant === "left" ? 0.03 : 0.97,
  participationRatio: variant === "left" ? 0.04 : 0.96,
  subjectiveChangeAvg: variant === "left" ? 0.05 : 0.95,
  difficultyAvg: variant === "left" ? 0.06 : 0.94,
  feedbackSchemaVersion: "activity-feedback-v2",
  factorEvidenceRecorded: true,
  factorEvidence: {
    taskResultEventIds: [`PRIVATE_TASK_EVENT_${variant}`],
    pairActivityEventIds: [`PRIVATE_PAIR_ACTIVITY_EVENT_${variant}`],
    individualSnapshotIds: [`PRIVATE_ACTIVITY_INDIVIDUAL_${variant}`],
    pairSnapshotIds: [`PRIVATE_ACTIVITY_PAIR_${variant}`],
    pairEvaluationSnapshotIds: [`PRIVATE_ACTIVITY_EVALUATION_${variant}`],
    recordedAt: new Date("2026-08-11T12:00:00.000Z"),
  },
  explanation: {
    ru: `PRIVATE_ACTIVITY_EXPLANATION_${variant}`,
    en: `PRIVATE_ACTIVITY_EXPLANATION_EN_${variant}`,
  },
  completedAt: new Date("2026-08-11T12:00:00.000Z"),
  resultVersion: "activity-result-v2",
});
const activity = (
  variant: "left" | "right",
): PairActivityType & { _id: Types.ObjectId } => ({
  _id: new Types.ObjectId("507f1f77bcf86cd799439021"),
  pairId: new Types.ObjectId("507f1f77bcf86cd799439011"),
  members: [
    new Types.ObjectId("507f1f77bcf86cd799439012"),
    new Types.ObjectId("507f1f77bcf86cd799439013"),
  ],
  intent: "improve",
  archetype: "dialogue",
  actionDefinition: {
    key: "conversation.short",
    actionVersion: 1,
    registryVersion: 2,
  },
  targetFactorKeys: ["communication.weekly.connection"],
  title: { ru: "Короткий разговор", en: "Short conversation" },
  description: { ru: "Описание", en: "Description" },
  why: {
    ru: `PRIVATE_SENSITIVE_REASON_${variant}`,
    en: `PRIVATE_SENSITIVE_REASON_EN_${variant}`,
  },
  mode: "together",
  sync: "sync",
  difficulty: 2,
  intensity: 1,
  offeredAt: new Date("2026-08-11T10:00:00.000Z"),
  status: "completed_success",
  feedbackSchemaVersion: "activity-feedback-v2",
  stateMeta: {
    decisionVersion: "activity-decision-v2",
    primaryReason: `PRIVATE_PRIMARY_REASON_${variant}`,
    privateScore: variant === "left" ? 0.01 : 0.99,
  },
  checkIns: [],
  answers: [
    {
      checkInId: "usefulness",
      by: "B",
      ui: variant === "left" ? 1 : 5,
      at: new Date("2026-08-11T11:00:00.000Z"),
      feedbackRevision: 1,
      captureMode: "PRIVATE",
      policyVersion: "activity-feedback-policy-v1",
      consentRevision: "not-granted",
    },
  ],
  successScore: variant === "left" ? 0.01 : 0.99,
  factorEvidence: activityResult(variant).factorEvidence,
  resultSummary: activityResult(variant),
  createdBy: "system",
});
const activityDtoLeft = toPairActivityDTO(activity("left"), {
  includeAnswers: true,
});
const activityDtoRight = toPairActivityDTO(activity("right"), {
  includeAnswers: true,
});
assert.deepEqual(activityDtoLeft, activityDtoRight);
assertSerializedOmits(
  "activity DTO",
  activityDtoLeft,
  INTERNAL_ACTIVITY_FIELDS,
);
assertNoSecrets("activity DTO", activityDtoLeft, [
  "PRIVATE_ACTIVITY_",
  "PRIVATE_PRIMARY_REASON_",
  "PRIVATE_SENSITIVE_REASON_",
]);
assert.deepEqual(
  toActivityResultSummaryDTO(activityResult("left")),
  toActivityResultSummaryDTO(activityResult("right")),
);

// Pair-event projection collapses private ranking, factor targeting and provenance
// to a single generated-activity boolean.
const pairEvent = (
  variant: "left" | "right",
): PairEventTypeModel & { _id: Types.ObjectId } => ({
  _id: new Types.ObjectId("507f1f77bcf86cd799439031"),
  pairId: new Types.ObjectId("507f1f77bcf86cd799439011"),
  key:
    variant === "left" ? "PRIVATE_EVENT_KEY_LEFT" : "PRIVATE_EVENT_KEY_RIGHT",
  category: "behavioral_event",
  type: "weekly_tension_support",
  title: { ru: "Небольшой шаг", en: "Small step" },
  description: { ru: "Описание", en: "Description" },
  why: { ru: "Нейтральное объяснение", en: "Neutral explanation" },
  windowStart: new Date("2026-08-11T00:00:00.000Z"),
  windowEnd: new Date("2026-08-18T00:00:00.000Z"),
  status: "offered",
  priority: variant === "left" ? 1 : 3,
  severity: variant === "left" ? 1 : 3,
  factorRegistryVersion: variant === "left" ? 1 : 999,
  targetFactorKeys: [
    variant === "left" ? "PRIVATE_FACTOR_LEFT" : "PRIVATE_FACTOR_RIGHT",
  ],
  source: {
    kind: "weekly_pair_state",
    refId: variant === "left" ? "PRIVATE_SOURCE_LEFT" : "PRIVATE_SOURCE_RIGHT",
  },
  actionPolicy: {
    canAccept: true,
    canDecline: true,
    canSnooze: false,
    maxGeneratedActivities: variant === "left" ? 1 : 3,
  },
  generatedActivityIds: [
    new Types.ObjectId(
      variant === "left"
        ? "507f1f77bcf86cd799439032"
        : "507f1f77bcf86cd799439033",
    ),
  ],
});
const pairEventDtoLeft = toPairEventDTO(pairEvent("left"));
const pairEventDtoRight = toPairEventDTO(pairEvent("right"));
assert.deepEqual(pairEventDtoLeft, pairEventDtoRight);
assert.equal(pairEventDtoLeft.hasGeneratedActivity, true);
assertSerializedOmits("pair event DTO", pairEventDtoLeft, [
  "priority",
  "severity",
  "targetFactorKeys",
  "generatedActivityIds",
  "source",
]);
assertNoSecrets("pair event DTO", pairEventDtoLeft, [
  "PRIVATE_EVENT_",
  "PRIVATE_FACTOR_",
  "PRIVATE_SOURCE_",
]);

// Pair and dashboard normalizers drop legacy numeric progress and opaque activity
// identifiers instead of carrying them forward by structural spread.
const pair = (variant: "left" | "right"): PairType & { _id: string } => ({
  _id: "507f1f77bcf86cd799439011",
  members: ["member-a", "member-b"],
  key: "member-a|member-b",
  status: "active",
  contextVersion: "pair-context-v1",
  progress: {
    streak: variant === "left" ? 1 : 999,
    completed: variant === "left" ? 2 : 998,
  },
  activeActivity: {
    type: "task",
    id:
      variant === "left"
        ? "PRIVATE_ACTIVE_ACTIVITY_LEFT"
        : "PRIVATE_ACTIVE_ACTIVITY_RIGHT",
    pct: variant === "left" ? 0.01 : 0.99,
  },
});
assert.deepEqual(toPairDTO(pair("left")), toPairDTO(pair("right")));
assertSerializedOmits("pair DTO", toPairDTO(pair("left")), [
  "progress",
  "activeActivity",
  "streak",
  "completed",
  "pct",
]);

type PrivatePairSummaryInput = PairSummaryInput & {
  lastLike: { answers: number[]; matchScore: number; note: string };
  progress: { streak: number; completed: number };
};
const pairSummary = (variant: "left" | "right"): PrivatePairSummaryInput => ({
  pair: {
    id: "507f1f77bcf86cd799439011",
    members: ["member-a", "member-b"],
    key: "member-a|member-b",
    status: "active",
  },
  members: [],
  peer: null,
  currentActivity: null,
  suggestedCount: 0,
  hasCurrentWeeklyCheckIn: true,
  lastLike: {
    answers: variant === "left" ? [1, 1, 1] : [5, 5, 5],
    matchScore: variant === "left" ? 0.01 : 0.99,
    note:
      variant === "left" ? "PRIVATE_LAST_LIKE_LEFT" : "PRIVATE_LAST_LIKE_RIGHT",
  },
  progress: {
    streak: variant === "left" ? 1 : 999,
    completed: variant === "left" ? 2 : 998,
  },
});
const pairSummaryLeft = normalizePairSummary(pairSummary("left"));
const pairSummaryRight = normalizePairSummary(pairSummary("right"));
assert.ok(pairSummaryLeft && pairSummaryRight);
assert.deepEqual(pairSummaryLeft, pairSummaryRight);
assertSerializedOmits("pair summary", pairSummaryLeft, [
  ...RAW_PARTICIPANT_FIELDS,
  "lastLike",
  "progress",
]);

// History projects only canonical cycle status and at most four coarse signals.
type PrivateHistoryCycle = Parameters<
  typeof projectCanonicalHistoryCycle
>[0] & {
  peerAnswers: { note: string; exactValue: number };
};
const historyCycle = (variant: "left" | "right"): PrivateHistoryCycle => ({
  cycleKey: "2026-W32",
  occurredAt: new Date("2026-08-11T12:00:00.000Z"),
  snapshot: {
    dataStatus: "ENOUGH",
    signals: [
      {
        key: "connection",
        status: "STEADY",
        reasonCode: variant === "left" ? "PAIR_LEVEL_LOW" : "PAIR_LEVEL_HIGH",
        nextStepHint:
          variant === "left" ? "CHECK_IN_TOGETHER" : "KEEP_CURRENT_RHYTHM",
      },
    ],
  },
  peerAnswers: {
    note: variant === "left" ? "PRIVATE_HISTORY_LEFT" : "PRIVATE_HISTORY_RIGHT",
    exactValue: variant === "left" ? 0.01 : 0.99,
  },
});
const historyLeft = projectCanonicalHistoryCycle(historyCycle("left"));
const historyRight = projectCanonicalHistoryCycle(historyCycle("right"));
assert.deepEqual(historyLeft, historyRight);
assertSerializedOmits("history item", historyLeft, RAW_PARTICIPANT_FIELDS);
assertNoSecrets("history item", historyLeft, ["PRIVATE_HISTORY_"]);

// Notification payload is fixed by semantic type; storage identity and dedupe data
// cannot become a factor-topic side channel.
const notification = (
  variant: "left" | "right",
): NotificationDocumentType & { _id: string } => ({
  _id: "507f1f77bcf86cd799439041",
  userId:
    variant === "left"
      ? "PRIVATE_NOTIFICATION_USER_LEFT"
      : "PRIVATE_NOTIFICATION_USER_RIGHT",
  pairId: new Types.ObjectId(
    variant === "left"
      ? "507f1f77bcf86cd799439042"
      : "507f1f77bcf86cd799439043",
  ),
  type: "SUMMARY_READY",
  dedupeKey:
    variant === "left"
      ? "PRIVATE_NOTIFICATION_FACTOR_LEFT"
      : "PRIVATE_NOTIFICATION_FACTOR_RIGHT",
  expiresAt: new Date("2026-09-11T00:00:00.000Z"),
  createdAt: new Date("2026-08-11T12:00:00.000Z"),
  updatedAt: new Date("2026-08-11T12:00:00.000Z"),
});
const notificationLeft = toNotificationDTO(notification("left"));
const notificationRight = toNotificationDTO(notification("right"));
assert.deepEqual(notificationLeft, notificationRight);
assertSerializedOmits("notification DTO", notificationLeft, [
  "payload",
  "factorKey",
  "factorKeys",
  "targetFactorKeys",
  "topic",
  "topics",
]);
assertNoSecrets("notification DTO", notificationLeft, [
  "PRIVATE_NOTIFICATION_",
]);

// A PartnerSignal transports only explicitly confirmed copy. Legacy inferred tone
// and source check-in identity are deliberately neutralized.
const partnerSignal = (
  variant: "left" | "right",
): PartnerSignalType & { _id: Types.ObjectId; computedMode: string } => ({
  _id: new Types.ObjectId("507f1f77bcf86cd799439051"),
  pairId: new Types.ObjectId(
    variant === "left"
      ? "507f1f77bcf86cd799439052"
      : "507f1f77bcf86cd799439053",
  ),
  fromUserId: "member-a",
  toUserId:
    variant === "left" ? "PRIVATE_RECEIVER_LEFT" : "PRIVATE_RECEIVER_RIGHT",
  sourceCheckInId: new Types.ObjectId(
    variant === "left"
      ? "507f1f77bcf86cd799439054"
      : "507f1f77bcf86cd799439055",
  ),
  dateKey: "2026-08-11",
  text: "Я рядом, если захочешь поговорить.",
  tone: variant === "left" ? "low_resource" : "repair",
  status: "sent",
  expiresAt: new Date("2026-09-10T12:00:00.000Z"),
  createdAt: new Date("2026-08-11T12:00:00.000Z"),
  updatedAt: new Date("2026-08-11T12:00:00.000Z"),
  computedMode: variant === "left" ? "PRIVATE_MODE_LEFT" : "PRIVATE_MODE_RIGHT",
});
const incomingSignalLeft = sanitizeIncomingPartnerSignal({
  signal: partnerSignal("left"),
  sender: null,
});
const incomingSignalRight = sanitizeIncomingPartnerSignal({
  signal: partnerSignal("right"),
  sender: null,
});
assert.deepEqual(incomingSignalLeft, incomingSignalRight);
assert.equal(incomingSignalLeft.tone, "neutral");
assertSerializedOmits("incoming partner signal", incomingSignalLeft, [
  "pairId",
  "sourceCheckInId",
  "computedMode",
]);
assertNoSecrets("incoming partner signal", incomingSignalLeft, [
  "PRIVATE_MODE_",
  "PRIVATE_RECEIVER_",
]);

// Generic runtime failures must not surface raw exception or server payload text.
const runtimeSecret = "PRIVATE_RUNTIME_FAILURE_DETAIL";
const domainError = toDomainError(new Error(runtimeSecret));
assert.equal(domainError.message.includes(runtimeSecret), false);
const genericUiError = toUiErrorState(new Error(runtimeSecret));
assert.equal(genericUiError.message.includes(runtimeSecret), false);
const serverUiError = toUiErrorState(
  new ApiClientError({
    status: 503,
    code: "INTERNAL",
    message: runtimeSecret,
    details: { note: runtimeSecret },
  }),
);
assert.equal(serverUiError.message.includes(runtimeSecret), false);
assert.equal(serverUiError.details, undefined);

// Product analytics has a closed technical-only shape.
const originalConsoleInfo = console.info;
console.info = () => undefined;
const analyticsEvent = recordProductAnalyticsEvent({
  name: "pair_summary_viewed",
  technicalScope: "pair_summary",
  at: new Date("2026-08-11T12:00:00.000Z"),
});
console.info = originalConsoleInfo;
assert.deepEqual(Object.keys(analyticsEvent).sort(), [
  "eventId",
  "flowVersion",
  "name",
  "technicalScope",
  "timestamp",
]);
assertSerializedOmits("product analytics", analyticsEvent, [
  ...RAW_PARTICIPANT_FIELDS,
  "userId",
  "pairId",
  "payload",
]);

// Audit metadata defense is normalized, recursive and independent of caller case.
const auditSecret = "PRIVATE_AUDIT_SECRET";
const sanitizedAudit = sanitizeAuditMetadata({
  safeOutcome: "completed",
  Answers: { closeness: auditSecret },
  "peer-answers": [auditSecret],
  raw_notes: auditSecret,
  exactConfidence: auditSecret,
  confidence: 0.99,
  evidence_count: 99,
  EvidenceEventIDs: [auditSecret],
  individual_snapshot_ids: [auditSecret],
  pairEvaluationSnapshotIds: [auditSecret],
  InternalFit: 0.99,
  directional_fit: { aAcceptsB: 0.99 },
  input_hash: auditSecret,
  SafetyGateState: true,
  sensitive_reason: auditSecret,
  nested: {
    safeStatus: "ok",
    rawReason: auditSecret,
    note: auditSecret,
  },
});
assertNoSecrets("sanitized audit metadata", { sanitizedAudit }, [auditSecret]);
assert.equal(JSON.stringify(sanitizedAudit).includes("safeOutcome"), true);
assert.equal(JSON.stringify(sanitizedAudit).includes("safeStatus"), true);

assertTypeOmits("src/lib/audit/eventTypes.ts", "AuditEventMetadataMap", [
  "answeredCount",
  "matchedCount",
  "factorEvidenceCount",
  "individualFactorSnapshotCount",
  "pairEvaluationSnapshotCount",
]);
assertTypeOmits(
  "src/lib/audit/eventTypes.ts",
  "AuditEventMetadataMap",
  ["text", "message", "sourceCheckInId"],
  ["PARTNER_SIGNAL_SENT"],
);
assertTypeOmits(
  "src/lib/audit/eventTypes.ts",
  "AuditEventMetadataMap",
  ["enabled", "reason", "reasonCode", "note"],
  ["SAFETY_GATE_UPDATED"],
);
assertTypeOmits(
  "src/lib/audit/eventTypes.ts",
  "AuditEventMetadataMap",
  [
    "answers",
    "note",
    "confidence",
    "factorEvidenceCount",
    "individualFactorSnapshotCount",
    "pairEvaluationSnapshotCount",
    "evidenceEventIds",
    "individualSnapshotIds",
    "pairEvaluationSnapshotIds",
  ],
  ["WEEKLY_CHECKIN_SUBMITTED"],
);

const NORMALIZED_AUDIT_FORBIDDEN = new Set([
  "answers",
  "peeranswers",
  "rawanswers",
  "note",
  "notes",
  "confidence",
  "internalfit",
  "internalscore",
  "successscore",
  "deltas",
  "matchscore",
  "evidencecount",
  "factorevidencecount",
  "evidenceids",
  "evidenceeventids",
  "individualsnapshotids",
  "pairsnapshotids",
  "pairevaluationsnapshotids",
  "sourcehash",
  "inputhash",
  "outputhash",
  "safetygate",
  "safetygatestate",
  "safetyveto",
  "sensitiveReason".toLowerCase(),
  "rawreason",
]);
const normalizeAuditKey = (key: string): string =>
  key.toLowerCase().replace(/[^a-z0-9]/g, "");

const typescriptFilesBelow = (directory: string): string[] => {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...typescriptFilesBelow(absolute));
    } else if (entry.isFile() && /\.tsx?$/.test(entry.name)) {
      files.push(absolute);
    }
  }
  return files;
};

for (const absolute of typescriptFilesBelow(join(root, "src"))) {
  const path = relative(root, absolute).replaceAll("\\", "/");
  const parsed = sourceFile(path);
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "emitEvent" &&
      node.arguments[0] &&
      ts.isObjectLiteralExpression(node.arguments[0])
    ) {
      const metadata = node.arguments[0].properties.find(
        (property): property is ts.PropertyAssignment =>
          ts.isPropertyAssignment(property) &&
          propertyName(property.name) === "metadata",
      );
      if (metadata && ts.isObjectLiteralExpression(metadata.initializer)) {
        for (const key of nestedPropertyNames(metadata.initializer)) {
          assert.equal(
            NORMALIZED_AUDIT_FORBIDDEN.has(normalizeAuditKey(key)),
            false,
            `${path} sends forbidden audit metadata key ${key}`,
          );
        }
      }
    }
    node.forEachChild(visit);
  };
  visit(parsed);
}

// Owner export selection is owner-scoped for raw records and centrally disclosed
// for pair evaluations. SafetyGate stays owner-scoped and received inferred tone is
// never exported.
const privacyExportAst = sourceFile(
  "src/domain/services/privacyExport.service.ts",
);
const privacyExportText = privacyExportAst.getFullText();
assert.match(
  privacyExportText,
  /PairQuestionnaireAnswer\.find\(\{\s*\$or:\s*questionnaireOwnerClauses\s*\}\)/,
);
assert.match(
  privacyExportText,
  /actorId:\s*ownerUserId[\s\S]{0,180}subjectId:\s*ownerUserId[\s\S]{0,180}observationScope:\s*["']SELF["']/,
);
assert.match(privacyExportText, /SafetyGate\.find\(\{\s*ownerUserId\s*\}\)/);
assert.match(
  privacyExportText,
  /disclosePairEvaluation\([\s\S]{0,180}["']PAIR_MEMBER["'],[\s\S]{0,40}true/,
);
assert.match(
  privacyExportText,
  /fromUserId\s*===\s*ownerUserId[\s\S]{0,180}tone[\s\S]{0,80}["']neutral["']/,
);

const participantBoundaryFiles = [
  "src/domain/services/weeklyCheckIn.service.ts",
  "src/domain/services/weeklyCycle.service.ts",
  "src/domain/services/pairDashboardSummary.service.ts",
  "src/domain/services/pairHistory.service.ts",
  "src/lib/dto/notification.dto.ts",
  "src/lib/dto/pair.dto.ts",
  "src/lib/dto/pairEvent.dto.ts",
] as const;
for (const path of participantBoundaryFiles) {
  const importsSafetyGate = sourceFile(path).statements.some(
    (statement) =>
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text.includes("SafetyGate"),
  );
  assert.equal(
    importsSafetyGate,
    false,
    `${path} imports owner-private SafetyGate`,
  );
}

const auditEmitterText = sourceFile("src/lib/audit/emitEvent.ts").getFullText();
assert.equal(
  /catch[\s\S]{0,300}error\.message/.test(auditEmitterText),
  false,
  "audit failure logging exposes raw exception messages",
);

console.log("participant disclosure selfcheck passed");
