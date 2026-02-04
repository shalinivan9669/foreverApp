**ADR-001: MongoDB + Mongoose For MVP**

**Как Сейчас (Обзор)**
1. Подключение к БД делается через `mongoose.connect(MONGODB_URI)` в `src/lib/mongodb.ts`. Доказательства: `src/lib/mongodb.ts:4-19`.
2. Доменные модели определены через `mongoose.Schema` (пример: `User`). Доказательства: `src/models/User.ts:1-2,127-200`.

**Evidence**
| Факт | Тип | Источник (path:line) | Цитата (?2 строки) |
|---|---|---|---|
| Подключение через mongoose.connect | config | `src/lib/mongodb.ts:4-19` | `cachedPromise = mongoose`<br>`  .connect(MONGODB_URI!)` |
| Модели строятся на mongoose.Schema | model | `src/models/User.ts:1-2,127-130` | `import mongoose, { Schema, Types } from 'mongoose';` |

**Decision**
- Сохраняем MongoDB + Mongoose для MVP, чтобы не ломать текущую модель и сократить время внедрения.

**Consequences**
- Схемы остаются в Mongoose, миграции выполняются через инкрементальные изменения схем.
- Индексы и TTL управляются через `Schema.index(...)` в коде.
