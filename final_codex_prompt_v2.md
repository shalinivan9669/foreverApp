# FINAL PROMPT FOR CODEX

You are working inside the repository of the Next.js / React / MongoDB / Mongoose app **“Вместе” / “foreverApp”**.

You have **no context from previous chats**. Treat this prompt as the source of truth.

Your task is **not** a UI redesign. Focus on:

- backend/domain architecture;
- MongoDB/Mongoose models;
- DTOs;
- API routes;
- vector scoring correctness;
- migrations/backward compatibility;
- pair diagnostics;
- pair passport;
- deterministic insights;
- weekly check-ins;
- tests/selfchecks;
- safe product wording.

The app must **not** become a pseudo-psychological toy. All diagnostics, insights, and profile texts must be phrased as **answer-based, confidence-aware, non-medical, non-final observations**.

---

## 0. Non-negotiable rules

### Product safety

Do **not** generate or introduce user-facing wording that labels people as mentally defective, diagnosed, doomed, or pathologized.

Forbidden as conclusions, labels, titles, diagnoses, or generated/static user-facing claims:

- `диагноз`
- `нарцисс`
- `психопат`
- `травма`
- `психическое расстройство`
- `плохая психика`
- `вы несовместимы`
- `отношения обречены`
- `mentally bad`
- `narcissistic`
- `traumatized`
- `psychopath`
- `mental disorder`
- `doomed relationship`

Allowed safe patterns:

- `по ответам видно...`
- `это не диагноз...`
- `это не приговор...`
- `данных пока мало...`
- `лучше не начинать тяжёлый разговор без подготовки...`
- `стоит обсудить правила заранее...`

Important nuance for selfchecks: the phrase `это не диагноз` is allowed only as an explicit disclaimer. Do not fail the safety selfcheck on this exact allowed disclaimer, but do fail on diagnosis-like conclusions or labels.

### Engineering discipline

- Do not do UI redesign.
- Do not rewrite working routes unnecessarily.
- Prefer adding domain services and adapting existing handlers.
- Preserve backward compatibility for old database documents and old DTO fields.
- Keep existing pages/routes working.
- Do not delete existing data or introduce destructive migrations.
- Do not fake “smart” AI text and call it complete.
- Do not silently skip checks.
- Do not finish with broken TypeScript.
- If a feature cannot be implemented safely in this pass, add an explicit `TODO` with file path and reason, while keeping the build green.
- If checks fail because of pre-existing unrelated issues, report the exact command, error, and file.

### Scale rule

All internal vector levels are always stored on a `0..1` scale.

UI may display `0..100`.

Pair diagnostic thresholds must never be greater than `1`.

If current code uses constants like this while vectors are `0..1`:

```ts
const HIGH = 2.0;
const DELTA = 2.0;
```

fix them.

---

## 1. First: repo inventory before coding

Before editing code, inspect the repository and produce a brief inventory.

Find and report the current state of:

- repository structure;
- existing models;
- existing services;
- existing DTOs;
- existing API routes;
- existing scoring/vector logic;
- existing pair diagnostics/passport logic;
- existing insights logic;
- existing weekly check-in logic, if any;
- existing tests/selfchecks;
- package scripts.

Specifically inspect these paths if they exist:

```txt
src/models/User.ts
src/models/Question.ts
src/models/Questionnaire.ts
src/models/Pair.ts
src/models/PairQuestionnaireSession.ts
src/models/PairQuestionnaireAnswer.ts
src/models/Insight.ts
src/models/Log.ts
src/domain/services/questionnaires.service.ts
src/domain/services/pairs.service.ts
src/domain/vectors/*
src/app/api/users/me/profile-summary/route.ts
src/app/api/pairs/[id]/diagnostics/route.ts
src/app/api/questionnaires/*
src/app/api/answers/*
src/app/api/pairs/*
scripts/*
package.json
```

Also search for:

```txt
User.vectors
vectors.communication.level
buildPassport
profile-summary
diagnostics
insights
weekly_checkin
weekly checkin
applyDeltaToUserVectors
HIGH = 2
DELTA = 2
```

After inventory, produce an implementation plan in phases. Then implement the highest-value safe subset according to the priority order below.

Do not start by rewriting everything.

---

## 2. Current domain context

The app already has or is expected to have:

