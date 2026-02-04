**Как Сейчас (Обзор)**
1. Все API реализованы через App Router `route.ts` и возвращают `NextResponse.json(...)`. Доказательства: `src/app/api/activities/next/route.ts:36,136-139`, `src/app/api/match/feed/route.ts:28,82`, `src/app/api/users/[id]/route.ts:9-14`.
2. Входы используют комбинацию `ctx.params` (path), `searchParams` (query) и JSON тела запросов. Доказательства: `src/app/api/pairs/[id]/summary/route.ts:11-13`, `src/app/api/match/feed/route.ts:28-31`, `src/app/api/answers/bulk/route.ts:31-34`.
3. Формат ответов не унифицирован: встречаются `{ ok: true }`, `{ error: '...' }`, массивы документов и объектные DTO. Доказательства: `src/app/api/activities/[id]/accept/route.ts:14-18`, `src/app/api/match/like/route.ts:73`, `src/app/api/match/feed/route.ts:82`, `src/app/api/match/like/[id]/route.ts:63-99`.
4. Клиентский `api()` добавляет префикс `/.proxy` в браузере для вызова серверных маршрутов. Доказательства: `src/utils/api.ts:1-3`.

**Инвентаризация /api (Как Сейчас)**

**Activities**
| Route | Method | Input (path/query/body) | Output | Auth/Access (observed) |
|---|---|---|---|---|
| `/api/activities/next` | POST | body: `userId` (`src/app/api/activities/next/route.ts:36-39`) | `{ ok: true, activityId }` (`src/app/api/activities/next/route.ts:136-139`) | userId in body (`src/app/api/activities/next/route.ts:37`) |
| `/api/activities/[id]/accept` | POST | path: `id` (`src/app/api/activities/[id]/accept/route.ts:8`) | `{ ok: true }` (`src/app/api/activities/[id]/accept/route.ts:17`) | path param only (`src/app/api/activities/[id]/accept/route.ts:8`) |
| `/api/activities/[id]/cancel` | POST | path: `id` (`src/app/api/activities/[id]/cancel/route.ts:8`) | `{ ok: true }` (`src/app/api/activities/[id]/cancel/route.ts:13`) | path param only (`src/app/api/activities/[id]/cancel/route.ts:8`) |
| `/api/activities/[id]/checkin` | POST | path: `id` (`src/app/api/activities/[id]/checkin/route.ts:9`); body: `{ by, answers[] }` (`src/app/api/activities/[id]/checkin/route.ts:10-11`) | `{ ok: true, success }` (`src/app/api/activities/[id]/checkin/route.ts:26`) | `by` in body (`src/app/api/activities/[id]/checkin/route.ts:10`) |
| `/api/activities/[id]/complete` | POST | path: `id` (`src/app/api/activities/[id]/complete/route.ts:10`) | `{ ok: true, success, status }` (`src/app/api/activities/[id]/complete/route.ts:37`) | path param only (`src/app/api/activities/[id]/complete/route.ts:10`) |
| `/api/activity-templates` | GET | query: `axis`, `intent`, `difficulty`, `limit` (`src/app/api/activity-templates/route.ts:9-13`) | list[] (`src/app/api/activity-templates/route.ts:20-21`) | query-only params (`src/app/api/activity-templates/route.ts:9-13`) |

