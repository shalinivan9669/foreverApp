# Pair Activity Inventory As-Is (2026-02-08)

## 1) Scope map (what is included)

| Component | Files | Purpose | Evidence |
|---|---|---|---|
| Main-menu entrypoint | `src/components/main-menu/CoupleActivityTile.tsx`, `src/app/main-menu/page.tsx` | Entry tile `АКТИВНОСТЬ ПАРЫ` and navigation to `/couple-activity`. | `src/components/main-menu/CoupleActivityTile.tsx:7`, `src/app/main-menu/page.tsx:21` |
| Couple activity screen (container/view) | `src/app/couple-activity/page.tsx`, `src/features/activities/CoupleActivityView.tsx`, `src/components/activities/ActivityCard.tsx`, `src/components/activities/CheckInModal.tsx` | Loads current/suggested/history buckets, renders tabs/cards, handles accept/cancel/check-in actions, opens modal. | `src/app/couple-activity/page.tsx:16`, `src/features/activities/CoupleActivityView.tsx:90`, `src/components/activities/ActivityCard.tsx:87`, `src/components/activities/CheckInModal.tsx:23` |
| Hooks/API client/store | `src/client/hooks/useActivityOffers.ts`, `src/client/api/activities.api.ts`, `src/client/api/http.ts`, `src/client/stores/useEntitiesStore.ts`, `src/client/hooks/usePair.ts` | Fetch/mutate activities API, local+zustand caching by bucket key, pair resolution (`pairId`). | `src/client/hooks/useActivityOffers.ts:80`, `src/client/api/activities.api.ts:23`, `src/client/api/http.ts:113`, `src/client/stores/useEntitiesStore.ts:153`, `src/client/hooks/usePair.ts:101` |
| Pair-profile integration | `src/features/pair/PairProfilePageClient.tsx`, `src/client/api/pairs.api.ts`, `src/app/api/pairs/[id]/summary/route.ts` | Shows current pair activity/suggested count and CTA to `/couple-activity`. | `src/features/pair/PairProfilePageClient.tsx:176`, `src/features/pair/PairProfilePageClient.tsx:150`, `src/app/api/pairs/[id]/summary/route.ts:65`, `src/app/api/pairs/[id]/summary/route.ts:73` |
| User-profile integration | `src/app/(auth)/profile/page.tsx`, `src/client/api/users.api.ts`, `src/app/api/users/me/profile-summary/route.ts`, `src/components/activities/UserActivityCard.tsx`, `src/components/activities/UserActivitiesPlaceholder.tsx` | Shows personal-activity block in profile based on summary API; backend currently returns placeholder activity data. | `src/app/(auth)/profile/page.tsx:107`, `src/client/api/users.api.ts:25`, `src/app/api/users/me/profile-summary/route.ts:181`, `src/components/activities/UserActivitiesPlaceholder.tsx:7` |
| Backend activities endpoints | `src/app/api/activities/next/route.ts`, `src/app/api/activities/[id]/accept/route.ts`, `src/app/api/activities/[id]/cancel/route.ts`, `src/app/api/activities/[id]/checkin/route.ts`, `src/app/api/activities/[id]/complete/route.ts` | Next-offer generation and lifecycle mutations (`ACCEPT/CANCEL/CHECKIN/COMPLETE`). | `src/app/api/activities/next/route.ts:39`, `src/app/api/activities/[id]/accept/route.ts:33`, `src/app/api/activities/[id]/cancel/route.ts:33`, `src/app/api/activities/[id]/checkin/route.ts:52`, `src/app/api/activities/[id]/complete/route.ts:34` |
| Backend pair-activity endpoints | `src/app/api/pairs/[id]/activities/route.ts`, `src/app/api/pairs/[id]/suggest/route.ts`, `src/app/api/pairs/[id]/activities/suggest/route.ts`, `src/app/api/pairs/[id]/activities/from-template/route.ts` | Read activity feed buckets, generate suggestions, create from template. | `src/app/api/pairs/[id]/activities/route.ts:62`, `src/app/api/pairs/[id]/suggest/route.ts:53`, `src/app/api/pairs/[id]/activities/suggest/route.ts:53`, `src/app/api/pairs/[id]/activities/from-template/route.ts:35` |
| Domain services + state machine | `src/domain/services/activityOffer.service.ts`, `src/domain/services/activities.service.ts`, `src/domain/state/activityMachine.ts`, `src/domain/services/relationshipActivityLegacy.service.ts` | Offer pipeline, lifecycle transitions, legacy compatibility mapping. | `src/domain/services/activityOffer.service.ts:256`, `src/domain/services/activities.service.ts:48`, `src/domain/state/activityMachine.ts:66`, `src/domain/services/relationshipActivityLegacy.service.ts:32` |
| Models/DTO | `src/models/ActivityTemplate.ts`, `src/models/PairActivity.ts`, `src/models/Pair.ts`, `src/models/RelationshipActivity.ts`, `src/lib/dto/activity.dto.ts` | Canonical storage schemas and API DTO mapping (including legacy DTO mapping). | `src/models/ActivityTemplate.ts:29`, `src/models/PairActivity.ts:11`, `src/models/Pair.ts:15`, `src/models/RelationshipActivity.ts:9`, `src/lib/dto/activity.dto.ts:21`, `src/lib/dto/activity.dto.ts:91`, `src/lib/dto/activity.dto.ts:290` |
| Guards/auth/validation | `src/lib/auth/guards.ts`, `src/lib/auth/resourceGuards.ts`, `src/lib/api/validate.ts` | Session guard, membership authz (`pair/activity`), unified validation errors. | `src/lib/auth/guards.ts:9`, `src/lib/auth/resourceGuards.ts:18`, `src/lib/auth/resourceGuards.ts:47`, `src/lib/api/validate.ts:27` |
| Idempotency/abuse/entitlements | `src/lib/idempotency/withIdempotency.ts`, `src/lib/idempotency/key.ts`, `src/models/IdempotencyRecord.ts`, `src/lib/abuse/rateLimit.ts`, `src/lib/entitlements/guards.ts` | Mutation replay safety, key contract+TTL, rate limit runtime, feature/quota guards. | `src/lib/idempotency/withIdempotency.ts:76`, `src/lib/idempotency/key.ts:35`, `src/models/IdempotencyRecord.ts:35`, `src/lib/abuse/rateLimit.ts:19`, `src/lib/entitlements/guards.ts:107` |
| Audit/analytics runtime | `src/lib/audit/eventTypes.ts`, `src/lib/audit/emitEvent.ts`, `src/models/EventLog.ts` | Event schema, emission, storage and retention for activities-related analytics. | `src/lib/audit/eventTypes.ts:14`, `src/lib/audit/eventTypes.ts:201`, `src/lib/audit/emitEvent.ts:158`, `src/models/EventLog.ts:17` |