- users;
- questionnaires;
- questions;
- answers;
- user profile;
- matching by vectors;
- pair profile / pair diagnostics;
- pair questionnaire sessions and answers;
- basic activities;
- DTO/API routes/domain services;
- possibly logs/audit infrastructure.

The product uses 6 profile axes:

```ts
export type Axis =
  | 'communication'
  | 'domestic'
  | 'personalViews'
  | 'finance'
  | 'sexuality'
  | 'psyche';
```

Current or old `User.vectors.*` may look like a flat model:

```ts
vectors: {
  communication: {
    level: number,
    positives: string[],
    negatives: string[]
  }
}
```

The target is a layered vector model.

---

## 3. Target vector architecture

### Required vector layers

```ts
export type VectorLayer =
  | 'trait'
  | 'state'
  | 'matching'
  | 'displayed';
```

Meaning:

- `trait` — relatively stable user profile;
- `state` — current temporary condition/resource/readiness/fatigue;
- `matching` — compatibility/search vector;
- `displayed` — derived profile value shown in UI;
- pair-context must **not** blindly overwrite `trait`;
- pair-specific data should affect `PairPassport`, `PairDiagnostics`, pair context, trends, and insights, not stable baseline trait.

### Target `User.vectors` structure

For each axis:

```ts
{
  trait: {
    level: number;          // 0..1
    confidence: number;     // 0..1
    evidenceCount: number;
    positives: string[];
    negatives: string[];
    lastQuestionnaireId?: ObjectId | string;
    lastSessionId?: ObjectId | string;
    scoringVersion: string;
    updatedAt?: Date;
  },

  state: {
    level: number;          // 0..1
    confidence: number;     // 0..1
    evidenceCount: number;
    positives: string[];
    negatives: string[];
    lastQuestionnaireId?: ObjectId | string;
    lastSessionId?: ObjectId | string;
    scoringVersion: string;
    updatedAt?: Date;
  },

  matching: {
    level: number;          // 0..1
    confidence: number;     // 0..1
    evidenceCount: number;
    positives: string[];
    negatives: string[];
    lastQuestionnaireId?: ObjectId | string;
    lastSessionId?: ObjectId | string;
    scoringVersion: string;
    updatedAt?: Date;
  },

  displayed: {
    level: number;          // 0..1, derived
    confidence: number;     // 0..1
    source: 'trait' | 'state_adjusted' | 'insufficient_data';
    updatedAt?: Date;
  }
}
```

### Backward compatibility

If the database or old code has:

```ts
vectors.communication.level
vectors.communication.positives
vectors.communication.negatives
```

read it as:

```ts
vectors.communication.trait.level
vectors.communication.trait.positives
vectors.communication.trait.negatives
```

Do not break existing pages/routes.

Prefer backward-compatible schema additions.

Create or update helper functions, for example:

```ts
readAxisLayer(user, axis, layer)
readLegacyOrLayeredAxis(user, axis)
normalizeUserVectors(user)
```

Recommended behavior:

- `readAxisLayer()` returns normalized layered data for one layer;
- `readLegacyOrLayeredAxis()` accepts both old flat and new layered vector formats;
- `normalizeUserVectors()` converts missing/legacy structures into a complete layered shape in memory and, where safe, before save;
- all returned levels/confidence values must be clamped to `0..1`;
- evidence counts must never be negative;
- old `positives`/`negatives` must not be lost.

---

## 4. Questionnaire types and influence policy

Add or prepare support for:

```ts
export type QuestionnaireType =
  | 'onboarding'
  | 'baseline'
  | 'state'
  | 'pair'
  | 'weekly_checkin'
  | 'crisis'
  | 'compatibility';
```

Influence policy:

- `onboarding` → may initialize `trait` with low confidence;
- `baseline` → updates `trait` slowly;
- `state` → updates `state`, readiness/fatigue, not trait;
- `pair` → updates `PairPassport` / `PairDiagnostics` / pair context, not trait directly;
- `weekly_checkin` → updates state/readiness/fatigue and pair trends;
- `crisis` → updates temporary risk markers/state/pair crisis context, not trait;
- `compatibility` → updates `matching` vector, not state/pair/fatigue.

If the existing code has only partial questionnaire types, extend carefully and keep old seeds/data valid.

---

## 5. Question model target

Extend the existing `Question` / `Questionnaire` models carefully and backward-compatibly.

Each question should support:

