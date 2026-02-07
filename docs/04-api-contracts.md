**API Standard (2026-02-07, PROB-005 + PROB-016)**

1. Unified response envelope for every `/api/*` handler:
   - Success: `{ ok: true, data: T, meta?: {...} }`
   - Error: `{ ok: false, error: { code: string, message: string, details?: ... } }`
2. HTTP status remains semantic and is not hidden by envelope:
   - `400`, `401`, `403`, `404`, `409`, `500` are preserved.
3. Shared response helpers:
   - `src/lib/api/response.ts`
   - `jsonOk<T>(data, meta?)`
   - `jsonError(status, code, message, details?)`
4. Shared validation layer (Zod):
   - `src/lib/api/validate.ts`
   - `parseJson(req, schema)`
   - `parseQuery(req, schema)`
   - `parseParams(params, schema)`
5. Validation failure contract:
   - HTTP `400`
   - `ok: false`
   - `error.code = 'VALIDATION_ERROR'`
   - structured `error.details.issues[]`
6. Route-level rule:
   - no raw `NextResponse.json(...)` in handlers;
   - input must be parsed via `parseJson/parseQuery/parseParams`.
**РљР°Рє РЎРµР№С‡Р°СЃ (РћР±Р·РѕСЂ)**
**Auth MVP (2026-02-07)**
1. Р’ РїСЂРѕРµРєС‚ РґРѕР±Р°РІР»РµРЅ РµРґРёРЅС‹Р№ session auth entrypoint:
   - `src/lib/auth/session.ts` (`readSessionUser`)
   - `src/lib/auth/guards.ts` (`requireSession`)
   - `src/lib/auth/errors.ts` (`jsonUnauthorized`, `jsonForbidden`)
2. РџСЂРёРІР°С‚РЅС‹Рµ API-СЂРѕСѓС‚С‹ РІ `activities/*`, `pairs/*`, `match/*`, `users/*`, `answers/bulk`, `questionnaires/cards`, `questionnaires/[id] POST`, `logs` С‚РµРїРµСЂСЊ С‚СЂРµР±СѓСЋС‚ РІР°Р»РёРґРЅСѓСЋ session cookie.
3. РџСЂРё РѕС‚СЃСѓС‚СЃС‚РІРёРё/РЅРµРІР°Р»РёРґРЅРѕСЃС‚Рё session РІРѕР·РІСЂР°С‰Р°РµС‚СЃСЏ `401` СЃ РєРѕРґРѕРј:
   - `AUTH_REQUIRED` (cookie РѕС‚СЃСѓС‚СЃС‚РІСѓРµС‚)
   - `AUTH_INVALID_SESSION` (Р±РёС‚Р°СЏ/РЅРµРІР°Р»РёРґРЅР°СЏ СЃРµСЃСЃРёСЏ)

**РљР°Рє РЎРµР№С‡Р°СЃ (РћР±Р·РѕСЂ)**
1. Р’СЃРµ API СЂРµР°Р»РёР·РѕРІР°РЅС‹ С‡РµСЂРµР· App Router `route.ts` Рё РІРѕР·РІСЂР°С‰Р°СЋС‚ `NextResponse.json(...)`. Р”РѕРєР°Р·Р°С‚РµР»СЊСЃС‚РІР°: `src/app/api/activities/next/route.ts:36,136-139`, `src/app/api/match/feed/route.ts:28,82`, `src/app/api/users/[id]/route.ts:9-14`.
2. Р’С…РѕРґС‹ РёСЃРїРѕР»СЊР·СѓСЋС‚ РєРѕРјР±РёРЅР°С†РёСЋ `ctx.params` (path), `searchParams` (query) Рё JSON С‚РµР»Р° Р·Р°РїСЂРѕСЃРѕРІ. Р”РѕРєР°Р·Р°С‚РµР»СЊСЃС‚РІР°: `src/app/api/pairs/[id]/summary/route.ts:11-13`, `src/app/api/match/feed/route.ts:28-31`, `src/app/api/answers/bulk/route.ts:31-34`.
3. Р¤РѕСЂРјР°С‚ РѕС‚РІРµС‚РѕРІ РЅРµ СѓРЅРёС„РёС†РёСЂРѕРІР°РЅ: РІСЃС‚СЂРµС‡Р°СЋС‚СЃСЏ `{ ok: true }`, `{ error: '...' }`, РјР°СЃСЃРёРІС‹ РґРѕРєСѓРјРµРЅС‚РѕРІ Рё РѕР±СЉРµРєС‚РЅС‹Рµ DTO. Р”РѕРєР°Р·Р°С‚РµР»СЊСЃС‚РІР°: `src/app/api/activities/[id]/accept/route.ts:14-18`, `src/app/api/match/like/route.ts:73`, `src/app/api/match/feed/route.ts:82`, `src/app/api/match/like/[id]/route.ts:63-99`.
4. РљР»РёРµРЅС‚СЃРєРёР№ `api()` РґРѕР±Р°РІР»СЏРµС‚ РїСЂРµС„РёРєСЃ `/.proxy` РІ Р±СЂР°СѓР·РµСЂРµ РґР»СЏ РІС‹Р·РѕРІР° СЃРµСЂРІРµСЂРЅС‹С… РјР°СЂС€СЂСѓС‚РѕРІ. Р”РѕРєР°Р·Р°С‚РµР»СЊСЃС‚РІР°: `src/utils/api.ts:1-3`.

