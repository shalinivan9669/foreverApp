**Current State (Overview)**
1. Key repository path snapshot is captured in `docs/_evidence/repo-tree.txt`.
2. User model fields: `id`, `username`, `avatar`, `personal`, `vectors`, `embeddings`, `preferences`, `matchMeta`, `profile`, `location`, `createdAt`, `updatedAt`. Evidence: `src/models/User.ts`.
3. Pair model fields: `members`, `key`, `status`, `activeActivity`, `progress`, `passport`, `fatigue`, `readiness`, `createdAt`, `updatedAt`. Evidence: `src/models/Pair.ts`.
4. ActivityTemplate model fields: intent/archetype/axis/facets/effect/preconditions and content metadata. Evidence: `src/models/ActivityTemplate.ts`.
5. PairActivity is the canonical runtime pair activity model. Evidence: `src/models/PairActivity.ts`.
6. RelationshipActivity is legacy read-only compatibility data. Evidence: `src/models/RelationshipActivity.ts`.
7. Like model fields include cards, decisions, status, and timestamps. Evidence: `src/models/Like.ts`.
8. EventLog is the canonical analytics/audit event model with retention tier and TTL via `expiresAt`. Evidence: `src/models/EventLog.ts`.
9. Question model fields: axis/facet/polarity/scale/map/weight/text. Evidence: `src/models/Question.ts`.
10. Questionnaire model fields: title/description/target/axis/difficulty/tags/version/questions. Evidence: `src/models/Questionnaire.ts`.
11. PairQuestionnaireSession model fields: pair/questionnaire/members/start/finish/status/meta. Evidence: `src/models/PairQuestionnaireSession.ts`.
12. PairQuestionnaireAnswer model fields: session/pair/questionnaire/question/by/ui/at. Evidence: `src/models/PairQuestionnaireAnswer.ts`.
13. Main relations: PairActivity -> Pair/User, PairQuestionnaireSession -> Pair/User, PairQuestionnaireAnswer -> Session/Pair, RelationshipActivity -> User.
14. Main indexes: User, Pair, PairActivity, Like, PairQuestionnaireSession, PairQuestionnaireAnswer.
**Evidence**
| Р¤Р°РєС‚ | РўРёРї | РСЃС‚РѕС‡РЅРёРє (path:line) | Р¦РёС‚Р°С‚Р° (?2 СЃС‚СЂРѕРєРё) |
|---|---|---|---|
| РЎРЅР°РїС€РѕС‚ РґРµСЂРµРІР° СЂРµРїРѕР·РёС‚РѕСЂРёСЏ | config | `docs/_evidence/repo-tree.txt:1-127` | `# Repo Tree Snapshot (curated, key paths)` |
| User РїРѕР»СЏ (РёРЅС‚РµСЂС„РµР№СЃ) | model | `src/models/User.ts:3-64` | `export interface UserType {`<br>`  id: string;` |
| Pair РїРѕР»СЏ (РёРЅС‚РµСЂС„РµР№СЃ) | model | `src/models/Pair.ts:15-31` | `export interface PairType {`<br>`  members: [string, string];` |
| ActivityTemplate РїРѕР»СЏ (РёРЅС‚РµСЂС„РµР№СЃ) | model | `src/models/ActivityTemplate.ts:29-59` | `export interface ActivityTemplateType {`<br>`  _id: string;` |
| PairActivity РїРѕР»СЏ (РёРЅС‚РµСЂС„РµР№СЃ) | model | `src/models/PairActivity.ts:11-63` | `export interface PairActivityType {`<br>`  pairId: Types.ObjectId;` |
| RelationshipActivity РїРѕР»СЏ | model | `src/models/RelationshipActivity.ts:9-16` | `export interface RelationshipActivityType {`<br>`  userId: Types.ObjectId;` |
| RelationshipActivity payload schema | model | `src/models/RelationshipActivity.ts:19-35` | `const payloadSchema = new Schema<ActivityPayload>(` |
| Like РїРѕР»СЏ | model | `src/models/Like.ts:30-54` | `export interface LikeType {`<br>`  _id: Types.ObjectId;` |
| Question РїРѕР»СЏ | model | `src/models/Question.ts:3-11` | `export interface QuestionType {`<br>`  _id: string;` |
| Questionnaire РїРѕР»СЏ | model | `src/models/Questionnaire.ts:15-29` | `export interface QuestionnaireType {`<br>`  _id: string;` |
| PairQuestionnaireSession РїРѕР»СЏ | model | `src/models/PairQuestionnaireSession.ts:3-12` | `export interface PairQuestionnaireSessionType {` |
| PairQuestionnaireAnswer РїРѕР»СЏ | model | `src/models/PairQuestionnaireAnswer.ts:3-12` | `export interface PairQuestionnaireAnswerType {` |
| PairActivity СЃСЃС‹Р»РєРё РЅР° Pair/User | model | `src/models/PairActivity.ts:79-80` | `pairId:   { type: Schema.Types.ObjectId, ref: 'Pair', required: true },` |
| PairQuestionnaireSession СЃСЃС‹Р»РєРё РЅР° Pair/User | model | `src/models/PairQuestionnaireSession.ts:17-19` | `pairId: { type: Schema.Types.ObjectId, ref: 'Pair', required: true },` |
| PairQuestionnaireAnswer СЃСЃС‹Р»РєРё РЅР° Session/Pair | model | `src/models/PairQuestionnaireAnswer.ts:17-19` | `sessionId: { type: Schema.Types.ObjectId, ref: 'PairQuestionnaireSession', required: true },` |
| RelationshipActivity СЃСЃС‹Р»РєРё РЅР° User | model | `src/models/RelationshipActivity.ts:30-31` | `userId:   { type: Schema.Types.ObjectId, ref: 'User', required: true },` |
| РРЅРґРµРєСЃС‹ User | model | `src/models/User.ts:203-207` | `userSchema.index({ 'personal.city': 1 });` |
| РРЅРґРµРєСЃС‹ Pair | model | `src/models/Pair.ts:77-78` | `PairSchema.index({ members: 1, status: 1 });` |
| РРЅРґРµРєСЃ PairActivity | model | `src/models/PairActivity.ts:145` | `PairActivitySchema.index({ pairId: 1, status: 1, dueAt: 1 });` |
| РРЅРґРµРєСЃ Like | model | `src/models/Like.ts:106` | `LikeSchema.index({ fromId: 1, toId: 1, createdAt: -1 });` |
| РРЅРґРµРєСЃС‹ PairQuestionnaireSession | model | `src/models/PairQuestionnaireSession.ts:28-29` | `PairQuestionnaireSessionSchema.index({ pairId: 1, questionnaireId: 1, status: 1 });` |
| РРЅРґРµРєСЃС‹ PairQuestionnaireAnswer | model | `src/models/PairQuestionnaireAnswer.ts:28-29` | `PairQuestionnaireAnswerSchema.index({ sessionId: 1 });` |