## 2) Entities & data model (canonical as-is)

| Entity | Purpose | Key fields | Invariants / enums | Indexes / TTL | Relations | DTO mapping to UI | Evidence |
|---|---|---|---|---|---|---|---|
| `ActivityTemplate` | Canonical template source for generated pair activities. | `_id`, `intent`, `archetype`, `axis[]`, `difficulty`, `intensity`, `checkIns[]`, `effect[]`, `preconditions`, `cooldownDays`. | `difficulty` enum `1..5`; `intensity` enum `1..3`; `axis` and `archetype` enums. | No custom index in model file. | Used by offer pipeline for candidate selection and activity creation. | `toActivityTemplateDTO(...)` and source for `toActivityOfferDTO(...)` via created `PairActivity`. | `src/models/ActivityTemplate.ts:29`, `src/models/ActivityTemplate.ts:109`, `src/models/ActivityTemplate.ts:122`, `src/domain/services/activityOffer.service.ts:201`, `src/lib/dto/activity.dto.ts:179` |
| `PairActivity` | Runtime execution entity for pair activity lifecycle. | `pairId`, `members`, `status`, `offeredAt`, `acceptedAt?`, `dueAt?`, `checkIns[]`, `answers[]`, `successScore?`, `stateMeta?`, `createdBy`, deltas. | `status` enum includes `suggested/offered/accepted/in_progress/awaiting_checkin/completed_success/completed_partial/failed/expired/cancelled`; `offeredAt` required. | Compound index `{ pairId, status, dueAt }`. | References `Pair` (`pairId`) and `User` (`members`). | `toPairActivityDTO(...)`; `toActivityOfferDTO(...)` reads `stateMeta.templateId/source/stepsPreview`, `dueAt`, deltas. | `src/models/PairActivity.ts:11`, `src/models/PairActivity.ts:109`, `src/models/PairActivity.ts:122`, `src/models/PairActivity.ts:145`, `src/lib/dto/activity.dto.ts:112`, `src/lib/dto/activity.dto.ts:239` |
| `Pair` | Pair context for offer/risk/fatigue/readiness logic and membership guard. | `members`, `status`, `passport.riskZones[]`, `fatigue.score`, `readiness.score`, optional `activeActivity`. | `members` validator requires exactly 2; `status` enum `active/paused/ended`; risk severity enum `1..3`. | Indexes on `{members, status}` and unique `{key}`. | Used by `requirePairMember`, offer pipeline, and completion effects update. | `toPairDTO(...)` (summary/profile responses). | `src/models/Pair.ts:15`, `src/models/Pair.ts:54`, `src/models/Pair.ts:57`, `src/models/Pair.ts:77`, `src/domain/services/activityOffer.service.ts:261`, `src/utils/activities.ts:83` |
| `User` (activity-relevant subset) | Member resolution for `PairActivity.members` and vector updates on completion. | `id`, `_id`, `vectors[axis].level/positives/negatives`. | `id` unique at schema-level. | Not activity-specific indexes. | Resolved by pair member IDs in offer flow; updated in `applyEffects(...)`. | Not returned directly by activity endpoints; side effects visible via profile summaries. | `src/models/User.ts:132`, `src/domain/services/activityOffer.service.ts:56`, `src/domain/services/activityOffer.service.ts:78`, `src/utils/activities.ts:56`, `src/utils/activities.ts:65` |
| `RelationshipActivity` (legacy) | Legacy read-only compatibility source merged into pair activities feed. | `userId`, `partnerId`, `type`, `payload`, `status(pending/completed)`. | Marked as legacy read-only collection comment. | Index `{ userId, partnerId, status, createdAt:-1 }`. | Read and mapped to `PairActivityDTO`-compatible shape with `legacy: true`. | `toLegacyRelationshipActivityDTO(...)` mapped in `/api/pairs/[id]/activities`. | `src/models/RelationshipActivity.ts:9`, `src/models/RelationshipActivity.ts:39`, `src/domain/services/relationshipActivityLegacy.service.ts:77`, `src/lib/dto/activity.dto.ts:290`, `src/app/api/pairs/[id]/activities/route.ts:89` |
| `ActivityOfferDTO` | Canonical offer response DTO for suggest/next flows. | `id`, `templateId?`, `title`, `axis`, `difficulty`, `stepsPreview?`, `reward`, `expiresAt?`, `source`. | `reward` deltas fallback to `0` if activity deltas absent. | N/A DTO | Produced from created `PairActivity` (`stateMeta`, `dueAt`, deltas). | Returned by `/api/pairs/[id]/suggest`, `/api/pairs/[id]/activities/suggest`, `/api/activities/next`; optional in from-template response. | `src/lib/dto/activity.dto.ts:91`, `src/lib/dto/activity.dto.ts:239`, `src/domain/services/activityOffer.service.ts:361`, `src/domain/services/activityOffer.service.ts:470`, `src/app/api/activities/next/route.ts:43` |
| `PairActivityDTO` | Read DTO for UI feeds/cards. | `id`, `pairId`, `title`, `axis`, `status`, `checkIns`, timestamps, optional `legacy` flags. | Server DTO supports full `PairActivityType['status']` including `suggested`; can include `legacy/legacySource`. | N/A DTO | Returned by `GET /api/pairs/[id]/activities` after canonical+legacy merge. | Consumed by `useActivityOffers -> toActivityCardVM`. | `src/lib/dto/activity.dto.ts:21`, `src/lib/dto/activity.dto.ts:64`, `src/lib/dto/activity.dto.ts:162`, `src/app/api/pairs/[id]/activities/route.ts:85`, `src/client/viewmodels/activity.viewmodels.ts:20` |

### Fields present in models but not used by current pair-activity runtime logic

| Field(s) | Declared in model | As-is runtime behavior | Evidence |
|---|---|---|---|
| `ActivityTemplate.preconditions`, `ActivityTemplate.cooldownDays` | `ActivityTemplate` schema | Candidate selection in offer pipeline filters only by `axis` and difficulty neighborhood; these fields are not referenced in selection logic. | `src/models/ActivityTemplate.ts:52`, `src/models/ActivityTemplate.ts:59`, `src/domain/services/activityOffer.service.ts:203`, `src/domain/services/activityOffer.service.ts:224` |
| `Pair.activeActivity` | `Pair` schema | Pair activity “current” is derived from `PairActivity.status` query buckets; no pair-activity read/write path uses `Pair.activeActivity`. | `src/models/Pair.ts:19`, `src/app/api/pairs/[id]/activities/route.ts:29`, `src/app/api/pairs/[id]/summary/route.ts:65`, `src/lib/dto/pair.dto.ts:57` |
| `PairActivity.windowStart/windowEnd/recurrence/cooldownDays/consentA/consentB/visibility` | `PairActivity` schema | Current offer creation and lifecycle mutations do not set/update these fields in the main flows. | `src/models/PairActivity.ts:111`, `src/models/PairActivity.ts:114`, `src/models/PairActivity.ts:115`, `src/models/PairActivity.ts:118`, `src/domain/services/activityOffer.service.ts:312`, `src/domain/services/activityOffer.service.ts:434`, `src/domain/services/activities.service.ts:72`, `src/domain/services/activities.service.ts:241` |