**РРЅРІРµРЅС‚Р°СЂРёР·Р°С†РёСЏ /api (РљР°Рє РЎРµР№С‡Р°СЃ)**

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
| `/api/questionnaires/[id]` | GET | path: `id` | questionnaire document (`src/app/api/questionnaires/[id]/route.ts:37-44`) | path param only |
| `/api/questionnaires/[id]` | POST | body: `{ userId, answers[] }` or `{ userId, qid, ui }` (`src/app/api/questionnaires/[id]/route.ts:52-70`) | `{ ok: true }` (`src/app/api/questionnaires/[id]/route.ts:131`) | userId in body (`src/app/api/questionnaires/[id]/route.ts:52-70`) |
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

**Р‘РёР·РЅРµСЃ-Р»РѕРіРёРєР° РІ СЂРѕСѓС‚РµСЂР°С… (РљР°Рє РЎРµР№С‡Р°СЃ)**
1. `/api/match/confirm` СЃС‚СЂРѕРёС‚ passport РїР°СЂС‹ Рё СЃРѕР·РґР°С‘С‚ РїСЂРµРґР»РѕР¶РµРЅРёСЏ Р°РєС‚РёРІРЅРѕСЃС‚РµР№ РІРЅСѓС‚СЂРё СЂРѕСѓС‚РµСЂР°. Р”РѕРєР°Р·Р°С‚РµР»СЊСЃС‚РІР°: `src/app/api/match/confirm/route.ts:15-93,121-158`.
2. `/api/pairs/[id]/suggest` Рё `/api/pairs/[id]/activities/suggest` СЃРѕРґРµСЂР¶Р°С‚ РїСЂР°РІРёР»Р° РІС‹Р±РѕСЂР° С€Р°Р±Р»РѕРЅРѕРІ РїРѕ riskZones Рё fatigue. Р”РѕРєР°Р·Р°С‚РµР»СЊСЃС‚РІР°: `src/app/api/pairs/[id]/suggest/route.ts:15-69`, `src/app/api/pairs/[id]/activities/suggest/route.ts:15-59`.
3. `/api/activities/next` РІС‹Р±РёСЂР°РµС‚ С€Р°Р±Р»РѕРЅ РїРѕ Р·РѕРЅРµ СЂРёСЃРєР° Рё СЃРѕР·РґР°С‘С‚ `PairActivity` СЃ Р°РІС‚Рѕ-РґРµР»СЊС‚Р°РјРё. Р”РѕРєР°Р·Р°С‚РµР»СЊСЃС‚РІР°: `src/app/api/activities/next/route.ts:54-133`.
4. `/api/questionnaires/[id]` Рё `/api/answers/bulk` СЃС‡РёС‚Р°СЋС‚ РѕСЃРё Рё РѕР±РЅРѕРІР»СЏСЋС‚ `vectors.*`. Р”РѕРєР°Р·Р°С‚РµР»СЊСЃС‚РІР°: `src/app/api/questionnaires/[id]/route.ts:57-114`, `src/app/api/answers/bulk/route.ts:50-103`.
5. `/api/match/feed` СЂР°СЃСЃС‡РёС‚С‹РІР°РµС‚ distance/score РїРѕ РІРµРєС‚РѕСЂР°Рј Рё РІС‹РґР°С‘С‚ С‚РѕРї РєР°РЅРґРёРґР°С‚РѕРІ. Р”РѕРєР°Р·Р°С‚РµР»СЊСЃС‚РІР°: `src/app/api/match/feed/route.ts:18-82`.
6. `/api/pairs/[id]/diagnostics` РїРµСЂРµСЃС‡РёС‚С‹РІР°РµС‚ passport Рё РїРёС€РµС‚ РІ `Pair`. Р”РѕРєР°Р·Р°С‚РµР»СЊСЃС‚РІР°: `src/app/api/pairs/[id]/diagnostics/route.ts:13-66`.

