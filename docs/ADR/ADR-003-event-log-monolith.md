**ADR-003: Event Log Inside Monolith**

**Как Сейчас (Обзор)**
1. Есть каноническая модель `EventLog` с event envelope и TTL (`expiresAt`). Доказательства: `src/models/EventLog.ts`.
2. `/api/logs` пишет событие через единый runtime `emitEvent` (через `logsService.recordVisit`). Доказательства: `src/app/api/logs/route.ts`, `src/domain/services/logs.service.ts`.

**Evidence**
| Факт | Тип | Источник (path:line) | Цитата (?2 строки) |
|---|---|---|---|
| EventLog model | model | `src/models/EventLog.ts` | `export interface EventLogType {`<br>`  event: AuditEventName;` |
| /api/logs emits unified event | api | `src/domain/services/logs.service.ts` | `event: 'LOG_VISIT_RECORDED',` |

**Decision**
- События и аудит остаются внутри монолита в Mongo (коллекция `event_logs` через `EventLog`).

**Consequences**
- Единый формат событий задаётся на уровне приложения.
- Наблюдаемость не требует внешнего брокера на старте.

## Update 2026-02-08

- Decision implemented in runtime:
  - `src/models/EventLog.ts` (single audit/event collection in monolith Mongo)
  - `src/lib/audit/emitEvent.ts` (single emission API)
  - `src/lib/audit/eventTypes.ts` (event name + retention typing)
- Legacy lightweight `Log` model is superseded by `EventLog` for auditable analytics/security events.