## 3) Lifecycle truth table (how activity lives, fact-only)

### 3.1 Creation/offer sources

| Trigger | Code path | DB writes | Returned DTO | UI effect | Evidence |
|---|---|---|---|---|---|
| `POST /api/pairs/[id]/suggest` | route -> `activityOfferService.suggestActivities({ dedupeAgainstLastOffered:false, source:'pairs.suggest' })` | Creates `PairActivity` documents with `status:'offered'`, `offeredAt`, `dueAt=now+3d`, `stateMeta.templateId/source/stepsPreview`, `createdBy:'system'`. | `ActivityOfferDTO[]` | Used by `useActivityOffers.suggestNext()` button flow. | `src/app/api/pairs/[id]/suggest/route.ts:53`, `src/domain/services/activityOffer.service.ts:312`, `src/domain/services/activityOffer.service.ts:336`, `src/domain/services/activityOffer.service.ts:348`, `src/client/hooks/useActivityOffers.ts:102` |
| `POST /api/pairs/[id]/activities/suggest` | route -> `suggestActivities({ dedupeAgainstLastOffered:true, source:'pairs.activities.suggest' })` | Same create path as above; dedupe checks last offered `stateMeta.templateId`. | `ActivityOfferDTO[]` | Client method exists but is not used by `/couple-activity` flow. | `src/app/api/pairs/[id]/activities/suggest/route.ts:53`, `src/domain/services/activityOffer.service.ts:269`, `src/domain/services/activityOffer.service.ts:277`, `src/client/api/activities.api.ts:30`, `src/client/hooks/useActivityOffers.ts:102` |
| `POST /api/activities/next` | route -> `activityOfferService.createNextActivity(...)` -> `suggestActivitiesInternal(count:1, dedupe:true, source:'activities.next')` | Finds only active pair, then creates one `offered` `PairActivity`. | `{ activityId, offer? }` | Client method `requestPersonalNext()` exists; no consumer in current UI flow. | `src/app/api/activities/next/route.ts:39`, `src/domain/services/activityOffer.service.ts:371`, `src/domain/services/activityOffer.service.ts:384`, `src/client/hooks/useActivityOffers.ts:124` |
| `POST /api/pairs/[id]/activities/from-template` | route -> `activityOfferService.createFromTemplate(...)` | Creates one `PairActivity` with `status:'offered'`, `createdBy:'user'`, `stateMeta.source:'pairs.activities.suggest'`. | `{ id, offer? }` | Hook method exists (`createFromTemplate`) but no current `/couple-activity` UI trigger. | `src/app/api/pairs/[id]/activities/from-template/route.ts:35`, `src/domain/services/activityOffer.service.ts:434`, `src/domain/services/activityOffer.service.ts:457`, `src/domain/services/activityOffer.service.ts:465`, `src/client/hooks/useActivityOffers.ts:111` |
| Pair creation seed (`POST /api/match/confirm`) | route -> `matchService.confirmLike(...)` -> `seedSuggestionsForPair(...)` -> `suggestActivities(...)` | Seeds suggestions only when no existing `offered` activity for pair. | No direct offer response from seed; side-effect creation only. | No direct UI in activities page; effects visible on next feed load. | `src/domain/services/match.service.ts:136`, `src/domain/services/match.service.ts:140`, `src/domain/services/match.service.ts:143`, `src/domain/services/match.service.ts:572` |

### 3.2 Lifecycle transitions and feed semantics

| Trigger | Code path | DB writes | Returned DTO | UI effect | Evidence |
|---|---|---|---|---|---|
| `ACCEPT` | `/api/activities/[id]/accept` -> `activitiesService.acceptActivity` -> `activityTransition('ACCEPT')` | `activity.status='accepted'`, `acceptedAt` set, `save()`. | `{}` envelope data | Suggested card “Принять” moves item after refetch. | `src/app/api/activities/[id]/accept/route.ts:33`, `src/domain/services/activities.service.ts:72`, `src/domain/state/activityMachine.ts:82`, `src/client/hooks/useActivityOffers.ts:129` |
| `CANCEL` | `/api/activities/[id]/cancel` -> service -> transition `CANCEL` | `activity.status='cancelled'`, `save()`. | `{}` | Suggested/active card “Отклонить/Отменить”, then refetch. | `src/app/api/activities/[id]/cancel/route.ts:33`, `src/domain/services/activities.service.ts:125`, `src/domain/state/activityMachine.ts:105`, `src/client/hooks/useActivityOffers.ts:139` |
| `CHECKIN` | `/api/activities/[id]/checkin` -> service -> transition `CHECKIN` | Appends answers (`answers.by` uses role `A/B`), sets `status='awaiting_checkin'`, recalculates `successScore`, `save()`. | `{ success }` | “Завершить” opens modal and submits check-in answers. | `src/app/api/activities/[id]/checkin/route.ts:52`, `src/domain/services/activities.service.ts:177`, `src/domain/state/activityMachine.ts:132`, `src/domain/state/activityMachine.ts:142`, `src/app/couple-activity/page.tsx:55` |
| `COMPLETE` | `/api/activities/[id]/complete` -> service -> transition `COMPLETE` | Sets completion status (`completed_success/partial/failed`), updates `successScore`, applies effects to pair+users, saves. | `{ success, status }` | No direct call from current `/couple-activity` UI flow. | `src/app/api/activities/[id]/complete/route.ts:34`, `src/domain/services/activities.service.ts:241`, `src/domain/services/activities.service.ts:244`, `src/utils/activities.ts:56`, `src/client/hooks/useActivityOffers.ts:159`, `src/app/couple-activity/page.tsx:17` |
| Read feed buckets | `/api/pairs/[id]/activities` -> `buildQuery(s)` + canonical+legacy merge | Read-only query; current=`accepted/in_progress/awaiting_checkin`, suggested=`offered`, history includes completion/cancel/expired. | `PairActivityDTO[]` (merged) | `/couple-activity` loads 3 buckets in parallel. | `src/app/api/pairs/[id]/activities/route.ts:24`, `src/app/api/pairs/[id]/activities/route.ts:29`, `src/app/api/pairs/[id]/activities/route.ts:33`, `src/app/api/pairs/[id]/activities/route.ts:97`, `src/client/hooks/useActivityOffers.ts:80` |