```ts
axis: Axis;
facet: string;
polarity: 1 | -1 | '+' | '-';
scale: {
  type: 'likert_5' | 'likert5' | 'bool' | 'yes_no' | 'single_choice' | 'slider_0_100';
  min?: number;
  max?: number;
  neutral?: number;
  options?: Array<{
    value: string | number;
    label: string;
    normalized?: number;
    contribution?: number;
  }>;
};
map?: Array<number> | Array<{
  answerValue: string | number;
  normalized: number;
  contribution?: number;
  facetSignal?: 'positive' | 'negative' | 'neutral';
}>;
weight: number;
audience?: string[];
scope?: 'solo' | 'pair' | 'matching' | 'system';
sensitivity?: 'low' | 'medium' | 'high' | 'crisis';
version?: string | number;
reverseScoring?: boolean;
confidenceWeight?: number;
tags?: string[];
locale?: 'ru' | 'en' | 'kk';
explanation?: string | Record<string, string>;
scoringVersion?: string;
```

Compatibility requirements:

- Do not break old seed/questions where `scale = 'likert5'`.
- Do not break old polarity values `'+'` / `'-'`.
- Do not break old `map: number[]` format.
- If current model already has some fields, extend it instead of replacing it destructively.
- If a field cannot be fully used yet, store it safely and document TODO usage.

---

## 6. Vector scoring service

Create or refactor a dedicated domain scoring service:

```txt
src/domain/services/vectorScoring.service.ts
```

Required exported functions:

```ts
normalizeAnswer()
scoreAnswer()
scoreAnswersToAxisTargets()
calculateConfidence()
applyVectorDelta()
createVectorSnapshot()
recalculateDisplayedVector()
```

You may keep compatibility exports in `src/domain/vectors/*`, but new scoring logic must be centralized in `vectorScoring.service.ts`.

### Default scoring config

```ts
export const DEFAULT_SCORING_CONFIG = {
  key: 'scoring_v1',
  alphaBase: 0.12,
  maxStepTrait: 0.08,
  maxStepState: 0.20,
  maxStepMatching: 0.10,
  confidenceK: 12,
  cooldownHoursTrait: 72,
  cooldownHoursState: 12,
  lowConfidenceThreshold: 0.35,
  axisThresholds: {
    low: 0.38,
    high: 0.67,
    deltaSmall: 0.18,
    deltaModerate: 0.28,
    deltaHigh: 0.38
  }
};
```

### Answer normalization

For `likert_5` / compatible `likert5`:

```ts
normalized01 = (rawValue - min) / (max - min)
```

Then:

```ts
centered = normalized01 * 2 - 1;
signed = centered * polarity;
target01 = (signed + 1) / 2;
```

If `reverseScoring`:

```ts
target01 = 1 - target01;
```

All outputs must be clamped to `0..1`.

### Aggregate per axis

```ts
axisTarget = sum(target01 * weight) / sum(weight)
```

Ignore or safely skip invalid answers/questions; report them in diagnostics/logs if existing infrastructure supports that.

### Proposed delta

```ts
proposedDelta = axisTarget - currentLevel
```

### Confidence

```ts
evidenceConfidence = 1 - Math.exp(-evidenceCount / confidenceK)
questionConfidence = average(question.confidenceWeight)
sessionConfidence = clamp(evidenceConfidence * questionConfidence, 0, 1)
```

If `confidenceWeight` is missing, use a safe default such as `1`.

### Cooldown

```ts
cooldownFactor = clamp(hoursSinceLastUpdate / cooldownHours, 0.25, 1)
```

Use:

- `cooldownHoursTrait` for `trait`;
- `cooldownHoursState` for `state`;
- a reasonable matching cooldown or config value for `matching` if needed.

### Final delta

```ts
rawDelta = proposedDelta * alphaBase * sessionConfidence * cooldownFactor
finalDelta = clamp(rawDelta, -maxStep, maxStep)
newLevel = clamp(currentLevel + finalDelta, 0, 1)
```

Use layer-specific max step:

- `trait` → `maxStepTrait`;
- `state` → `maxStepState`;
- `matching` → `maxStepMatching`.

Critical:

- one answer must not radically change `trait`;
- one questionnaire session must not move `trait` by more than `maxStepTrait`;
- `state` may move faster;
- `baseline` and `state` must not be mixed;
- `pair` questionnaire must not update user `trait` directly;
- every vector update should be snapshot-able with scoring version and reason.

---

