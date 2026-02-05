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
