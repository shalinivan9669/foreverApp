# PROB-012: Analytics Events Are Not Unified Or Auditable

## Problem
Единого event-пайплайна нет: в коде есть точечный `Log`, но продуктовые события из docs не эмитятся системно.

## Evidence
- Реализация сейчас:
  - `src/models/Log.ts` (только `userId`, `at`)
  - `src/app/api/logs/route.ts`
  - клиентский fire-and-forget лог визита в `src/app/page.tsx`.
- В `docs/05-analytics-events.md` перечислены целевые события (`match_like_*`, `pair_*`, `questionnaire_*`), но они не реализованы как единый runtime-слой.
- ADR-003 фиксирует хранение log/event в монолите, но не задает реализованный единый формат event envelope.

## Impact
- Нет надежной сквозной аналитики funnel/retention по ключевым сценариям.
- Слабая аудитируемость действий (кто/когда/что сделал) без `requestId`, `entityType`, `entityId`.
- Разные команды будут добавлять события вразнобой.

## Target state
- Единый `emitEvent()` с обязательным envelope:
  - `eventId`, `eventName`, `timestamp`, `requestId`, `userId?`, `pairId?`, `entityType?`, `entityId?`.
- События эмитятся из доменных use-case, не из UI-кнопок напрямую.
- `Log`/`Event` схема расширена под аудит и аналитические запросы.

## Plan
- Итерация 1:
  - Добавить `src/lib/analytics/emit.ts` и `src/models/Event.ts`.
- Итерация 2:
  - Инструментировать критичные use-cases: match, pair lifecycle, activity lifecycle, questionnaire lifecycle.
- Итерация 3:
  - Обновить `docs/05-analytics-events.md` и `docs/07-security-privacy.md` (PII правила событий).

## Acceptance criteria
- Для каждого события из P0 списка есть runtime emission в соответствующем use-case.
- В событиях присутствуют `eventName`, `timestamp`, `requestId`.
- События не пишут запрещенные PII/free-text поля из ответов.

## Links
- `docs/05-analytics-events.md`
- `docs/07-security-privacy.md`
- `docs/ADR/ADR-003-event-log-monolith.md`

## Status
- Owner: TBD
- Priority: P1
- ETA:
- Date created: 2026-02-07

## Done / Outcome

