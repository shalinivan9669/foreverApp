**Как Сейчас (Обзор)**
1. В репозитории определена модель `Log` с полями `userId` и `at`. Доказательства: `src/models/Log.ts:4-13`.
2. `/api/logs` создаёт запись `Log` и возвращает сохранённый документ. Доказательства: `src/app/api/logs/route.ts:6-11`.
3. Клиент вызывает `/api/logs` при переходе в основное меню (visit log). Доказательства: `src/app/page.tsx:70-75`.

**Evidence**
| Факт | Тип | Источник (path:line) | Цитата (?2 строки) |
|---|---|---|---|
| Модель Log: userId, at | model | `src/models/Log.ts:4-13` | `export interface LogType {`<br>`  userId: string;` |
| /api/logs пишет Log | api | `src/app/api/logs/route.ts:6-11` | `const entry = await Log.create({ userId, at: new Date() });` |
| Вызов /api/logs на клиенте | ui | `src/app/page.tsx:70-75` | `fetch('/.proxy/api/logs', {`<br>`  body: JSON.stringify({ userId: user.id }),` |

**Куда Идём (Целевые MVP События)**
- `user_auth_completed` (после обмена code -> access_token).
- `user_profile_upserted` (POST `/api/users`).
- `onboarding_completed` (PATCH `/api/users/[id]/onboarding`).
- `match_card_updated` (POST `/api/match/card`).
- `match_like_sent`, `match_like_responded`, `match_like_accepted`, `match_like_rejected`, `match_pair_confirmed`.
- `pair_created`, `pair_paused`, `pair_resumed`.
- `pair_activity_offered`, `pair_activity_accepted`, `pair_activity_checkin`, `pair_activity_completed`, `pair_activity_cancelled`.
- `questionnaire_started`, `questionnaire_answered`, `questionnaire_completed`.

**Обязательные Свойства Событий (Целевой Формат)**
- `eventId` (UUID), `eventName`, `timestamp`.
- `userId` (если релевантно), `pairId` (если релевантно).
- `requestId` (корреляция), `source` (web/discord/tg).
- `entityId` (activityId, likeId, sessionId) и `entityType`.

**Что Используем Для Продукт-Аналитики**
- Воронки: `user_auth_completed -> user_profile_upserted -> onboarding_completed`.
- Ретеншн: количество `pair_activity_completed` и повторные `questionnaire_started`.
- Сигналы качества: распределение `pair_activity_completed` по статусам (success/partial/failed).

**Что Используем Для Audit/Security**
- `user_profile_upserted`, `match_like_*`, `pair_*`, `questionnaire_*`.
- Связка `requestId` + `entityId` для разбора инцидентов.

**PII/Интимные Данные (Запреты)**
- Не логировать текстовые ответы, `answers[]`, `checkIns` и любые чувствительные free-text поля.
- Не логировать access_token или OAuth коды.
