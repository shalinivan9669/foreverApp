**Как Сейчас (Обзор)**
1. Снапшот ключевых путей репозитория зафиксирован в `docs/_evidence/repo-tree.txt`. Доказательства: `docs/_evidence/repo-tree.txt:1-127`.
2. User: поля `id`, `username`, `avatar`, `personal{gender,age,city,relationshipStatus}`, `vectors`, `embeddings`, `preferences{desiredAgeRange,maxDistanceKm}`, `matchMeta.recentMatches`, `profile.onboarding`, `profile.matchCard`, `location`, `createdAt`, `updatedAt`. Доказательства: `src/models/User.ts:3-64`.
3. Pair: поля `members`, `key`, `status`, `activeActivity`, `progress`, `passport{strongSides,riskZones,complementMap,levelDelta,lastDiagnosticsAt}`, `fatigue`, `readiness`, `createdAt`, `updatedAt`. Доказательства: `src/models/Pair.ts:15-31`.
4. ActivityTemplate: поля `_id`, `intent`, `archetype`, `axis`, `facetsTarget`, `difficulty`, `intensity`, `timeEstimateMin`, `costEstimate`, `location`, `requiresConsent`, `title`, `description`, `steps`, `materials`, `checkIns`, `effect`, `preconditions`, `cooldownDays`. Доказательства: `src/models/ActivityTemplate.ts:29-59`.
5. PairActivity: поля `pairId`, `members`, `intent`, `archetype`, `axis`, `facetsTarget`, `title`, `description`, `why`, `mode`, `sync`, `difficulty`, `intensity`, `timeEstimateMin`, `costEstimate`, `location`, `materials`, `offeredAt`, `acceptedAt`, `windowStart`, `windowEnd`, `dueAt`, `recurrence`, `cooldownDays`, `requiresConsent`, `consentA`, `consentB`, `visibility`, `status`, `stateMeta`, `checkIns`, `answers`, `successScore`, `effect`, `fatigueDeltaOnComplete`, `readinessDeltaOnComplete`, `createdBy`, `createdAt`, `updatedAt`. Доказательства: `src/models/PairActivity.ts:11-63`.
6. RelationshipActivity: поля `userId`, `partnerId`, `type`, `payload{title,description,dueAt}`, `status`, `createdAt`, `updatedAt`. Доказательства: `src/models/RelationshipActivity.ts:9-16`, `src/models/RelationshipActivity.ts:19-35`.
7. Insight: поля `userId`, `partnerId`, `category`, `message`, `isRead`, `createdAt`. Доказательства: `src/models/Insight.ts:3-20`.
8. Like: поля `fromId`, `toId`, `matchScore`, `fromCardSnapshot`, `recipientResponse`, `recipientDecision`, `initiatorDecision`, `status`, `agreements`, `answers`, `cardSnapshot`, `createdAt`, `updatedAt`. Доказательства: `src/models/Like.ts:30-54`.
9. Match: поля `userId`, `items`, `expireAt`, `createdAt`, `updatedAt`; `items` состоят из `MatchCandidate{id,score,reasons}`. Доказательства: `src/models/Match.ts:5-19`.
10. Question: поля `_id`, `axis`, `facet`, `polarity`, `scale`, `map`, `weight`, `text`. Доказательства: `src/models/Question.ts:3-11`.
11. Questionnaire: поля `_id`, `title`, `description`, `target{type,gender,vector}`, `axis`, `difficulty`, `tags`, `version`, `randomize`, `questions`. Доказательства: `src/models/Questionnaire.ts:15-29`.
12. PairQuestionnaireSession: поля `pairId`, `questionnaireId`, `members`, `startedAt`, `finishedAt`, `status`, `meta`, `createdAt`, `updatedAt`. Доказательства: `src/models/PairQuestionnaireSession.ts:3-12`.
13. PairQuestionnaireAnswer: поля `sessionId`, `pairId`, `questionnaireId`, `questionId`, `by`, `ui`, `at`, `createdAt`, `updatedAt`. Доказательства: `src/models/PairQuestionnaireAnswer.ts:3-12`.
14. Log: поля `userId`, `at`. Доказательства: `src/models/Log.ts:4-13`.
15. Связи: `PairActivity.pairId` ссылается на `Pair`, `PairActivity.members` — на `User`; `PairQuestionnaireSession.pairId` — на `Pair`, `PairQuestionnaireSession.members` — на `User`; `PairQuestionnaireAnswer.sessionId` — на `PairQuestionnaireSession`, `PairQuestionnaireAnswer.pairId` — на `Pair`; `RelationshipActivity.userId/partnerId` — на `User`. Доказательства: `src/models/PairActivity.ts:79-80`, `src/models/PairQuestionnaireSession.ts:17-19`, `src/models/PairQuestionnaireAnswer.ts:17-19`, `src/models/RelationshipActivity.ts:30-31`.
16. Индексы: User (`personal.city`, `personal.gender+relationshipStatus`, `location`, `embeddings`); Pair (`members+status`, `key`); PairActivity (`pairId+status+dueAt`); Like (`fromId+toId+createdAt`); Match (`userId unique`, `expireAt TTL`); PairQuestionnaireSession (`pairId+questionnaireId+status`, `pairId+createdAt`); PairQuestionnaireAnswer (`sessionId`, `pairId+questionnaireId+questionId`). Доказательства: `src/models/User.ts:203-207`, `src/models/Pair.ts:77-78`, `src/models/PairActivity.ts:145`, `src/models/Like.ts:106`, `src/models/Match.ts:42-45`, `src/models/PairQuestionnaireSession.ts:28-29`, `src/models/PairQuestionnaireAnswer.ts:28-29`.