**Evidence**
| Р¤Р°РєС‚ | РўРёРї | РСЃС‚РѕС‡РЅРёРє (path:line) | Р¦РёС‚Р°С‚Р° (?2 СЃС‚СЂРѕРєРё) |
|---|---|---|---|
| API РІРѕР·РІСЂР°С‰Р°СЋС‚ `NextResponse.json` | api | `src/app/api/activities/next/route.ts:136-139` | `return NextResponse.json({`<br>`  ok: true,` |
| РћС€РёР±РєРё РѕС„РѕСЂРјР»РµРЅС‹ РєР°Рє `{ error: '...' }` | api | `src/app/api/match/feed/route.ts:30-32` | `return NextResponse.json({ error: 'missing userId' }, { status: 400 });` |
| Р­РЅРґРїРѕРёРЅС‚ РѕС‚РґР°С‘С‚ РјР°СЃСЃРёРІ DTO | api | `src/app/api/match/feed/route.ts:68-82` | `const list: CandidateDTO[] = candidates.map((u) => {` |
| Р­РЅРґРїРѕРёРЅС‚ РѕС‚РґР°С‘С‚ `{ ok: true }` | api | `src/app/api/activities/[id]/accept/route.ts:14-18` | `doc.status = 'accepted';`<br>`return NextResponse.json({ ok:true });` |
| Р’С…РѕРґС‹ РёСЃРїРѕР»СЊР·СѓСЋС‚ query params | api | `src/app/api/questionnaires/route.ts:8-12` | `const { searchParams } = new URL(req.url);` |
| Р’С…РѕРґС‹ РёСЃРїРѕР»СЊР·СѓСЋС‚ body JSON | api | `src/app/api/answers/bulk/route.ts:31-33` | `const { userId, answers } = (await req.json()) as Body;` |
| РљР»РёРµРЅС‚СЃРєРёР№ `api()` РґРѕР±Р°РІР»СЏРµС‚ `/.proxy` | util | `src/utils/api.ts:1-3` | `return (typeof window !== 'undefined' ? '/.proxy' : '') + path;` |

**Р“РёРїРѕС‚РµР·С‹/Р РёСЃРєРё/РљСѓРґР° РРґС‘Рј**
- Р’РІРµСЃС‚Рё РµРґРёРЅС‹Р№ response envelope (`{ ok, data, error }`) Рё СѓРЅРёС„РёС†РёСЂРѕРІР°РЅРЅС‹Рµ error codes (СЃРµР№С‡Р°СЃ С„РѕСЂРјР°С‚С‹ РѕС‚РІРµС‚Р° СЂР°Р·РЅРѕСЂРѕРґРЅС‹Рµ).
- Р’С‹РЅРµСЃС‚Рё РІР°Р»РёРґР°С†РёСЋ РІС…РѕРґРѕРІ РІ РѕР±С‰РёР№ СЃР»РѕР№ (zod) Рё РґРѕР±Р°РІРёС‚СЊ РёРґРµРјРїРѕС‚РµРЅС‚РЅРѕСЃС‚СЊ РґР»СЏ РјСѓС‚Р°С†РёР№ (accept/cancel/checkin/complete, match/respond/confirm).
- РџСЂРѕРІРµСЂРёС‚СЊ РЅР°Р»РёС‡РёРµ С†РµРЅС‚СЂР°Р»РёР·РѕРІР°РЅРЅРѕРіРѕ auth middleware/guard; РїСЂРё РѕС‚СЃСѓС‚СЃС‚РІРёРё вЂ” РґРѕР±Р°РІРёС‚СЊ РјРёРЅРёРјР°Р»СЊРЅСѓСЋ РїСЂРѕРІРµСЂРєСѓ РїРѕ СЃРµСЃСЃРёРё/С‚РѕРєРµРЅСѓ.

