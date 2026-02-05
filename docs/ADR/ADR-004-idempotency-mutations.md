**ADR-004: Idempotency For Mutations**

**Как Сейчас (Обзор)**
1. Мутации статусов выполняются прямыми update/save без идемпотентного ключа (пример: accept/cancel/checkin/complete). Доказательства: `src/app/api/activities/[id]/accept/route.ts:11-18`, `src/app/api/activities/[id]/cancel/route.ts:11-13`, `src/app/api/activities/[id]/checkin/route.ts:17-26`, `src/app/api/activities/[id]/complete/route.ts:19-37`.
2. Мутации match используют body-параметры и изменяют документ без явного идемпотентного контроля. Доказательства: `src/app/api/match/respond/route.ts:71-91`, `src/app/api/match/accept/route.ts:18-30`.

**Evidence**
| Факт | Тип | Источник (path:line) | Цитата (?2 строки) |
|---|---|---|---|
| Accept меняет статус | api | `src/app/api/activities/[id]/accept/route.ts:14-17` | `doc.status = 'accepted';`<br>`await doc.save();` |
| Complete меняет статус и возвращает ok | api | `src/app/api/activities/[id]/complete/route.ts:22-37` | `act.status = status;`<br>`return NextResponse.json({ ok:true, success: clamp(sc), status });` |
| Match respond делает findOneAndUpdate | api | `src/app/api/match/respond/route.ts:71-87` | `const updated = await Like.findOneAndUpdate(` |

**Decision**
- Добавить идемпотентность мутаций через `Idempotency-Key` или `clientMutationId`.

**Consequences**
- Потребуется таблица/коллекция идемпотентности и единый middleware для мутаций.
- Клиент сможет безопасно повторять запросы при сетевых ошибках.