### 3.3 Current/history/expired facts

- Current activity is derived by status bucket query (`accepted/in_progress/awaiting_checkin`), not from a dedicated runtime pointer.
  - Evidence: `src/app/api/pairs/[id]/activities/route.ts:29`, `src/app/api/pairs/[id]/summary/route.ts:67`, `src/models/Pair.ts:19`.
- History bucket includes `completed_success`, `completed_partial`, `failed`, `cancelled`, `expired`.
  - Evidence: `src/app/api/pairs/[id]/activities/route.ts:33`.
- `PairActivity.status='expired'` exists in schema and history filter, but no in-repo write path was found for PairActivity lifecycle.
  - Evidence: `src/models/PairActivity.ts:49`, `src/app/api/pairs/[id]/activities/route.ts:39`, `src/domain/services/activityOffer.service.ts:312`, `src/domain/services/activities.service.ts:72`.
  - `UNKNOWN`: external worker/cron outside this repository could set `PairActivity.status='expired'`; such integration is not present in examined code.

## 4) State machine & guards (as implemented)

### 4.1 Statuses and transitions (fact)

- Status enum source: `PairActivity.status` in model.
  - Evidence: `src/models/PairActivity.ts:47`, `src/models/PairActivity.ts:125`.
- Implemented transition rules are centralized in `activityTransition(...)`.
  - Evidence: `src/domain/state/activityMachine.ts:66`.

| Action | From | To | Notes | Evidence |
|---|---|---|---|---|
| `ACCEPT` | `offered` | `accepted` | Idempotent noop allowed from `accepted` to `accepted`. | `src/domain/state/activityMachine.ts:73`, `src/domain/state/activityMachine.ts:82` |
| `CANCEL` | `offered/accepted/in_progress/awaiting_checkin` | `cancelled` | Idempotent noop allowed from `cancelled`. | `src/domain/state/activityMachine.ts:95`, `src/domain/state/activityMachine.ts:105` |
| `CHECKIN` | `accepted/in_progress/awaiting_checkin` | `awaiting_checkin` | Appends answers and stamps role as `by`. | `src/domain/state/activityMachine.ts:123`, `src/domain/state/activityMachine.ts:132`, `src/domain/state/activityMachine.ts:142` |
| `COMPLETE` | `accepted/in_progress/awaiting_checkin` | `completed_success/partial/failed` | Completion status comes from score thresholds in service. | `src/domain/state/activityMachine.ts:151`, `src/domain/state/activityMachine.ts:159`, `src/domain/services/activities.service.ts:43` |

### 4.2 Role model and authz

- Mutation routes enforce `requireSession` first, then activity membership via `requireActivityMember(...)` in service.
- `requireActivityMember` resolves role `A|B` through pair membership.
- Role is used for `answers.by` and state-conflict details; no action-specific role allow-list exists.

Evidence: `src/app/api/activities/[id]/accept/route.ts:18`, `src/domain/services/activities.service.ts:32`, `src/lib/auth/resourceGuards.ts:47`, `src/lib/auth/resourceGuards.ts:62`, `src/domain/state/activityMachine.ts:60`, `src/domain/state/activityMachine.ts:134`.

### 4.3 Error generation map

| Status / code | Where generated | Evidence |
|---|---|---|
| `401` `AUTH_REQUIRED` / `AUTH_INVALID_SESSION` | `requireSession` | `src/lib/auth/guards.ts:15`, `src/lib/auth/guards.ts:20` |
| `403` `ACCESS_DENIED` | `requirePairMember` / `requireActivityMember` | `src/lib/auth/resourceGuards.ts:41`, `src/lib/auth/resourceGuards.ts:64` |
| `404` `NOT_FOUND` | invalid ObjectId or missing resource in resource guards | `src/lib/auth/resourceGuards.ts:25`, `src/lib/auth/resourceGuards.ts:54`, `src/lib/auth/resourceGuards.ts:59` |
| `400` `VALIDATION_ERROR` | request/body/query/params validation | `src/lib/api/validate.ts:27`, `src/lib/api/validate.ts:40` |
| `409` `STATE_CONFLICT` | forbidden transition in activity machine | `src/domain/state/activityMachine.ts:54` |
| `422` `IDEMPOTENCY_KEY_REQUIRED` / `IDEMPOTENCY_KEY_INVALID` | idempotency key validator | `src/lib/idempotency/key.ts:35`, `src/lib/idempotency/key.ts:45` |
| `409` `IDEMPOTENCY_IN_PROGRESS` / `IDEMPOTENCY_KEY_REUSE_CONFLICT` | idempotency replay/conflict resolver | `src/lib/idempotency/withIdempotency.ts:57`, `src/lib/idempotency/withIdempotency.ts:66` |
| `402` `ENTITLEMENT_REQUIRED` | entitlement guard | `src/lib/entitlements/guards.ts:124`, `src/lib/entitlements/guards.ts:125` |
| `403` `QUOTA_EXCEEDED` | quota guard | `src/lib/entitlements/guards.ts:215`, `src/lib/entitlements/guards.ts:216` |
| `429` `RATE_LIMITED` | generic rate-limit utility (not wired to activity endpoints) | `src/lib/abuse/rateLimit.ts:139` |

### 4.4 Endpoint matrix

| Endpoint | Guard/AuthZ | State action | Idempotency | Rate limit | Entitlements / quota | Event emitted |
|---|---|---|---|---|---|---|
| `POST /api/activities/[id]/accept` | `requireSession` + `requireActivityMember` (service) | `ACCEPT` | `withIdempotency` required UUID key | None in route | None | `ACTIVITY_ACCEPTED` |
| `POST /api/activities/[id]/cancel` | same | `CANCEL` | `withIdempotency` | None | None | `ACTIVITY_CANCELED` |
| `POST /api/activities/[id]/checkin` | same | `CHECKIN` | `withIdempotency` | None | None | `ACTIVITY_CHECKED_IN` |
| `POST /api/activities/[id]/complete` | same | `COMPLETE` | `withIdempotency` | None | None | `ACTIVITY_COMPLETED` |
| `GET /api/pairs/[id]/activities` | `requireSession` + `requirePairMember` | Read-only (bucket filters + merge) | No | None | None | `LEGACY_RELATIONSHIP_ACTIVITY_VIEWED` (conditional if legacy rows exist) |
| `POST /api/pairs/[id]/suggest` | `requireSession`; membership in service guard | Create offers (`offered`) | No server idempotency wrapper | None | `assertEntitlement('activities.suggestions')` + `assertQuota('activities.suggestions.per_day')` | `SUGGESTIONS_GENERATED` |
| `POST /api/pairs/[id]/activities/suggest` | same | Create offers (`offered`, dedupe enabled) | No | None | same | `SUGGESTIONS_GENERATED` |
| `POST /api/activities/next` | `requireSession`; active pair lookup in service | Create one offer (`offered`) | No | None | same | `SUGGESTIONS_GENERATED` |
| `POST /api/pairs/[id]/activities/from-template` | `requireSession`; membership in service guard | Create one offer from explicit template | No | None | No entitlement/quota checks | None |