## Update 2026-02-07 (PROB-001 Iteration 2)

`userId` Р±РѕР»СЊС€Рµ РЅРµ СЏРІР»СЏРµС‚СЃСЏ РІС…РѕРґРЅС‹Рј РїР°СЂР°РјРµС‚СЂРѕРј self-scoped API. РЎСѓР±СЉРµРєС‚ Р·Р°РїСЂРѕСЃР° РѕРїСЂРµРґРµР»СЏРµС‚СЃСЏ С‚РѕР»СЊРєРѕ РїРѕ session (`requireSession`).

| Endpoint | Old self contract | New self contract |
|---|---|---|
| `/api/match/feed` GET | `?userId=...` | Р±РµР· query; user РёР· session |
| `/api/match/inbox` GET | `?userId=...` | Р±РµР· query; user РёР· session |
| `/api/match/card` GET | `?userId=...` | Р±РµР· query; user РёР· session |
| `/api/match/card` POST | `{ userId, ... }` | `{ requirements, give, questions, isActive? }`, user РёР· session |
| `/api/match/like` POST | `{ userId/fromId, toId, ... }` | `{ toId, agreements, answers }`, from=user РёР· session |
| `/api/match/respond` POST | `{ userId, likeId, ... }` | `{ likeId, agreements, answers }`, user РёР· session |
| `/api/match/accept` POST | `{ likeId, userId }` | `{ likeId }`, user РёР· session |
| `/api/match/reject` POST | `{ likeId, userId }` | `{ likeId }`, user РёР· session |
| `/api/match/confirm` POST | `{ likeId, userId }` | `{ likeId }`, user РёР· session |
| `/api/pairs/me` GET | `?userId=...` | Р±РµР· query; user РёР· session |
| `/api/pairs/status` GET | `?userId=...` | Р±РµР· query; user РёР· session |
| `/api/activities/next` POST | `{ userId }` | `{}` (РёР»Рё РїСѓСЃС‚РѕРµ body), user РёР· session |
| `/api/answers/bulk` POST | `{ userId, answers[] }` | `{ answers[] }`, user РёР· session |
| `/api/questionnaires/[id]` POST | `{ userId, qid/ui }` | `{ qid, ui }` РёР»Рё `{ answers[] }`, user РёР· session |
| `/api/users/me/profile-summary` GET | `?userId=...` | Р±РµР· query; user РёР· session |
| `/api/logs` POST | `{ userId }` | `{}` (РёР»Рё РїСѓСЃС‚РѕРµ body), user РёР· session |
| `/api/users` POST | `{ id, ... }` | `{ ... }`, `id` Р±РµСЂРµС‚СЃСЏ РёР· session |

РќРѕРІС‹Рµ self endpoints:
- `GET /api/users/me`
- `PUT /api/users/me`
- `PATCH /api/users/me/onboarding`



## DTO Contract Rule (2026-02-07, PROB-006)

1. API handlers MUST return DTO/view-model shapes only.
2. API handlers MUST NOT return DB model shape (Mongoose document or raw `lean()` model object) directly.
3. DTO mapping must be centralized in `src/lib/dto/*` and reused by routes.
4. Route-level code review guard: every `route.ts` must keep the rule comment `return only DTO/view model`.

## Update 2026-02-07 (Discord Activity envelope client fix)

- Added client envelope helper `src/utils/apiClient.ts` (`ApiOk`, `ApiErr`, `ApiEnvelope`, `fetchEnvelope<T>`).
- Updated Discord Activity entry page to unwrap envelope for `/api/exchange-code` and `/api/users/me`.
- Updated Activity logs call to send JSON body (`{}`) with `Content-Type: application/json` in fire-and-forget mode.

## Update 2026-02-07 (Client envelope guard + lootboxes route)

- Fixed client pages that used array operators (`filter`/`map`) on raw API JSON by switching to `fetchEnvelope` and explicit `Array.isArray` fallback.
- Added a minimal GET /lootboxes UI route (src/app/lootboxes/page.tsx) to prevent main-menu prefetch/navigation 404.