**Evidence**
| Факт | Тип | Источник (path:line) | Цитата (?2 строки) |
|---|---|---|---|
| Снапшот дерева репозитория | config | `docs/_evidence/repo-tree.txt:1-127` | `# Repo Tree Snapshot (curated, key paths)` |
| User поля (интерфейс) | model | `src/models/User.ts:3-64` | `export interface UserType {`<br>`  id: string;` |
| Pair поля (интерфейс) | model | `src/models/Pair.ts:15-31` | `export interface PairType {`<br>`  members: [string, string];` |
| ActivityTemplate поля (интерфейс) | model | `src/models/ActivityTemplate.ts:29-59` | `export interface ActivityTemplateType {`<br>`  _id: string;` |
| PairActivity поля (интерфейс) | model | `src/models/PairActivity.ts:11-63` | `export interface PairActivityType {`<br>`  pairId: Types.ObjectId;` |
| RelationshipActivity поля | model | `src/models/RelationshipActivity.ts:9-16` | `export interface RelationshipActivityType {`<br>`  userId: Types.ObjectId;` |
| RelationshipActivity payload schema | model | `src/models/RelationshipActivity.ts:19-35` | `const payloadSchema = new Schema<ActivityPayload>(` |
| Insight поля | model | `src/models/Insight.ts:3-20` | `export interface InsightType {`<br>`  userId: Types.ObjectId;` |
| Like поля | model | `src/models/Like.ts:30-54` | `export interface LikeType {`<br>`  _id: Types.ObjectId;` |
| Match поля и кандидат | model | `src/models/Match.ts:5-19` | `export interface MatchCandidate {`<br>`  id: string;` |
| Question поля | model | `src/models/Question.ts:3-11` | `export interface QuestionType {`<br>`  _id: string;` |
| Questionnaire поля | model | `src/models/Questionnaire.ts:15-29` | `export interface QuestionnaireType {`<br>`  _id: string;` |
| PairQuestionnaireSession поля | model | `src/models/PairQuestionnaireSession.ts:3-12` | `export interface PairQuestionnaireSessionType {` |
| PairQuestionnaireAnswer поля | model | `src/models/PairQuestionnaireAnswer.ts:3-12` | `export interface PairQuestionnaireAnswerType {` |
| Log поля | model | `src/models/Log.ts:4-13` | `export interface LogType {`<br>`  userId: string;` |
| PairActivity ссылки на Pair/User | model | `src/models/PairActivity.ts:79-80` | `pairId:   { type: Schema.Types.ObjectId, ref: 'Pair', required: true },` |
| PairQuestionnaireSession ссылки на Pair/User | model | `src/models/PairQuestionnaireSession.ts:17-19` | `pairId: { type: Schema.Types.ObjectId, ref: 'Pair', required: true },` |
| PairQuestionnaireAnswer ссылки на Session/Pair | model | `src/models/PairQuestionnaireAnswer.ts:17-19` | `sessionId: { type: Schema.Types.ObjectId, ref: 'PairQuestionnaireSession', required: true },` |
| RelationshipActivity ссылки на User | model | `src/models/RelationshipActivity.ts:30-31` | `userId:   { type: Schema.Types.ObjectId, ref: 'User', required: true },` |
| Индексы User | model | `src/models/User.ts:203-207` | `userSchema.index({ 'personal.city': 1 });` |
| Индексы Pair | model | `src/models/Pair.ts:77-78` | `PairSchema.index({ members: 1, status: 1 });` |
| Индекс PairActivity | model | `src/models/PairActivity.ts:145` | `PairActivitySchema.index({ pairId: 1, status: 1, dueAt: 1 });` |
| Индекс Like | model | `src/models/Like.ts:106` | `LikeSchema.index({ fromId: 1, toId: 1, createdAt: -1 });` |
| Индексы Match | model | `src/models/Match.ts:42-45` | `MatchSchema.index({ userId: 1 }, { unique: true });` |
| Индексы PairQuestionnaireSession | model | `src/models/PairQuestionnaireSession.ts:28-29` | `PairQuestionnaireSessionSchema.index({ pairId: 1, questionnaireId: 1, status: 1 });` |
| Индексы PairQuestionnaireAnswer | model | `src/models/PairQuestionnaireAnswer.ts:28-29` | `PairQuestionnaireAnswerSchema.index({ sessionId: 1 });` |

**Куда Идём**
- Свести активности к единой системе `ActivityTemplate` + `PairActivity`; `RelationshipActivity` документировать как legacy с планом миграции.
- Вынести доменные связи в явный domain map (ER/mermaid) и добавить индексы под ключевые запросы (activity feed, match inbox, pair history).
- Ввести явные DTO для API, чтобы отсечь лишние поля моделей при выдаче наружу.

## Update 2026-02-08 (Activities Canonical Model)

### Canonical runtime model
- Pair activity lifecycle is canonicalized on:
  - `ActivityTemplate` (selection source)
  - `PairActivity` (runtime execution entity)

### Legacy model status
- `RelationshipActivity` is now treated as legacy read-only compatibility data.
- Runtime mutation/suggestion flows do not create `RelationshipActivity`.
- Compatibility mapping exists for list views:
  - legacy records are mapped into `PairActivityDTO`-compatible shape with `legacy: true`.

### Canonical creation/suggestion pipeline
- `src/domain/services/activityOffer.service.ts` is the single suggestion/offer pipeline used by:
  - `/api/pairs/[id]/suggest`
  - `/api/pairs/[id]/activities/suggest`
  - `/api/activities/next`
  - initial seed on `match.confirm`

### Remaining migration note
- One-time migration script (`RelationshipActivity` -> `PairActivity`) remains optional follow-up.