Evidence: `src/app/api/activities/[id]/accept/route.ts:27`, `src/app/api/activities/[id]/cancel/route.ts:27`, `src/app/api/activities/[id]/checkin/route.ts:43`, `src/app/api/activities/[id]/complete/route.ts:28`, `src/app/api/pairs/[id]/activities/route.ts:75`, `src/app/api/pairs/[id]/suggest/route.ts:40`, `src/app/api/pairs/[id]/activities/suggest/route.ts:40`, `src/app/api/activities/next/route.ts:26`, `src/app/api/pairs/[id]/activities/from-template/route.ts:35`, `src/domain/services/activities.service.ts:80`, `src/domain/services/activities.service.ts:129`, `src/domain/services/activities.service.ts:186`, `src/domain/services/activities.service.ts:256`, `src/domain/services/activityOffer.service.ts:173`, `src/domain/services/relationshipActivityLegacy.service.ts:100`.

### 4.5 Idempotency contract details

- Key header required: `Idempotency-Key`; must be UUID.
- Fingerprint: `METHOD|route|stableStringified(body)`.
- Replay behavior:
  - same key + same fingerprint + completed record -> stored response replayed;
  - same key + different fingerprint -> `409 IDEMPOTENCY_KEY_REUSE_CONFLICT`;
  - same key while first request in-progress -> `409 IDEMPOTENCY_IN_PROGRESS`.
- Storage: collection `idempotency_records`, unique index on `{userId,route,key}`, TTL 48h (`172800` seconds).

Evidence: `src/lib/idempotency/key.ts:5`, `src/lib/idempotency/key.ts:45`, `src/lib/idempotency/key.ts:60`, `src/lib/idempotency/withIdempotency.ts:57`, `src/lib/idempotency/withIdempotency.ts:65`, `src/lib/idempotency/withIdempotency.ts:73`, `src/models/IdempotencyRecord.ts:34`, `src/models/IdempotencyRecord.ts:35`.

## 5) Offers/Suggestions pipeline (selection and creation)

| Pipeline step | As-is logic | Evidence |
|---|---|---|
| Input contract | `pairId`, `currentUserId`, `dedupeAgainstLastOffered`, optional `count`, `source`, optional audit context. | `src/domain/services/activityOffer.service.ts:247` |
| Membership guard | `suggestActivitiesInternal` starts with `ensurePairMember(...)` (`requirePairMember` under hood). | `src/domain/services/activityOffer.service.ts:259`, `src/domain/services/activityOffer.service.ts:43` |
| Top-risk axis | Takes `pair.passport.riskZones`, sorts by `severity desc`, picks first; if absent -> `PAIR_PASSPORT_RISK_MISSING` (400). | `src/domain/services/activityOffer.service.ts:94`, `src/domain/services/activityOffer.service.ts:98`, `src/domain/services/activityOffer.service.ts:102` |
| Difficulty formula | `raw = topRiskSeverity + (-1 if fatigue>0.6) + (+1 if fatigue<0.3)`, clamped to `1..5`. | `src/domain/services/activityOffer.service.ts:127`, `src/domain/services/activityOffer.service.ts:133`, `src/domain/services/activityOffer.service.ts:135` |
| Candidate prefilter | `axis == topRisk.axis` and `difficulty in [d, d-1, d+1]`. | `src/domain/services/activityOffer.service.ts:195`, `src/domain/services/activityOffer.service.ts:203`, `src/domain/services/activityOffer.service.ts:205` |
| Candidate sampling and fallback | First `$sample` random subset; fallback `find(...).sort(updatedAt:-1).limit(20)` when sampled set insufficient. | `src/domain/services/activityOffer.service.ts:201`, `src/domain/services/activityOffer.service.ts:208`, `src/domain/services/activityOffer.service.ts:223`, `src/domain/services/activityOffer.service.ts:228` |
| Optional dedupe | For `dedupeAgainstLastOffered=true`, reads latest offered activity and skips same `stateMeta.templateId`. | `src/domain/services/activityOffer.service.ts:269`, `src/domain/services/activityOffer.service.ts:277`, `src/domain/services/activityOffer.service.ts:287` |
| Offer count clamp | `count` default `3`, clamped to `1..5`. | `src/domain/services/activityOffer.service.ts:138`, `src/domain/services/activityOffer.service.ts:140` |
| PairActivity create payload | Writes `status:'offered'`, `offeredAt`, `dueAt=now+3d`, `stateMeta:{templateId,source,stepsPreview}`, `checkIns/effect`, deltas, `createdBy:'system'`. | `src/domain/services/activityOffer.service.ts:304`, `src/domain/services/activityOffer.service.ts:333`, `src/domain/services/activityOffer.service.ts:336`, `src/domain/services/activityOffer.service.ts:337`, `src/domain/services/activityOffer.service.ts:342`, `src/domain/services/activityOffer.service.ts:348` |
| Auto reward deltas | If template lacks explicit deltas, fallback to `autoDeltas(intent,intensity)` then map to offer reward. | `src/domain/services/activityOffer.service.ts:111`, `src/domain/services/activityOffer.service.ts:309`, `src/lib/dto/activity.dto.ts:250` |
| Offer DTO mapping | Returns `toActivityOfferDTO(...)`: includes `templateId`, `stepsPreview`, `expiresAt=dueAt`, `source` fallback `'system'`. | `src/domain/services/activityOffer.service.ts:361`, `src/lib/dto/activity.dto.ts:241`, `src/lib/dto/activity.dto.ts:255` |
| Audit on suggest pipeline | Emits `SUGGESTIONS_GENERATED` for each run (including `count:0` branch). | `src/domain/services/activityOffer.service.ts:292`, `src/domain/services/activityOffer.service.ts:353`, `src/domain/services/activityOffer.service.ts:173` |
| From-template branch | Direct creation from explicit template; sets `createdBy:'user'`, `status:'offered'`, `stateMeta.source:'pairs.activities.suggest'`; no dedicated emitEvent call. | `src/domain/services/activityOffer.service.ts:434`, `src/domain/services/activityOffer.service.ts:457`, `src/domain/services/activityOffer.service.ts:460`, `src/domain/services/activityOffer.service.ts:465` |

