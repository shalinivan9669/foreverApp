**ADR-007: Deprecate RelationshipActivity In Favor Of PairActivity**

**Как Сейчас (Обзор)**
1. В коде есть `RelationshipActivity` как отдельная сущность. Доказательства: `src/models/RelationshipActivity.ts:9-35`.
2. Параллельно существует `PairActivity` как основная активность пары. Доказательства: `src/models/PairActivity.ts:11-63`.

**Evidence**
| Факт | Тип | Источник (path:line) | Цитата (?2 строки) |
|---|---|---|---|
| RelationshipActivity schema | model | `src/models/RelationshipActivity.ts:9-16` | `export interface RelationshipActivityType {`<br>`  userId: Types.ObjectId;` |
| PairActivity schema | model | `src/models/PairActivity.ts:11-20` | `export interface PairActivityType {`<br>`  pairId: Types.ObjectId;` |

**Decision**
- `RelationshipActivity` помечается как legacy, новые фичи строятся только на `PairActivity`.

**Consequences**
- Нужен миграционный план: перенести данные и закладку API под `PairActivity`.
- Уменьшится дублирование бизнес-логики активностей.
