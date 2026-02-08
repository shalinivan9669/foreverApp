# PROB-010: Legacy `RelationshipActivity` Still Present

## Problem
Legacy сущность `RelationshipActivity` остается в кодовой базе и доменной карте параллельно `PairActivity`.

## Evidence
- Модель присутствует: `src/models/RelationshipActivity.ts`.
- Доменный документ фиксирует legacy-сущность: `docs/02-domain-model.md`.
- ADR уже принял решение о депрекации в пользу `PairActivity`: `docs/ADR/ADR-007-relationship-activity-legacy.md`.

## Impact
- Дублирование доменной терминологии и повышенный cognitive load.
- Риск возврата к legacy-пути в новых фичах.
- Сложнее стабилизировать единую state machine активностей пары.

## Target state
- `PairActivity` — единственная активная модель парной активности.
- `RelationshipActivity` удалена из runtime-кода после миграции/архива.
- Доки и API не содержат активных ссылок на legacy-сущность.

## Plan
- Итерация 1:
  - Зафиксировать запрет новых usage `RelationshipActivity` (lint/PR checklist).
- Итерация 2:
  - Подготовить миграцию legacy данных в `PairActivity`: `TODO(path): scripts/migrations/*`.
- Итерация 3:
  - Удалить модель `RelationshipActivity` из runtime.
  - Обновить `docs/02-domain-model.md` и ADR-007 (статус completed).

## Acceptance criteria
- В `src/` нет импорта `RelationshipActivity`, кроме миграционных скриптов (если временно нужны).
- Новые активности создаются только через `ActivityTemplate + PairActivity`.
- Доменная документация не описывает legacy как активный путь.

## Links
- `docs/02-domain-model.md`
- `docs/03-state-machines.md`
- `docs/ADR/ADR-002-activity-template-pair-activity.md`
- `docs/ADR/ADR-007-relationship-activity-legacy.md`

## Status
- Owner: TBD
- Priority: P2
- ETA:
- Date created: 2026-02-07

## Done / Outcome
Date: 2026-02-08

- Runtime canonical path kept on `PairActivity + ActivityTemplate`:
  - new/offered activities are generated only through `activityOfferService`.
- Removed legacy suggestion creation branch from match confirm flow:
  - `src/domain/services/match.service.ts` now delegates seeding to `activityOfferService`.
- Introduced legacy read-only compatibility layer:
  - `src/domain/services/relationshipActivityLegacy.service.ts`
  - merged in `GET /api/pairs/[id]/activities` as DTO-compatible `legacy: true` entries.
- Added audit visibility for legacy reads:
  - `LEGACY_RELATIONSHIP_ACTIVITY_VIEWED`.
- No runtime mutation endpoint writes to `RelationshipActivity`.

PASS/FAIL:
- PASS: runtime creation/suggestion flows do not create `RelationshipActivity`.
- PASS: legacy records (if present) are mapped to pair activity DTO shape (view-only, `legacy: true`).
- PASS: legacy usage has dedicated audit event for controlled deprecation tracking.
- TODO: optional one-time migration script to materialize legacy records into `PairActivity` and retire collection.