### Template fields ignored by candidate selection (fact)

- Candidate filters do not include `preconditions` or `cooldownDays`.
- Selection predicates are limited to `axis` + difficulty neighborhood.

Evidence: `src/models/ActivityTemplate.ts:52`, `src/models/ActivityTemplate.ts:59`, `src/domain/services/activityOffer.service.ts:203`, `src/domain/services/activityOffer.service.ts:224`.

## 6) API inventory: server contracts vs client contracts

### 6.1 Endpoint contract alignment table

| Endpoint | Server response contract | Client method + type | Match | Evidence |
|---|---|---|---|---|
| `POST /api/pairs/[id]/suggest` | `jsonOk(ActivityOfferDTO[])` | `activitiesApi.suggestPairActivities(): Promise<ActivityOfferDTO[]>` | Yes (shape) | `src/app/api/pairs/[id]/suggest/route.ts:60`, `src/client/api/activities.api.ts:25` |
| `POST /api/pairs/[id]/activities/suggest` | `jsonOk(ActivityOfferDTO[])` | `activitiesApi.suggestPairActivitiesByTemplates(): Promise<ActivityOfferDTO[]>` | Yes (shape) | `src/app/api/pairs/[id]/activities/suggest/route.ts:60`, `src/client/api/activities.api.ts:30` |
| `POST /api/activities/next` | `jsonOk({ activityId, offer? })` | `activitiesApi.createNextActivity(): Promise<NextActivityResponse>` | Yes (shape) | `src/app/api/activities/next/route.ts:43`, `src/client/api/activities.api.ts:45`, `src/client/api/types.ts:248` |
| `POST /api/activities/[id]/accept` | `jsonOk({})` via service return `{}` | `acceptActivity(): Promise<MutationAckDTO>` | Yes | `src/domain/services/activities.service.ts:100`, `src/client/api/activities.api.ts:50`, `src/client/api/types.ts:172` |
| `POST /api/activities/[id]/cancel` | `jsonOk({})` via service return `{}` | `cancelActivity(): Promise<MutationAckDTO>` | Yes | `src/domain/services/activities.service.ts:149`, `src/client/api/activities.api.ts:55`, `src/client/api/types.ts:172` |
| `POST /api/activities/[id]/checkin` | `jsonOk({ success:number })` | `checkInActivity(): Promise<ActivityCheckInResponse>` | Yes | `src/domain/services/activities.service.ts:208`, `src/client/api/activities.api.ts:60`, `src/client/api/types.ts:244` |
| `POST /api/activities/[id]/complete` | `jsonOk({ success:number, status })` | `completeActivity(): Promise<MutationAckDTO>` | **Mismatch** | `src/domain/services/activities.service.ts:277`, `src/client/api/activities.api.ts:67`, `src/client/api/types.ts:172` |
| `POST /api/pairs/[id]/activities/from-template` | `jsonOk({ id, offer? })` | `createFromTemplate(): Promise<CreateActivityFromTemplateResponse>` where type has only `{id}` | **Mismatch** | `src/domain/services/activityOffer.service.ts:468`, `src/app/api/pairs/[id]/activities/from-template/route.ts:40`, `src/client/api/types.ts:257` |
| `GET /api/pairs/[id]/activities` | `jsonOk(PairActivityDTO[])` including optional `legacy/legacySource`; status type is server model union | `getPairActivities(): Promise<PairActivityDTO[]>` where client DTO omits `legacy`, omits status `'suggested'` | **Partial mismatch** (information loss in typing) | `src/lib/dto/activity.dto.ts:64`, `src/lib/dto/activity.dto.ts:150`, `src/lib/dto/activity.dto.ts:162`, `src/client/api/types.ts:174`, `src/client/api/types.ts:200` |

### 6.2 Confirmed mismatch consequences

| Mismatch | Consequence (fact) | Confirmed UI break point |
|---|---|---|
| `completeActivity` typed as `MutationAckDTO`, server returns `{ success, status }` | Payload fields are not type-visible to caller; current hook only checks truthiness and refetches. | No confirmed crash in current callers (`useActivityOffers` ignores payload). |
| `createFromTemplate` client response type omits `offer` | Returned `offer` from server is inaccessible to typed callers; current hook ignores it and only refetches. | No confirmed crash; data loss at type level. |
| Client `PairActivityDTO` omits `legacy` metadata and `'suggested'` status | UI type layer cannot explicitly branch on legacy source or `suggested` status even if backend emits them. | No confirmed crash in current flow; capability gap. |

Evidence: `src/client/hooks/useActivityOffers.ts:160`, `src/client/hooks/useActivityOffers.ts:114`, `src/lib/dto/activity.dto.ts:64`, `src/client/api/types.ts:174`.

## 7) UI: screens/components/hooks/stores data-flow

### 7.1 `/couple-activity` page

#### Load flow

| UI event | Hook/store | API | Response/state update | Render result | Evidence |
|---|---|---|---|---|---|
| Page mount | `usePair()` resolves `pairId`; `useActivityOffers({pairId})` auto-refetches | 3 parallel GET calls for `current/suggested/history` buckets | Saves lists to zustand keys `pair-activities:{pairId}:{bucket}` and local `buckets` state | Tabs render `active`, `suggested`, `history` VMs | `src/app/couple-activity/page.tsx:16`, `src/client/hooks/usePair.ts:101`, `src/client/hooks/useActivityOffers.ts:80`, `src/client/hooks/useActivityOffers.ts:93`, `src/client/stores/useEntitiesStore.ts:153` |

#### Actions

| UI action | Event chain | API call(s) | State update | Evidence |
|---|---|---|---|---|
| “Предложить” / “Ещё варианты” | Button -> `onSuggestNext` -> `useActivityOffers.suggestNext()` | `POST /api/pairs/{id}/suggest` then refetch 3 buckets | `lastOfferBatch` updated + buckets refreshed | `src/features/activities/CoupleActivityView.tsx:108`, `src/features/activities/CoupleActivityView.tsx:119`, `src/client/hooks/useActivityOffers.ts:102`, `src/client/api/activities.api.ts:26` |
| “Принять” (suggested card) | Button -> `onAccept(id)` -> `acceptActivity(id)` | `POST /api/activities/{id}/accept` | Refetch buckets | `src/features/activities/CoupleActivityView.tsx:134`, `src/client/hooks/useActivityOffers.ts:129`, `src/client/api/activities.api.ts:50` |
| “Отклонить” / “Отменить” | Button -> `onCancel(id)` -> `cancelActivity(id)` | `POST /api/activities/{id}/cancel` | Refetch buckets | `src/features/activities/CoupleActivityView.tsx:135`, `src/features/activities/CoupleActivityView.tsx:98`, `src/client/hooks/useActivityOffers.ts:139`, `src/client/api/activities.api.ts:55` |
| “Завершить” (active card) | Button -> `onOpenCheckIn(active)` -> modal -> `onSubmitCheckIn` -> `checkInActivity(activityId,{answers})` | `POST /api/activities/{id}/checkin` | On success closes modal + refetch buckets | `src/features/activities/CoupleActivityView.tsx:99`, `src/features/activities/CoupleActivityView.tsx:162`, `src/app/couple-activity/page.tsx:55`, `src/client/hooks/useActivityOffers.ts:149` |

