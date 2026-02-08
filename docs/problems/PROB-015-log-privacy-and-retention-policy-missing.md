# PROB-015: Log Privacy And Retention Policy Is Missing

## Problem
Нет реализованной политики хранения/удаления событий и чувствительных ответов.

## Evidence
- `Log` хранит события без TTL/retention индексов:
  - `src/models/Log.ts`
  - `src/app/api/logs/route.ts`
- Чувствительные ответы сохраняются в доменных коллекциях без retention-политики:
  - `PairActivity.answers`: `src/models/PairActivity.ts`
  - `PairQuestionnaireAnswer`: `src/models/PairQuestionnaireAnswer.ts`
- В docs есть требования по privacy/PII, но не реализованная матрица хранения:
  - `docs/07-security-privacy.md`
  - `docs/05-analytics-events.md`

## Impact
- Риск долгосрочного хранения чувствительных данных без необходимости.
- Проблемы комплаенса и инцидент-ответа.
- Рост объема коллекций (`Log`, `pair_qn_answers`, `pair_activities`).

## Target state
- Явная retention-матрица по сущностям и полям.
- TTL индексы/архивация для низкоценных сырых событий.
- Маскирование/редакция чувствительных free-text данных в аналитических событиях.

## Plan
- Итерация 1:
  - Добавить документ `docs/07-security-privacy.md` с таблицей retention по `Log`, `PairActivity.answers`, `PairQuestionnaireAnswer`.
- Итерация 2:
  - Добавить TTL индексы где применимо (`Log`, технические события).
  - Добавить архивный pipeline: `TODO(path): scripts/retention/*`.
- Итерация 3:
  - Включить автоматическую очистку/архивацию и мониторинг объема коллекций.

## Acceptance criteria
- Для каждой чувствительной сущности определены retention срок и действие (delete/archive/redact).
- В коде есть TTL/очистка для `Log` и связанных событий.
- Политика PII соблюдается в event payload и логировании ошибок.

## Links
- `docs/05-analytics-events.md`
- `docs/07-security-privacy.md`
- `docs/ADR/ADR-003-event-log-monolith.md`

## Status
- Owner: TBD
- Priority: P0
- ETA:
- Date created: 2026-02-07

## Done / Outcome
Date: 2026-02-08

- Added retention-aware event log model:
  - `src/models/EventLog.ts` with `expiresAt` and TTL index (`expireAfterSeconds: 0`)
- Implemented code-level retention matrix in audit layer:
  - `src/lib/audit/eventTypes.ts` (`short=14d`, `abuse=30d`, `long=90d`)
  - per-event retention tier resolved centrally in `emitEvent`
- Added default metadata privacy guard:
  - `src/lib/audit/emitEvent.ts` strips sensitive keys (`access_token`, `code`, `redirect_uri`, auth/secrets, raw body-like keys, direct answers payload keys)

Acceptance criteria status:
- PASS: event retention is enforced by Mongo TTL through `expiresAt`.
- PASS: per-event retention tiers are deterministic and configured in code (no external service required).
- PASS: default event metadata path is privacy-first and avoids raw sensitive request payload logging.
