# Pair Activity Inventory Working (2026-02-08)

## 1) What users can do now (end-to-end)

Current `/couple-activity` flow:
- Suggest, accept, cancel activities in existing tabs.
- Submit check-in answers from modal.
- After successful check-in, UI attempts complete immediately.
- If complete fails, UI keeps activity in pending-complete state and allows retrying complete without re-sending check-in answers.

Evidence:
- Container flow and actions: `src/app/couple-activity/page.tsx:88`, `src/app/couple-activity/page.tsx:104`, `src/app/couple-activity/page.tsx:113`, `src/app/couple-activity/page.tsx:139`
- Active/suggested/history rendering and actions: `src/features/activities/CoupleActivityView.tsx:107`, `src/features/activities/CoupleActivityView.tsx:111`, `src/features/activities/CoupleActivityView.tsx:147`

## 2) Resilient checkin -> complete UX (P0)

Implemented recovery for partial success (`checkin success`, `complete failed`):
- `pendingComplete` state stores `activityId` + idempotency keys + last UI error.
- On complete failure, modal switches to pending-complete mode with dedicated `Завершить еще раз` action.
- Retry complete does not call check-in again.

Conflict handling:
- For `409 STATE_CONFLICT`, flow is treated as state-changed:
  - refetch buckets,
  - clear pending state,
  - close modal,
  - show short informational message.
- For idempotency-related `409` (`IDEMPOTENCY_IN_PROGRESS`, `IDEMPOTENCY_KEY_REUSE_CONFLICT`), flow stays retryable and keeps pending-complete context.

Evidence:
- Pending state and conflict recovery: `src/app/couple-activity/page.tsx:30`, `src/app/couple-activity/page.tsx:69`, `src/app/couple-activity/page.tsx:75`
- Retry path with stored complete key: `src/app/couple-activity/page.tsx:139`, `src/app/couple-activity/page.tsx:154`
- Inline banner + retry action in active tab: `src/features/activities/CoupleActivityView.tsx:111`, `src/features/activities/CoupleActivityView.tsx:116`
- Modal pending-complete mode: `src/components/activities/CheckInModal.tsx:88`, `src/components/activities/CheckInModal.tsx:150`, `src/components/activities/CheckInModal.tsx:157`
- Conflict resolution policy and retry messages: `src/features/activities/checkinCompleteFlow.ts:21`, `src/features/activities/checkinCompleteFlow.ts:28`

## 3) Client idempotency rules for chaining

Rules implemented in client:
- check-in and complete use different keys (`checkInKey`, `completeKey`) per attempt.
- Retry complete reuses same `completeKey`.
- Retry same check-in attempt reuses same `checkInKey` while attempt context is alive.
- Explicit header value has priority; HTTP layer auto-generates only when header is absent.

Evidence:
- Attempt key model and messages: `src/features/activities/checkinCompleteFlow.ts:4`, `src/features/activities/checkinCompleteFlow.ts:14`, `src/features/activities/checkinCompleteFlow.ts:20`
- Passing explicit keys to API calls: `src/app/couple-activity/page.tsx:104`, `src/app/couple-activity/page.tsx:113`, `src/app/couple-activity/page.tsx:154`
- API methods with optional idempotency key input: `src/client/api/activities.api.ts:75`, `src/client/api/activities.api.ts:85`
- Header construction helper: `src/client/api/idempotency.ts:1`, `src/client/api/idempotency.ts:22`
- HTTP fallback generation only when header missing: `src/client/api/http.ts:106`, `src/client/api/http.ts:108`

## 4) Client contract and typing alignment

Current client contracts used by UI:
- `completeActivity` typed as `{ success, status }` (`ActivityCompleteResponse`).
- `createFromTemplate` typed as `{ id, offer? }`.
- `PairActivityDTO.status` includes lifecycle statuses needed by current/suggested/history; optional legacy fields supported.

Viewmodel status helpers added:
- `isAwaitingCheckinStatus(...)`
- `isHistoryActivityStatus(...)`

Evidence:
- API response typings: `src/client/api/types.ts:264`, `src/client/api/types.ts:278`
- Viewmodel status handling: `src/client/viewmodels/activity.viewmodels.ts:11`, `src/client/viewmodels/activity.viewmodels.ts:15`, `src/client/viewmodels/activity.viewmodels.ts:51`

## 5) Error mapping and user-facing categories

`toUiErrorState` now maps by code and status to stable UI kinds:
- `401` -> `auth_required`
- `403` -> `access_denied`
- `404` -> `not_found`
- `409` -> `state_conflict`
- `422` and idempotency key format errors -> `validation`
- `5xx` -> `generic`

Complete-retry UX uses targeted text for 409/422/network/server failures.

Evidence:
- Error-kind mapping: `src/client/api/errors.ts:106`, `src/client/api/errors.ts:123`, `src/client/api/errors.ts:126`, `src/client/api/errors.ts:127`
- Complete retry message mapping: `src/features/activities/checkinCompleteFlow.ts:30`

## 6) Out of scope in this task

Intentionally not changed:
- Mongo/DB layer and build-time env fixes (`MONGODB_URI`, `mongodb.ts`, indexes, DB workers, DB bulk updates).
- Recovery/date generation business logic (only existing growth flow remains as-is).
- Server-side expiry mechanics and DB-backed lifecycle migrations.
