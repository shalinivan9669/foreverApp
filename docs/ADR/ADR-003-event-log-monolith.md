**ADR-003: Event Log Inside Monolith**

**Как Сейчас (Обзор)**
1. Есть модель `Log` с полями `userId` и `at`. Доказательства: `src/models/Log.ts:4-13`.
2. `/api/logs` пишет событие в коллекцию `Log`. Доказательства: `src/app/api/logs/route.ts:6-11`.

**Evidence**
| Факт | Тип | Источник (path:line) | Цитата (?2 строки) |
|---|---|---|---|
| Log model | model | `src/models/Log.ts:4-13` | `export interface LogType {`<br>`  userId: string;` |
| /api/logs creates Log | api | `src/app/api/logs/route.ts:6-11` | `const entry = await Log.create({ userId, at: new Date() });` |

**Decision**
- События и аудит остаются внутри монолита в Mongo (коллекция `Log`/`Event`).

**Consequences**
- Единый формат событий задаётся на уровне приложения.
- Наблюдаемость не требует внешнего брокера на старте.

## Update 2026-02-08

- Decision implemented in runtime:
  - `src/models/EventLog.ts` (single audit/event collection in monolith Mongo)
  - `src/lib/audit/emitEvent.ts` (single emission API)
  - `src/lib/audit/eventTypes.ts` (event name + retention typing)
- Legacy lightweight `Log` model is superseded by `EventLog` for auditable analytics/security events.
