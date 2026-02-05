**ADR-002: ActivityTemplate + PairActivity As Single Activity System**

**Как Сейчас (Обзор)**
1. В коде есть модель `ActivityTemplate` (шаблоны активностей). Доказательства: `src/models/ActivityTemplate.ts:29-59`.
2. В коде есть модель `PairActivity` с полями инстанса активности, статусами и check-ins. Доказательства: `src/models/PairActivity.ts:11-55,47-54`.
3. Отдельно существует `RelationshipActivity`, не совпадающая по формату. Доказательства: `src/models/RelationshipActivity.ts:9-35`.

**Evidence**
| Факт | Тип | Источник (path:line) | Цитата (?2 строки) |
|---|---|---|---|
| ActivityTemplate interface | model | `src/models/ActivityTemplate.ts:29-35` | `export interface ActivityTemplateType {`<br>`  _id: string;` |
| PairActivity interface | model | `src/models/PairActivity.ts:11-20` | `export interface PairActivityType {`<br>`  pairId: Types.ObjectId;` |
| RelationshipActivity interface | model | `src/models/RelationshipActivity.ts:9-16` | `export interface RelationshipActivityType {`<br>`  userId: Types.ObjectId;` |

**Decision**
- Единая система активностей: `ActivityTemplate` (шаблон) + `PairActivity` (инстанс).
- `RelationshipActivity` фиксируем как legacy и планируем миграцию в `PairActivity`.

**Consequences**
- Новые активности создаются только через `ActivityTemplate` + `PairActivity`.
- Потребуется миграционный шаг и маппинг legacy данных.