## 7. New or updated models

Add these models if missing. If a model already exists, extend it backward-compatibly.

### 7.1 `VectorSnapshot`

Path:

```txt
src/models/VectorSnapshot.ts
```

Purpose: store history of every vector update.

Fields:

```ts
userId: string | ObjectId;
pairId?: string | ObjectId;
layer: 'trait' | 'state' | 'matching' | 'displayed';
axis: Axis;

before: {
  level: number;
  confidence: number;
  evidenceCount: number;
};

after: {
  level: number;
  confidence: number;
  evidenceCount: number;
};

delta: number;

reason: {
  source:
    | 'onboarding'
    | 'baseline_questionnaire'
    | 'state_questionnaire'
    | 'pair_questionnaire'
    | 'weekly_checkin'
    | 'manual_recalculation'
    | 'migration';
  questionnaireId?: string | ObjectId;
  sessionId?: string | ObjectId;
  questionIds?: Array<string | ObjectId>;
};

scoringVersion: string;
createdAt: Date;
```

Indexes:

```ts
{ userId: 1, createdAt: -1 }
{ userId: 1, axis: 1, layer: 1, createdAt: -1 }
{ pairId: 1, createdAt: -1 }
```

### 7.2 `ScoringVersion`

Path:

```txt
src/models/ScoringVersion.ts
```

Fields:

```ts
key: string; // unique
status: 'draft' | 'active' | 'deprecated';
config: object;
notes?: string;
activatedAt?: Date;
deprecatedAt?: Date;
```

### 7.3 `Insight`

Path:

```txt
src/models/Insight.ts
```

Fields:

```ts
ownerType: 'user' | 'pair';
userId?: string | ObjectId;
pairId?: string | ObjectId;

type:
  | 'strength'
  | 'risk'
  | 'growth'
  | 'fatigue'
  | 'compatibility'
  | 'activity_recommendation'
  | 'safety';

severity: 'info' | 'low' | 'medium' | 'high' | 'critical';

title: string;
explanation: string;
safeWording: string;

axis?: Axis;
facets: string[];

trigger: {
  ruleId: string;
  evidence: Record<string, unknown>;
  scoringVersion: string;
};

recommendedAction?: {
  type: 'activity' | 'conversation' | 'pause' | 'checkin' | 'professional_help';
  activityId?: string;
  text: string;
};

visibility: {
  showToUserIds: string[];
  hiddenFromUserIds?: string[];
  pairShared: boolean;
};

cooldownUntil?: Date;
expiresAt?: Date;
dismissedAt?: Date;
createdAt: Date;
```

Indexes:

```ts
{ userId: 1, createdAt: -1 }
{ pairId: 1, createdAt: -1 }
{ 'trigger.ruleId': 1, ownerType: 1 }
{ cooldownUntil: 1 }
```

If an `Insight` model already exists, migrate/extend safely and preserve existing fields if currently used.

### 7.4 `WeeklyCheckIn`

Path:

```txt
src/models/WeeklyCheckIn.ts
```

Fields:

```ts
userId: string | ObjectId;
pairId?: string | ObjectId;
weekKey: string;

answers: {
  closeness: number;      // 0..1
  fatigue: number;        // 0..1
  irritation: number;     // 0..1
  readiness: number;      // 0..1
  unresolvedTopic: boolean;
  note?: string;
};

computed: {
  userStateDelta: Partial<Record<Axis, number>>;
  pairRiskDelta?: Partial<Record<Axis, number>>;
  generatedInsightIds: string[];
};

createdAt: Date;
```

Unique index:

```ts
{ userId: 1, weekKey: 1 }
```

### 7.5 `PairPassport`

If current `Pair.passport` is insufficient, choose the safer option:

1. extend `Pair.passport` backward-compatibly; or
2. add separate model:

```txt
src/models/PairPassport.ts
```

Do not break existing pair routes.

Pair-specific questionnaire data should live in pair context/passport/diagnostics, not directly in stable user `trait`.

### 7.6 Optional `VectorFacet`

If useful and not already present, add a `VectorFacet` model or typed config structure. Do not add it if it creates unnecessary complexity for MVP-0.

---

## 8. Pair diagnostics service

Create or extract diagnostics logic into:

```txt
src/domain/services/pairDiagnostics.service.ts
```

Thresholds must use `0..1` scale:

```ts
const LEVEL_LOW = 0.38;
const LEVEL_HIGH = 0.67;
const DELTA_SMALL = 0.18;
const DELTA_MODERATE = 0.28;
const DELTA_HIGH = 0.38;
const CONF_LOW = 0.35;
const CONF_MEDIUM = 0.55;
const CONF_HIGH = 0.75;
```

For each axis:

```ts
a = userA.vectors[axis].trait.level
b = userB.vectors[axis].trait.level
delta = Math.abs(a - b)
pairConfidence = Math.min(confA, confB)
```

Status logic:

```ts
if (pairConfidence < CONF_LOW) {
  status = 'insufficient_data'
} else if (a >= LEVEL_HIGH && b >= LEVEL_HIGH && delta <= DELTA_MODERATE) {
  status = 'strong'
} else if (delta >= DELTA_HIGH || (a <= LEVEL_LOW && b <= LEVEL_LOW)) {
  status = 'risk'
} else if (
  delta >= DELTA_MODERATE &&
  delta < DELTA_HIGH &&
  pairConfidence >= CONF_MEDIUM &&
  noActiveHighFatigueOrCrisis
) {
  status = 'complement'
} else {
  status = 'neutral'
}
```

Do not phrase `risk` as “bad compatibility”.

Safe wording example:

```txt
По ответам видно различие в подходе к этой теме. Это не приговор, но лучше обсудить правила заранее.
```

Diagnostics DTO must not expose raw partner answers by default.

---

## 9. Critical fix: pair questionnaires must not update trait

Search for pair questionnaire logic in services/routes.

If current code does something like this for pair answers:

```ts
applyDeltaToUserVectors(user, delta)
User.updateOne(...)
```

or otherwise mutates:

```ts
User.vectors.*.trait
User.vectors.*.level
```

for pair questionnaire answers, fix it.

Pair questionnaires should **not** update `User.vectors.*.trait` directly.

For this iteration, acceptable safe behavior:

- save pair answer;
- update pair questionnaire session;
- emit audit/log if existing infrastructure supports it;
- update/recalculate PairPassport or pair diagnostics if safely possible;
- otherwise add explicit `TODO` with file path for PairPassport recalculation;
- do not mutate user `trait` from pair questionnaire answers.

---

## 10. Profile summary DTO v2

Update:

```txt
GET /api/users/me/profile-summary
```

or equivalent profile-summary service.

Return `ProfileSummaryDTO v2` with this required shape:

```ts
{
  user: {
    id,
    name,
    avatarUrl?,
    status: 'solo:new' | 'solo:history' | 'paired'
  },

  pair?: {
    id,
    partnerName?,
    status
  },

  passport: {
    axes: {
      [axis]: {
        level: number,        // 0..100 UI
        rawLevel: number,     // 0..1
        confidence: number,   // 0..1
        confidenceLabel: 'low' | 'medium' | 'high',
        positives: string[],
        negatives: string[],
        dataStatus: 'enough' | 'low_confidence' | 'missing'
      }
    }
  },

  resource: {
    fatigue,
    readiness,
    stateUpdatedAt?,
    message
  },

  strengths: [],
  growthZones: [],
  recommendations: [],

  questionnaireProgress: {
    completedCount,
    recommendedNextQuestionnaireIds
  },

  locked: {
    advancedInsights,
    pairDeepDiagnostics
  }
}
```

Backward compatibility:

You may keep old fields if UI already uses them, for example:

```ts
passport.levelsByAxis
passport.positivesByAxis
passport.negativesByAxis
```

But new `passport.axes` is required.

Low-data rule:

```ts
if (confidence < 0.35 || evidenceCount < 5) {
  dataStatus = 'low_confidence' or 'missing'
}
```

Rules:

- `level` must be `0..100` for UI;
- `rawLevel` must be `0..1`;
- `confidence` must be `0..1`;
- do not generate hard conclusions when confidence is low;
- show low-data/insufficient-data wording instead.

---

## 11. Deterministic insights engine

Create:

```txt
src/domain/services/insights.service.ts
```

This must be deterministic rules logic, not AI generation.

Implement cooldown/deduplication: do not create the same `ruleId` insight repeatedly for the same user/pair within the cooldown window.

Initial rules:

### 11.1 `both_conflict_avoidance`

Trigger:

```ts
both pair users have negative facet 'communication.avoidance'
```

Severity:

```ts
'medium'
```

Title:

```txt
Сложные темы могут откладываться
```

Safe wording:

```txt
По ответам видно, что вы оба можете откладывать напряжённые разговоры. Это не ошибка характера, но нерешённые темы могут копиться.
```

Action:

```txt
Короткий структурированный разговор на 10 минут.
```

### 11.2 `finance_delta_high`

Trigger:

```ts
pair delta finance > 0.38
```

Severity:

```ts
'medium'
```

Title:

```txt
Разный стиль финансовых решений
```

Safe wording:

```txt
По ответам видно различие в подходе к деньгам. Лучше обсуждать правила заранее.
```

Action:

```txt
Разговор о правилах бюджета и крупных трат.
```

### 11.3 `directness_asymmetry`

Trigger:

```ts
one user has positive communication.directness
and the other has negative communication.directness
```

Severity:

```ts
'low'
```

Title:

```txt
Один говорит прямее другого
```

Safe wording:

```txt
Один из вас быстрее проговаривает проблему, другой может закрываться или ждать.
```

Action:

```txt
Разговор через короткие просьбы и уточнения без давления.
```

### 11.4 `psyche_low_fatigue_high`

Trigger:

```ts
psyche state < 0.38 and fatigue > 0.7
```

Severity:

```ts
'high'
```

Title:

```txt
Сейчас ресурс низкий
```

Safe wording:

```txt
Это не диагноз. Сейчас лучше снизить нагрузку и не начинать тяжёлые разговоры без подготовки.
```

Action:

```txt
Пауза или лёгкий check-in вместо тяжёлого разговора.
```

### 11.5 `domestic_fairness_risk`

Trigger:

```ts
domestic.fairness negative and/or domestic.load_awareness negative in pair context
```

Severity:

```ts
'medium'
```

Title:

```txt
Быт может ощущаться несправедливым
```

Safe wording:

```txt
Один может чувствовать перекос нагрузки, другой может не видеть часть задач.
```

Action:

```txt
Разбор бытовых задач и явное закрепление зон ответственности.
```

---

## 12. API routes

Add or update only if safe and necessary.

Target endpoints:

```txt
GET  /api/questionnaires/cards
GET  /api/questionnaires/:id
POST /api/questionnaires/:id/answer
POST /api/answers/bulk
GET  /api/users/me/profile-summary
GET  /api/users/me/vector-history
POST /api/pairs/:id/questionnaires/:qid/start
POST /api/pairs/:id/questionnaires/:qid/answer
GET  /api/pairs/:id/diagnostics
GET  /api/pairs/:id/insights
POST /api/checkins/weekly
GET  /api/insights/me
```

If equivalent App Router paths already exist, adapt them instead of duplicating.

Prefer:

- add domain services;
- adapt existing route handlers;
- preserve old DTO fields;
- add new DTO fields;
- keep response shapes backward-compatible where frontend already depends on them.

---

## 13. Security and data exposure

Requirements:

- Do not trust `client userId`.
- Use existing session/auth guard.
- Use resource authorization for pair endpoints.
- Pair data must be accessible only to pair members.
- Do not expose raw partner answers by default.
- Sensitive answers should be aggregate/private unless explicitly intended.
- Keep/add idempotency on POST writes where infrastructure exists.
- Keep/add audit/log events where infrastructure exists.
- Keep/add rate limits where infrastructure exists.
- Validate `pairId`, `qid`, and object IDs.
- Do not leak hidden/dismissed/private insights.
- Do not make pair-shared visibility the default for sensitive user-level insights.

---

## 14. Weekly check-ins

MVP-2 only if time remains after MVP-0/MVP-1 are safe.

Endpoint:

```txt
POST /api/checkins/weekly
```

Request:

```ts
{
  pairId?: string;
  weekKey: string;
  answers: {
    closeness: number;        // 0..1
    fatigue: number;          // 0..1
    irritation: number;       // 0..1
    readiness: number;        // 0..1
    unresolvedTopic: boolean;
    note?: string;
  };
  idempotencyKey?: string;
}
```

Rules:

- auth required;
- if `pairId` exists, user must be pair member;
- one check-in per user per `weekKey`;
- update `User.vectors.*.state`, readiness/fatigue, not `trait`;
- create `VectorSnapshot` for state changes;
- generate safe insights if applicable;
- do not expose note text to partner unless explicitly designed as shared.

---

## 15. Tests / selfchecks