**Match**
| Route | Method | Input (path/query/body) | Output | Auth/Access (observed) |
|---|---|---|---|---|
| `/api/match/feed` | GET | query: `userId` (`src/app/api/match/feed/route.ts:28-31`) | list[] of `{ id, username, avatar, score }` (`src/app/api/match/feed/route.ts:68-82`) | userId in query (`src/app/api/match/feed/route.ts:29-31`) |
| `/api/match/inbox` | GET | query: `userId` (`src/app/api/match/inbox/route.ts:31-35`) | list[] of `{ id, direction, status, peer, canCreatePair }` (`src/app/api/match/inbox/route.ts:65-90`) | userId in query (`src/app/api/match/inbox/route.ts:32-35`) |
| `/api/match/like` | POST | body: `{ userId/fromId, toId, agreements[], answers[] }` (`src/app/api/match/like/route.ts:9-53`) | `{ id, matchScore }` (`src/app/api/match/like/route.ts:73`) | fromId/userId in body (`src/app/api/match/like/route.ts:41-46`) |
| `/api/match/like/[id]` | GET | path: `id` from URL (`src/app/api/match/like/[id]/route.ts:46-48`) | DTO with `from/to`, status, decisions (`src/app/api/match/like/[id]/route.ts:63-99`) | path param only (`src/app/api/match/like/[id]/route.ts:46-48`) |
| `/api/match/respond` | POST | body: `{ userId, likeId, agreements[], answers[] }` (`src/app/api/match/respond/route.ts:41-53`) | `{ ok: true, status }` (`src/app/api/match/respond/route.ts:90-91`) | userId in body, checks like.toId (`src/app/api/match/respond/route.ts:45-61`) |
| `/api/match/accept` | POST | body: `{ likeId, userId }` (`src/app/api/match/accept/route.ts:5-9`) | `{ ok: true }` (`src/app/api/match/accept/route.ts:30`) | userId in body, checks like.fromId (`src/app/api/match/accept/route.ts:14`) |
| `/api/match/reject` | POST | body: `{ likeId, userId }` (`src/app/api/match/reject/route.ts:5-9`) | `{ ok: true }` (`src/app/api/match/reject/route.ts:25`) | userId in body, checks like.toId (`src/app/api/match/reject/route.ts:15`) |
| `/api/match/confirm` | POST | body: `{ likeId, userId }` (`src/app/api/match/confirm/route.ts:96-101`) | `{ ok: true, pairId, members }` (`src/app/api/match/confirm/route.ts:158`) | userId in body, checks like.fromId (`src/app/api/match/confirm/route.ts:107-110`) |
| `/api/match/card` | GET | query: `userId` (`src/app/api/match/card/route.ts:56-61`) | matchCard or null (`src/app/api/match/card/route.ts:63-64`) | userId in query (`src/app/api/match/card/route.ts:58-61`) |
| `/api/match/card` | POST | body: `{ userId, requirements[3], give[3], questions[2], isActive? }` (`src/app/api/match/card/route.ts:5-43`) | matchCard (`src/app/api/match/card/route.ts:53`) | userId in body (`src/app/api/match/card/route.ts:20-23`) |
| `/api/match/card/[id]` | GET | path: `id` (`src/app/api/match/card/[id]/route.ts:11-14`) | `{ requirements, questions }` (`src/app/api/match/card/[id]/route.ts:34-44`) | path param only (`src/app/api/match/card/[id]/route.ts:11-14`) |