#### Error/loading/paywall behavior

- `useApi` maps transport/domain errors to `UiErrorState` (`paywall`, `rate_limited`, `auth_required`, etc.).
- `CoupleActivityView` renders `LoadingView` and `ErrorView`; `ErrorView` renders `PaywallView` for paywall-kind errors.
- No toast usage in current `/couple-activity` flow.

Evidence: `src/client/hooks/useApi.ts:42`, `src/client/api/errors.ts:106`, `src/features/activities/CoupleActivityView.tsx:87`, `src/features/activities/CoupleActivityView.tsx:88`, `src/components/ui/ErrorView.tsx:27`, `src/client/stores/useUiStore.ts:19`.

### 7.2 Profile / Pair Profile integration

| Surface | UI event -> hook/api -> response -> render | Evidence |
|---|---|---|
| Pair profile page (`/pair`, `/pair/[id]`) | Mount -> resolve pair ID (`pairsApi.getMyPair` when route param absent) -> `pairsApi.getSummary(pairId)` -> render `currentActivity`, `suggestedCount`, CTA links to `/couple-activity`. | `src/features/pair/PairProfilePageClient.tsx:42`, `src/features/pair/PairProfilePageClient.tsx:66`, `src/features/pair/PairProfilePageClient.tsx:181`, `src/features/pair/PairProfilePageClient.tsx:150`, `src/client/api/pairs.api.ts:25`, `src/app/api/pairs/[id]/summary/route.ts:84` |
| Profile overview (`/profile`) | Mount -> `usersApi.getProfileSummary()` -> `normalizeProfileSummary(...)` -> render “Личная активность” block. Backend returns `activity.current=null`, `activity.suggested=[]`, `historyCount=0` placeholders. | `src/app/(auth)/profile/page.tsx:38`, `src/app/(auth)/profile/page.tsx:107`, `src/client/api/users.api.ts:25`, `src/app/api/users/me/profile-summary/route.ts:181`, `src/app/api/users/me/profile-summary/route.ts:182`, `src/components/activities/UserActivityCard.tsx:6` |
| Profile activities tab (`/profile/(tabs)/activities`) | Static placeholder page only, no activities API call. | `src/app/profile/(tabs)/activities/page.tsx:13` |

## 8) What exists vs expected behavior (gaps, fact-only)

| Severity | Symptom | Root cause (code path) | Evidence |
|---|---|---|---|
| P0 | User cannot complete pair activity from `/couple-activity`; flow stops after check-in. | “Завершить” opens `CheckInModal`; submit calls only `/checkin`. `completeActivity` exists in hook/API but is not wired in page/view flow. | `src/features/activities/CoupleActivityView.tsx:99`, `src/app/couple-activity/page.tsx:55`, `src/client/hooks/useActivityOffers.ts:159` |
| P1 | Offered activities never auto-transition to `expired` in in-repo runtime. | `expired` exists in schema/history filters but no PairActivity writer to `status:'expired'` found in activity services/routes. | `src/models/PairActivity.ts:49`, `src/app/api/pairs/[id]/activities/route.ts:39`, `src/domain/services/activityOffer.service.ts:312`, `src/domain/services/activities.service.ts:72` |
| P1 | Client sends idempotency key for suggest/next/from-template, but server ignores it for these routes. | Client sets `idempotency:true`; routes do not use `withIdempotency`. | `src/client/api/activities.api.ts:26`, `src/client/api/activities.api.ts:46`, `src/client/api/activities.api.ts:39`, `src/app/api/pairs/[id]/suggest/route.ts:24`, `src/app/api/activities/next/route.ts:16`, `src/app/api/pairs/[id]/activities/from-template/route.ts:24` |
| P1 | No rate-limit protection on activities endpoints. | Activity routes do not call `enforceRateLimit`; `RATE_LIMIT_POLICIES` has no activities policy. | `src/lib/abuse/rateLimit.ts:19`, `src/app/api/activities/next/route.ts:1`, `src/app/api/pairs/[id]/suggest/route.ts:1`, `src/app/api/activities/[id]/accept/route.ts:1` |
| P1 | `from-template` flow bypasses entitlement/quota checks applied to suggest/next. | Route directly calls service without `assertEntitlement/assertQuota`. | `src/app/api/pairs/[id]/activities/from-template/route.ts:35`, `src/app/api/pairs/[id]/suggest/route.ts:40`, `src/app/api/activities/next/route.ts:26` |
| P1 | Pair status gating is inconsistent across offer entrypoints. | `suggest/from-template` only require pair membership (can include paused/ended), while `next` requires pair `status:'active'`. | `src/lib/auth/resourceGuards.ts:28`, `src/domain/services/activityOffer.service.ts:259`, `src/domain/services/activityOffer.service.ts:371`, `src/app/api/pairs/me/route.ts:25`, `src/client/hooks/usePair.ts:102` |
| P1 | Template constraints `preconditions/cooldownDays` are not enforced in candidate selection. | Selection query uses only `axis` and difficulty window. | `src/models/ActivityTemplate.ts:52`, `src/models/ActivityTemplate.ts:59`, `src/domain/services/activityOffer.service.ts:203`, `src/domain/services/activityOffer.service.ts:224` |
| P1 | Template-created activities are not analytics-distinguishable as separate source event. | `createFromTemplate` sets `createdBy:'user'` but reuses `stateMeta.source:'pairs.activities.suggest'` and emits no dedicated audit event. | `src/domain/services/activityOffer.service.ts:460`, `src/domain/services/activityOffer.service.ts:465`, `src/domain/services/activityOffer.service.ts:434`, `src/lib/audit/eventTypes.ts:8` |
| P2 | Declared statuses `suggested` and `in_progress` are not assigned by current pair-activity flows. | Runtime creation writes `offered`; lifecycle transitions write `accepted/awaiting_checkin/completed*/cancelled`; no assignment path to `suggested`/`in_progress`. | `src/models/PairActivity.ts:48`, `src/domain/services/activityOffer.service.ts:336`, `src/domain/services/activities.service.ts:72`, `src/domain/state/activityMachine.ts:142` |
| P2 | `/api/activity-templates` filters difficulty only `1..3`, while model/pipeline support `1..5`. | Query schema max is 3; model and difficulty resolver clamp to 5. | `src/app/api/activity-templates/route.ts:17`, `src/models/ActivityTemplate.ts:36`, `src/domain/services/activityOffer.service.ts:130` |
| P2 | Contract mismatch: complete response type on client does not match server payload. | Client uses `MutationAckDTO`, server returns `{ success, status }`. | `src/client/api/activities.api.ts:67`, `src/client/api/types.ts:172`, `src/domain/services/activities.service.ts:277` |
| P2 | Contract mismatch: from-template response type drops server `offer` object. | Client type `CreateActivityFromTemplateResponse` includes only `id`. | `src/client/api/types.ts:257`, `src/domain/services/activityOffer.service.ts:470`, `src/app/api/pairs/[id]/activities/from-template/route.ts:40` |
| P2 | No audit event for canonical feed view. | `GET /api/pairs/[id]/activities` emits event only for legacy read path, not for canonical list reads. | `src/app/api/pairs/[id]/activities/route.ts:85`, `src/domain/services/relationshipActivityLegacy.service.ts:98` |