Add or update tests/selfchecks for:

1. all vector levels remain `0..1`;
2. UI DTO `level` is `0..100`;
3. pair diagnostic thresholds are `<= 1`;
4. one answer cannot move `trait` above `maxStepTrait`;
5. `state` and `trait` are separate;
6. pair questionnaire does not update `trait` directly;
7. low confidence creates low-data DTO/status;
8. `reverseScoring` works;
9. cooldown reduces delta;
10. `scoringVersion` is attached to vector snapshots;
11. insights do not use forbidden diagnosis-like wording as conclusions/labels;
12. allowed disclaimer `это не диагноз` does not fail the safety check;
13. duplicate insights respect cooldown;
14. raw partner answers are not exposed in diagnostics/insights DTOs;
15. backward compatibility reads old flat `User.vectors.communication.level` as `trait.level`;
16. `profile-summary` preserves old compatibility fields if frontend needs them.

If no test setup exists, create selfcheck scripts:

```txt
scripts/vector-scoring.selfcheck.ts
scripts/pair-diagnostics.selfcheck.ts
scripts/insights-safety.selfcheck.ts
```

And add package scripts:

```json
{
  "selfcheck:vectors": "npx tsx ./scripts/vector-scoring.selfcheck.ts",
  "selfcheck:pair-diagnostics": "npx tsx ./scripts/pair-diagnostics.selfcheck.ts",
  "selfcheck:insights-safety": "npx tsx ./scripts/insights-safety.selfcheck.ts"
}
```

If package already has a different runner, use the existing project conventions.

---

## 16. Implementation priority

If the full scope is too large, implement strictly in this order.

### MVP-0 — required first

1. Layered `User.vectors` model with backward compatibility.
2. Vector helpers:
   - `readAxisLayer()`;
   - `readLegacyOrLayeredAxis()`;
   - `normalizeUserVectors()`.
3. `VectorSnapshot` model.
4. `ScoringVersion` model.
5. `vectorScoring.service.ts`.
6. Fix pair thresholds to `0..1`.
7. Ensure pair questionnaires do not update `trait` directly.
8. Update `profile-summary` DTO with confidence/low-data and preserve compatibility fields.
9. Add tests/selfchecks for MVP-0.

### MVP-1 — next

10. `Insight` model or safe extension of existing `Insight`.
11. Deterministic insight rules engine.
12. Insight cooldown/deduplication.
13. `GET /api/insights/me`.
14. `GET /api/pairs/:id/insights`.
15. Safety wording selfcheck.

### MVP-2 — only if time remains

16. `WeeklyCheckIn` model.
17. `POST /api/checkins/weekly`.
18. PairPassport recalculation service.
19. Weekly check-in generated insights.

Do not implement a low-quality partial version of MVP-2 if MVP-0/MVP-1 are not stable.

---

## 17. Migration and compatibility notes

Prefer non-destructive migration strategy:

- schema accepts both legacy flat and new layered vectors;
- read paths normalize legacy data;
- save paths may write layered data;
- do not remove old fields immediately if frontend or old code still reads them;
- avoid one-shot destructive migration unless explicitly necessary;
- if adding a migration script, make it idempotent and safe to rerun;
- if not adding migration script, document that normalization is lazy/on-read or on-save.

For `ScoringVersion`, ensure default `scoring_v1` can be used even if DB has no active row yet. If you seed it, do so idempotently.

---

## 18. Commands to run

Run available checks only if the script exists or you add it:

```bash
npm run typecheck
npm run lint
npm run build
npm test
npm run selfcheck:activity-flow
npm run selfcheck:client-errors
npm run selfcheck:vectors
npm run selfcheck:pair-diagnostics
npm run selfcheck:insights-safety
```

Rules:

- Do not run destructive commands.
- Do not silently skip failed checks.
- If a command does not exist, say it does not exist.
- If build/typecheck/lint fails due to your changes, fix it.
- If checks fail due to pre-existing unrelated issues, report exact command, exact error, and file.

---

## 19. Expected final response

At the end, report concretely:

1. Brief repo inventory.
2. Implementation plan.
3. Files changed.
4. What was implemented.
5. What was intentionally deferred.
6. Commands run and results.
7. Migration/backward compatibility notes.
8. Security/data exposure notes.
9. Risks / follow-up tasks.
10. Any known failing checks and exact reasons.

No marketing text. No vague claims. Be concrete.