**Pairs**
| Route | Method | Input (path/query/body) | Output | Auth/Access (observed) |
|---|---|---|---|---|
| `/api/pairs/create` | POST | body: `{ userId, partnerId, likeId? }` (`src/app/api/pairs/create/route.ts:40-58`) | `{ ok: true, pairId }` (`src/app/api/pairs/create/route.ts:81`) | userId/partnerId in body (`src/app/api/pairs/create/route.ts:41-58`) |
| `/api/pairs/me` | GET | query: `userId` (`src/app/api/pairs/me/route.ts:6-8`) | `{ pair, hasActive, hasAny, status }` (`src/app/api/pairs/me/route.ts:30-35`) | userId in query (`src/app/api/pairs/me/route.ts:6-8`) |
| `/api/pairs/status` | GET | query: `userId` (`src/app/api/pairs/status/route.ts:7-9`) | `{ hasActive, pairKey, peer }` or `{ hasActive: false }` (`src/app/api/pairs/status/route.ts:18-29`) | userId in query (`src/app/api/pairs/status/route.ts:7-9`) |
| `/api/pairs/[id]/summary` | GET | path: `id` (`src/app/api/pairs/[id]/summary/route.ts:11-13`) | `{ pair, currentActivity, suggestedCount, lastLike }` (`src/app/api/pairs/[id]/summary/route.ts:42-58`) | path param only (`src/app/api/pairs/[id]/summary/route.ts:11-13`) |
| `/api/pairs/[id]/pause` | POST | path: `id` (`src/app/api/pairs/[id]/pause/route.ts:8-12`) | `{ ok: true }` (`src/app/api/pairs/[id]/pause/route.ts:13`) | path param only (`src/app/api/pairs/[id]/pause/route.ts:8-12`) |
| `/api/pairs/[id]/resume` | POST | path: `id` (`src/app/api/pairs/[id]/resume/route.ts:8-12`) | `{ ok: true }` (`src/app/api/pairs/[id]/resume/route.ts:13`) | path param only (`src/app/api/pairs/[id]/resume/route.ts:8-12`) |
| `/api/pairs/[id]/activities` | GET | path: `id` + query `s` (`src/app/api/pairs/[id]/activities/route.ts:43-47`) | list[] (`src/app/api/pairs/[id]/activities/route.ts:51-57`) | path param only (`src/app/api/pairs/[id]/activities/route.ts:43-47`) |
| `/api/pairs/[id]/activities/suggest` | POST | path: `id` (`src/app/api/pairs/[id]/activities/suggest/route.ts:11-13`) | list[] of `{ id, title, difficulty }` (`src/app/api/pairs/[id]/activities/suggest/route.ts:61`) | path param only (`src/app/api/pairs/[id]/activities/suggest/route.ts:11-13`) |
| `/api/pairs/[id]/activities/from-template` | POST | path: `id`; body: `{ templateId }` (`src/app/api/pairs/[id]/activities/from-template/route.ts:12-15`) | `{ ok: true, id }` (`src/app/api/pairs/[id]/activities/from-template/route.ts:58`) | path param only (`src/app/api/pairs/[id]/activities/from-template/route.ts:12-15`) |
| `/api/pairs/[id]/suggest` | POST | path: `id` (`src/app/api/pairs/[id]/suggest/route.ts:11-13`) | list[] of `{ id, title, difficulty }` (`src/app/api/pairs/[id]/suggest/route.ts:71`) | path param only (`src/app/api/pairs/[id]/suggest/route.ts:11-13`) |
| `/api/pairs/[id]/diagnostics` | GET | path: `id` (`src/app/api/pairs/[id]/diagnostics/route.ts:43-45`) | `{ pairId, passport }` (`src/app/api/pairs/[id]/diagnostics/route.ts:66`) | path param only (`src/app/api/pairs/[id]/diagnostics/route.ts:43-45`) |
| `/api/pairs/[id]/questionnaires/[qid]/start` | POST | path: `id`, `qid` (`src/app/api/pairs/[id]/questionnaires/[qid]/start/route.ts:11-13`) | `{ sessionId, status, startedAt }` (`src/app/api/pairs/[id]/questionnaires/[qid]/start/route.ts:36-37,47`) | path params only (`src/app/api/pairs/[id]/questionnaires/[qid]/start/route.ts:11-13`) |
| `/api/pairs/[id]/questionnaires/[qid]/answer` | POST | path: `id`, `qid`; body: `{ sessionId?, questionId, ui, by }` (`src/app/api/pairs/[id]/questionnaires/[qid]/answer/route.ts:18-24`) | `{ ok: true }` (`src/app/api/pairs/[id]/questionnaires/[qid]/answer/route.ts:49`) | path params only (`src/app/api/pairs/[id]/questionnaires/[qid]/answer/route.ts:18-24`) |

**Questionnaires & Questions**
| Route | Method | Input (path/query/body) | Output | Auth/Access (observed) |
|---|---|---|---|---|
| `/api/questions` | GET | query: `axis`, `limit` (`src/app/api/questions/route.ts:7-12`) | list[] of questions (`src/app/api/questions/route.ts:29-30`) | query-only params (`src/app/api/questions/route.ts:7-12`) |
| `/api/questionnaires` | GET | query: `target` (`src/app/api/questionnaires/route.ts:6-12`) | list[] (`src/app/api/questionnaires/route.ts:14-15`) | query-only params (`src/app/api/questionnaires/route.ts:6-12`) |
| `/api/questionnaires/[id]` | POST | body: `{ userId, answers[] }` (`src/app/api/questionnaires/[id]/route.ts:39-42`) | `{ ok: true }` (`src/app/api/questionnaires/[id]/route.ts:115`) | userId in body (`src/app/api/questionnaires/[id]/route.ts:40-42`) |
| `/api/answers/bulk` | POST | body: `{ userId, answers[] }` (`src/app/api/answers/bulk/route.ts:31-34`) | `{ ok: true }` (`src/app/api/answers/bulk/route.ts:102-103`) | userId in body (`src/app/api/answers/bulk/route.ts:32-34`) |

