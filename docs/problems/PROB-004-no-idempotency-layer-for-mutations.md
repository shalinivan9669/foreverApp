# PROB-004: No Idempotency Layer For Mutations

## Problem
Повторные POST-запросы на мутациях не управляются единым идемпотентным ключом.

## Evidence
- ADR фиксирует отсутствие идемпотентного слоя: `docs/ADR/ADR-004-idempotency-mutations.md`.
- Мутации статусов без `Idempotency-Key`:
  - `src/app/api/activities/[id]/accept/route.ts`
  - `src/app/api/activities/[id]/cancel/route.ts`
  - `src/app/api/activities/[id]/checkin/route.ts`
  - `src/app/api/activities/[id]/complete/route.ts`
  - `src/app/api/match/accept/route.ts`
  - `src/app/api/match/reject/route.ts`
  - `src/app/api/match/confirm/route.ts`
  - `src/app/api/pairs/create/route.ts`
- В `PairQuestionnaireAnswer` и `Like` есть частичные anti-race паттерны, но нет cross-route стандарта.

## Impact
- Дубли действий при ретраях сети и повторных кликах.
- Конфликтные переходы состояний (`awaiting_initiator`, `mutual_ready`, `paired`, activity statuses).
- Повышенная сложность разборов инцидентов и reconciliation.

## Target state
- Для всех side-effect мутаций обязателен `Idempotency-Key` (header) или `clientMutationId`.
- Результат первого успешного выполнения кэшируется и возвращается повторно.
- Идемпотентность реализована централизованно, а не в каждом route.ts.

## Plan
- Итерация 1:
  - Добавить коллекцию/модель `src/models/IdempotencyKey.ts`.
  - Добавить helper `src/lib/http/idempotency.ts`.
- Итерация 2:
  - Подключить helper на `match/*`, `activities/[id]/*`, `pairs/create`, `pairs/[id]/questionnaires/[qid]/answer`.
- Итерация 3:
  - Документировать контракт в `docs/04-api-contracts.md`.
  - Обновить ADR-004 статус внедрения.

## Acceptance criteria
- Повтор одного и того же mutation-запроса с тем же ключом не создает новых side effects.
- Для конфликтующих повторов возвращается тот же статус/тот же payload.
- P0 мутации покрыты интеграционными тестами идемпотентности: `TODO(path): tests/api/idempotency/*`.

## Links
- `docs/03-state-machines.md`
- `docs/04-api-contracts.md`
- `docs/ADR/ADR-004-idempotency-mutations.md`

## Status
- Owner: TBD
- Priority: P1
- ETA:
- Date created: 2026-02-07

## Done / Outcome
Date: 2026-02-07

- Added centralized idempotency layer:
  - `src/models/IdempotencyRecord.ts` (unique `(userId, route, key)` + TTL)
  - `src/lib/idempotency/key.ts`
  - `src/lib/idempotency/store.ts`
  - `src/lib/idempotency/withIdempotency.ts`
- Applied `withIdempotency` to critical mutation routes:
  - `/api/match/like|respond|accept|reject|confirm`
  - `/api/activities/[id]/accept|cancel|checkin|complete`
  - `/api/answers/bulk`
  - `/api/pairs/[id]/questionnaires/[qid]/start|answer`
- Added client support in `fetchEnvelope(..., { idempotency: true })` to attach `Idempotency-Key` for POST/PATCH.

Acceptance criteria status:
- PASS: same `Idempotency-Key` + same payload replays the original envelope.
- PASS: same key with different payload returns `409 IDEMPOTENCY_KEY_REUSE_CONFLICT`.
- PASS: missing/invalid key returns `422` (`IDEMPOTENCY_KEY_REQUIRED` / `IDEMPOTENCY_KEY_INVALID`).
- PARTIAL: integration tests for idempotency are still pending.

Date: 2026-02-08

- Extended idempotency coverage:
  - `/api/users` POST
  - `/api/pairs/create` POST
  - `/api/users/me/onboarding` PATCH
  - `/api/logs` POST (enabled as optional hardening, now covered)
  - `/api/pairs/[id]/pause` POST
  - `/api/pairs/[id]/resume` POST
- Updated client onboarding and activity entry flows to send idempotency keys where now required:
  - `src/components/OnboardingWizard.tsx`
  - `src/app/page.tsx`

Explicit non-idempotent endpoints (by design):
- `/api/exchange-code` POST: OAuth exchange is already externally bounded and now rate-limited; replay token response is not stored in idempotency layer intentionally.
- `/api/pairs/[id]/suggest` POST, `/api/pairs/[id]/activities/suggest` POST: endpoint semantics intentionally generate new sampled suggestions.
- `/api/activities/next` POST, `/api/pairs/[id]/activities/from-template` POST: left without mandatory Idempotency-Key to keep current UX contract; protected by auth + validation, and documented as follow-up for stricter duplicate-prevention policy if product decides to enforce.
- `PUT/PATCH` profile endpoints (`/api/users/me`, `/api/users/[id]`, `/api/users/[id]/onboarding`) use deterministic set/update semantics and remain naturally idempotent without mandatory Idempotency-Key header.

## Prevention rule
- `docs/engineering/checklists/idempotency-checklist.md`
- `docs/engineering/checklists/state-machine-checklist.md`

## Evidence (post-fix)
- `src/lib/idempotency/withIdempotency.ts`
- `src/lib/idempotency/store.ts`
- `src/models/IdempotencyRecord.ts`
- `src/app/api/match/respond/route.ts`