**РљСѓРґР° РРґС‘Рј**
- РЎРІРµСЃС‚Рё Р°РєС‚РёРІРЅРѕСЃС‚Рё Рє РµРґРёРЅРѕР№ СЃРёСЃС‚РµРјРµ `ActivityTemplate` + `PairActivity`; `RelationshipActivity` РґРѕРєСѓРјРµРЅС‚РёСЂРѕРІР°С‚СЊ РєР°Рє legacy СЃ РїР»Р°РЅРѕРј РјРёРіСЂР°С†РёРё.
- Р’С‹РЅРµСЃС‚Рё РґРѕРјРµРЅРЅС‹Рµ СЃРІСЏР·Рё РІ СЏРІРЅС‹Р№ domain map (ER/mermaid) Рё РґРѕР±Р°РІРёС‚СЊ РёРЅРґРµРєСЃС‹ РїРѕРґ РєР»СЋС‡РµРІС‹Рµ Р·Р°РїСЂРѕСЃС‹ (activity feed, match inbox, pair history).
- Р’РІРµСЃС‚Рё СЏРІРЅС‹Рµ DTO РґР»СЏ API, С‡С‚РѕР±С‹ РѕС‚СЃРµС‡СЊ Р»РёС€РЅРёРµ РїРѕР»СЏ РјРѕРґРµР»РµР№ РїСЂРё РІС‹РґР°С‡Рµ РЅР°СЂСѓР¶Сѓ.

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

## Update 2026-02-08 (Questionnaire -> User Vectors Canonical Pipeline)

- Added a canonical domain pipeline for questionnaire scoring/application:
  - `src/domain/vectors/types.ts`
  - `src/domain/vectors/scoring.ts`
  - `src/domain/vectors/apply.ts`
  - `src/domain/vectors/index.ts`
- Both personal and couple questionnaire answer flows now apply vector deltas through the same pipeline.
- Personal questionnaire submit now resolves question scoring from questionnaire payload (`Questionnaire.questions`) and updates `User.vectors` deterministically.
- Vector invariants are enforced centrally:
  - level clamp to `0..1`
  - no NaN propagation
  - deterministic facet aggregation (`positives`/`negatives`).

## Update 2026-02-08 (Vector Stability Policy)

- Vector scoring now uses weighted normalization per axis:
  - `weightedSum = sum(contribution * weight)`
  - `deltaAxis = weightedSum / sumWeights`
  - collected diagnostics: `perAxisMatchedCount`, `perAxisSumWeights`.
- Vector apply now uses a configurable policy (`VectorUpdatePolicy`) in `src/domain/vectors/types.ts`:
  - `alphaBase = 0.12`
  - `maxStepPerSubmit = 0.08`
  - `confidenceK = 12`
  - `edgeDiminishMin = 0.35`
- Effective step formula:
  - `confidence = clamp(matchedCount / confidenceK, 0..1)`
  - `effectiveAlpha = alphaBase * confidence`
  - `step = clamp(deltaAxis * effectiveAlpha, -maxStep, +maxStep)`
  - edge dampening near `0/1`: less movement close to boundaries.
- Domain apply metadata is now explicit for audit/explainability:
  - `appliedStepByAxis`
  - `clampedAxes`
  - `confidence`, `alphaBase`, `maxStepPerSubmit`, `effectiveAlpha`.