**Users & System**
| Route | Method | Input (path/query/body) | Output | Auth/Access (observed) |
|---|---|---|---|---|
| `/api/users` | POST | body: user profile fields (`src/app/api/users/route.ts:6-18`) | user document (`src/app/api/users/route.ts:20-33`) | `id` in body (`src/app/api/users/route.ts:7,21-25`) |
| `/api/users/[id]` | GET | path: `id` (`src/app/api/users/[id]/route.ts:9-12`) | user document or null (`src/app/api/users/[id]/route.ts:12-14`) | path param only (`src/app/api/users/[id]/route.ts:10-12`) |
| `/api/users/[id]` | PUT | path: `id`, body: partial user (`src/app/api/users/[id]/route.ts:17-26`) | user document or null (`src/app/api/users/[id]/route.ts:27-33`) | path param only (`src/app/api/users/[id]/route.ts:18-26`) |
| `/api/users/[id]/onboarding` | PATCH | path: `id`, body: onboarding map (`src/app/api/users/[id]/onboarding/route.ts:9-16`) | user document or null (`src/app/api/users/[id]/onboarding/route.ts:19-24`) | path param only (`src/app/api/users/[id]/onboarding/route.ts:10-16`) |
| `/api/users/me/profile-summary` | GET | query: `userId` (`src/app/api/users/me/profile-summary/route.ts:37-42`) | profile summary payload (`src/app/api/users/me/profile-summary/route.ts:117-157`) | userId in query (`src/app/api/users/me/profile-summary/route.ts:39-42`) |
| `/api/exchange-code` | POST | body: `{ code, redirect_uri }` (`src/app/api/exchange-code/route.ts:3-7`) | `{ access_token }` or OAuth error (`src/app/api/exchange-code/route.ts:23-27`) | OAuth code+redirect_uri (`src/app/api/exchange-code/route.ts:3-7`) |
| `/api/logs` | POST | body: `{ userId }` (`src/app/api/logs/route.ts:6-8`) | Log entry (`src/app/api/logs/route.ts:10-11`) | userId in body (`src/app/api/logs/route.ts:7`) |

**Бизнес-логика в роутерах (Как Сейчас)**
1. `/api/match/confirm` строит passport пары и создаёт предложения активностей внутри роутера. Доказательства: `src/app/api/match/confirm/route.ts:15-93,121-158`.
2. `/api/pairs/[id]/suggest` и `/api/pairs/[id]/activities/suggest` содержат правила выбора шаблонов по riskZones и fatigue. Доказательства: `src/app/api/pairs/[id]/suggest/route.ts:15-69`, `src/app/api/pairs/[id]/activities/suggest/route.ts:15-59`.
3. `/api/activities/next` выбирает шаблон по зоне риска и создаёт `PairActivity` с авто-дельтами. Доказательства: `src/app/api/activities/next/route.ts:54-133`.
4. `/api/questionnaires/[id]` и `/api/answers/bulk` считают оси и обновляют `vectors.*`. Доказательства: `src/app/api/questionnaires/[id]/route.ts:57-114`, `src/app/api/answers/bulk/route.ts:50-103`.
5. `/api/match/feed` рассчитывает distance/score по векторам и выдаёт топ кандидатов. Доказательства: `src/app/api/match/feed/route.ts:18-82`.
6. `/api/pairs/[id]/diagnostics` пересчитывает passport и пишет в `Pair`. Доказательства: `src/app/api/pairs/[id]/diagnostics/route.ts:13-66`.

**Evidence**
| Факт | Тип | Источник (path:line) | Цитата (?2 строки) |
|---|---|---|---|
| API возвращают `NextResponse.json` | api | `src/app/api/activities/next/route.ts:136-139` | `return NextResponse.json({`<br>`  ok: true,` |
| Ошибки оформлены как `{ error: '...' }` | api | `src/app/api/match/feed/route.ts:30-32` | `return NextResponse.json({ error: 'missing userId' }, { status: 400 });` |
| Эндпоинт отдаёт массив DTO | api | `src/app/api/match/feed/route.ts:68-82` | `const list: CandidateDTO[] = candidates.map((u) => {` |
| Эндпоинт отдаёт `{ ok: true }` | api | `src/app/api/activities/[id]/accept/route.ts:14-18` | `doc.status = 'accepted';`<br>`return NextResponse.json({ ok:true });` |
| Входы используют query params | api | `src/app/api/questionnaires/route.ts:8-12` | `const { searchParams } = new URL(req.url);` |
| Входы используют body JSON | api | `src/app/api/answers/bulk/route.ts:31-33` | `const { userId, answers } = (await req.json()) as Body;` |
| Клиентский `api()` добавляет `/.proxy` | util | `src/utils/api.ts:1-3` | `return (typeof window !== 'undefined' ? '/.proxy' : '') + path;` |

**Гипотезы/Риски/Куда Идём**
- Ввести единый response envelope (`{ ok, data, error }`) и унифицированные error codes (сейчас форматы ответа разнородные).
- Вынести валидацию входов в общий слой (zod) и добавить идемпотентность для мутаций (accept/cancel/checkin/complete, match/respond/confirm).
- Проверить наличие централизованного auth middleware/guard; при отсутствии — добавить минимальную проверку по сессии/токену.
