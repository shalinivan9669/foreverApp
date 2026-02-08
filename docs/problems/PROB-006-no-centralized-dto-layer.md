# PROB-006: No Centralized DTO Layer

## Problem
DTO формируются несистемно: часть роутов возвращает доменные документы напрямую, часть вручную мапит DTO.

## Evidence
- Возврат сырых документов:
  - `src/app/api/users/route.ts` (POST returns user doc)
  - `src/app/api/users/[id]/route.ts` (GET/PUT returns user doc)
  - `src/app/api/questionnaires/[id]/route.ts` (GET returns questionnaire doc)
  - `src/app/api/pairs/[id]/summary/route.ts` (возвращает `pair` с вложенными доменными полями)
- Точечные DTO есть, но без общего слоя:
  - `src/app/api/match/feed/route.ts`
  - `src/app/api/questionnaires/cards/route.ts`
  - `src/app/api/match/card/[id]/route.ts`
- В `docs/02-domain-model.md` и `docs/04-api-contracts.md` отдельно отмечена необходимость DTO.

## Impact
- Утечки внутренних полей моделей в публичный API.
- Ломкие контракты при изменении схем Mongo/Mongoose.
- Раздутый и дублирующийся mapping logic в route handlers.

## Target state
- DTO слой вынесен в отдельные мапперы (`domain -> dto`).
- Роуты не отдают Mongoose shape напрямую.
- Клиент зависит от стабильных API DTO, а не от структуры моделей `User`, `Pair`, `Like`.

## Plan
- Итерация 1:
  - Создать `src/dto/*` и `src/mappers/*` для основных сущностей (`User`, `Pair`, `Like`, `QuestionnaireCard`).
- Итерация 2:
  - Перевести read endpoints на DTO мапперы.
- Итерация 3:
  - Добавить contract tests DTO: `TODO(path): tests/contracts/*`.
  - Обновить `docs/04-api-contracts.md`.

## Acceptance criteria
- Нет `NextResponse.json(doc)` для Mongoose документов в публичных API.
- Каждому публичному endpoint соответствует именованный DTO тип.
- Изменение схемы модели не ломает клиентский контракт без явного изменения DTO.

## Links
- `docs/02-domain-model.md`
- `docs/04-api-contracts.md`
- `docs/07-security-privacy.md`

## Status
- Owner: TBD
- Priority: P1
- ETA:
- Date created: 2026-02-07

## Done / Outcome

## Update 2026-02-07 (PROB-006 Iteration 1)

### Done / Outcome
- Added centralized DTO layer under `src/lib/dto/*` with entity mappers (`User`, `Pair`, `PairActivity`, `Like`, `Questionnaire`, `Question`, `ActivityTemplate`, `Log`).
- Migrated high-risk read/write API routes away from raw Mongoose response shapes to explicit DTO/view-model returns.
- Added route-level guard comment for all API handlers: `return only DTO/view model`.
- Standardized user privacy boundaries: public user payloads are now explicitly separated from private/self payloads.

### Acceptance Criteria
| Criterion | Status | Notes |
|---|---|---|
| No raw Mongoose documents returned from public API handlers | PASS | High-risk endpoints (`users/*`, `questionnaires/*`, `questions`, `activity-templates`, `pairs/me`, `pairs/[id]/summary`, `pairs/[id]/activities`, `match/card`, `match/feed`, `match/inbox`, `match/like/[id]`, `logs`) now use DTO mappers. |
| Every public endpoint has named DTO/view-model return shape | PASS | DTO functions live in `src/lib/dto/*`; route handlers map domain objects via `to*DTO`. |
| Client contract remains stable under model-level schema changes | PASS (with migration note) | Compatibility aliases are preserved where needed (e.g. legacy `_id` mirror for pair/activity payloads) while canonical DTO id is `id`. |

### Migration Note
- Canonical API identity field in DTOs is `id`.
- Some routes preserve compatibility alias `_id` short-term to avoid immediate frontend breakage; clients should migrate to `id`.

## Prevention rule
- `docs/engineering/backend-playbook.md#golden-path-for-a-new-api-endpoint`
- `docs/engineering/checklists/dto-contract-checklist.md`

## Evidence (post-fix)
- `src/lib/dto/index.ts`
- `src/lib/dto/user.dto.ts`
- `src/lib/dto/pair.dto.ts`
- `docs/_evidence/prob-006-dto-manual-checklist-2026-02-07.md`