## 9) Minimal To-Fix list (next-sprint backlog, no implementation)

| Title | Why | Exact files likely touched | Acceptance criteria (manual) | Risks |
|---|---|---|---|---|
| Wire UI completion after check-in | Closes P0: user cannot finish lifecycle. | `src/app/couple-activity/page.tsx`, `src/features/activities/CoupleActivityView.tsx`, `src/client/hooks/useActivityOffers.ts` | From active card: check-in submit leads to `/complete` call and item moves to history. | UX ambiguity: whether completion should be explicit second step or automatic after check-in. |
| Define completion UX contract (1-step vs 2-step) | Avoid future regressions in lifecycle semantics. | `src/features/activities/CoupleActivityView.tsx`, `docs/04-api-contracts.md`, `docs/03-state-machines.md` | Documented and reflected in UI behavior. | Product decision needed. |
| Add/align idempotency on offer endpoints | Prevent duplicate offers on retries and align client/server contracts. | `src/app/api/pairs/[id]/suggest/route.ts`, `src/app/api/pairs/[id]/activities/suggest/route.ts`, `src/app/api/activities/next/route.ts`, `src/app/api/pairs/[id]/activities/from-template/route.ts`, `src/client/api/activities.api.ts` | Replayed request with same key returns same envelope for covered routes. | Extra DB load for idempotency store. |
| Add rate-limit policies for activities routes | Close abuse gap on suggestions and lifecycle mutations. | `src/lib/abuse/rateLimit.ts`, `src/app/api/activities/next/route.ts`, `src/app/api/activities/[id]/*/route.ts`, `src/app/api/pairs/[id]/suggest/route.ts`, `src/app/api/pairs/[id]/activities/suggest/route.ts`, `src/app/api/pairs/[id]/activities/from-template/route.ts` | Exceeding threshold returns `429 RATE_LIMITED` with `Retry-After`. | Incorrect limits can degrade UX. |
| Add entitlements/quota policy for from-template | Remove policy bypass relative to suggest/next. | `src/app/api/pairs/[id]/activities/from-template/route.ts`, `src/lib/entitlements/guards.ts`, `docs/06-entitlements-billing.md` | Free-plan user hitting limit gets `ENTITLEMENT_REQUIRED` or `QUOTA_EXCEEDED`. | Could block existing internal workflows if exemptions are expected. |
| Normalize pair-status gating across all offer entrypoints | Eliminate `active` vs membership-only inconsistency. | `src/domain/services/activityOffer.service.ts`, `src/lib/auth/resourceGuards.ts`, `src/app/api/activities/next/route.ts`, `src/app/api/pairs/[id]/suggest/route.ts`, `src/app/api/pairs/[id]/activities/from-template/route.ts` | Paused/ended pair behavior is consistent across `next/suggest/from-template`. | Behavior change for existing paused pairs. |
| Implement expiry mechanism for offered activities | Make `expired` status functional. | `src/domain/services/activityOffer.service.ts`, new scheduler/worker under `src/domain/services/*` or `scripts/*`, `src/models/PairActivity.ts` (if needed) | Activities past `dueAt` transition to `expired` and appear in history bucket. | Requires background execution environment. |
| Enforce template `preconditions/cooldownDays` in selection | Use model intent and reduce repeated/ineligible offers. | `src/domain/services/activityOffer.service.ts`, possibly `src/models/Pair.ts`, `src/models/ActivityTemplate.ts` docs | Candidate list excludes templates violating preconditions/cooldown. | Additional query complexity and data dependencies. |
| Distinguish template-flow source and add audit event | Improve analytics attribution. | `src/domain/services/activityOffer.service.ts`, `src/lib/audit/eventTypes.ts`, `docs/05-analytics-events.md` | Template flow emits dedicated event and unique source value. | Event taxonomy migration for downstream dashboards. |
| Add canonical feed-view audit event | Close analytics blind spot on `/pairs/[id]/activities` reads. | `src/app/api/pairs/[id]/activities/route.ts`, `src/lib/audit/eventTypes.ts`, `src/lib/audit/emitEvent.ts` | Feed open generates auditable event regardless of legacy rows. | Event volume increase. |
| Align client types with server activity contracts | Remove DTO drift and hidden fields. | `src/client/api/types.ts`, `src/client/api/activities.api.ts`, `src/client/viewmodels/activity.viewmodels.ts` | TS types include complete payload and optional `offer`, legacy flags/status union aligned. | Requires UI refactors where strict typing reveals assumptions. |
| Align `/api/activity-templates` difficulty filter to `1..5` | Remove contract mismatch. | `src/app/api/activity-templates/route.ts`, `docs/04-api-contracts.md` | `difficulty=4/5` query returns templates when present. | Potentially broader result sets; client UI may need handling. |
| Add endpoint-level tests for lifecycle and contracts | Prevent regressions in state transitions and response schemas. | test files under existing API/service test location | Tests cover accept/cancel/checkin/complete and suggest/next/from-template contract shapes. | Test maintenance overhead. |

## 10) Deliverables

- Main document created: `docs/activities/pair-activity-inventory.as-is.md`.
- Optional diagrams file: not created (all lifecycle/state details are embedded in section 3/4 tables).
- Changelog entry required by AGENTS: added in `docs/CHANGELOG.md`.
- Validation commands for this task:
  - `git status --short` should show only `docs/**` changes.
  - `git diff -- docs/activities/pair-activity-inventory.as-is.md docs/CHANGELOG.md` for review.
