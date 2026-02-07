**Как Сейчас (Обзор)**
1. Модель `User` хранит персональные поля `gender`, `age`, `city`, `relationshipStatus`, а также `profile.onboarding`. Доказательства: `src/models/User.ts:7-45`.
2. Ответы чек-инов пишутся в `PairActivity.answers` (поля `checkInId`, `by`, `ui`, `at`) и записываются через `/api/activities/[id]/checkin`. Доказательства: `src/models/PairActivity.ts:4-54`, `src/app/api/activities/[id]/checkin/route.ts:10-20`.
3. Ответы парного опросника пишутся в `PairQuestionnaireAnswer` с полями `sessionId`, `questionId`, `by`, `ui`, `at`. Доказательства: `src/models/PairQuestionnaireAnswer.ts:3-24`, `src/app/api/pairs/[id]/questionnaires/[qid]/answer/route.ts:39-47`.
4. Наблюдаемые проверки доступа: `match/respond` проверяет `like.toId === userId`, `match/accept` проверяет `like.fromId === userId`, `match/reject` проверяет `like.toId === userId`, `pairs/me` фильтрует по `members: userId`. Доказательства: `src/app/api/match/respond/route.ts:60-61`, `src/app/api/match/accept/route.ts:14`, `src/app/api/match/reject/route.ts:15`, `src/app/api/pairs/me/route.ts:13-16`.
5. Секреты и подключения: `MONGODB_URI` берётся из окружения; OAuth использует `DISCORD_CLIENT_SECRET`. Доказательства: `src/lib/mongodb.ts:4-7`, `src/app/api/exchange-code/route.ts:9-12`.
6. Session cookie РІ prod С‚Р°Рє РєР°Рє РїСЂРёР»РѕР¶РµРЅРёРµ РѕС‚РєСЂС‹РІР°РµС‚СЃСЏ РІ iframe Discord, РІС‹РґР°С‘С‚СЃСЏ СЃ `SameSite=None; Secure`, РІ dev — `SameSite=Lax` РґР»СЏ localhost. Р”РѕРєР°Р·Р°С‚РµР»СЊСЃС‚РІР°: `src/app/api/exchange-code/route.ts:55-66`.

**Evidence**
| Факт | Тип | Источник (path:line) | Цитата (?2 строки) |
|---|---|---|---|
| User персональные поля | model | `src/models/User.ts:7-45` | `personal: {`<br>`  gender: 'male' | 'female' | 'other';` |
| PairActivity answers schema | model | `src/models/PairActivity.ts:4-54` | `export interface Answer {`<br>`  checkInId: string;` |
| Check-in пишет answers | api | `src/app/api/activities/[id]/checkin/route.ts:10-20` | `const { by, answers } = (await req.json()) as {` |
| Questionnaire answers schema | model | `src/models/PairQuestionnaireAnswer.ts:3-24` | `questionId: string;`<br>`by: 'A' | 'B';` |
| Questionnaire answer API | api | `src/app/api/pairs/[id]/questionnaires/[qid]/answer/route.ts:39-47` | `await PairQuestionnaireAnswer.create({` |
| Access check in match/respond | api | `src/app/api/match/respond/route.ts:60-61` | `if (like.toId !== userId) return json({ error: 'forbidden' }, 403);` |
| Access check in match/accept | api | `src/app/api/match/accept/route.ts:14` | `if (like.fromId !== userId) return NextResponse.json({ error: 'forbidden' }, { status: 403 });` |
| Pair lookup by members | api | `src/app/api/pairs/me/route.ts:13-16` | `const pair = await Pair.findOne({`<br>`  members: userId,` |
| MONGODB_URI from env | config | `src/lib/mongodb.ts:4-7` | `const MONGODB_URI = process.env.MONGODB_URI;` |
| DISCORD_CLIENT_SECRET from env | config | `src/app/api/exchange-code/route.ts:9-12` | `client_secret: process.env.DISCORD_CLIENT_SECRET!,` |

**Куда Идём (Security/Privacy)**
- Ввести обязательную проверку членства пары на всех `/api/pairs/[id]/*` и `/api/activities/[id]/*`.
- Добавить проверку сессии/токена в middleware и убрать доверие к голому `userId` из запроса.
- Ограничить выдачу PII: DTO для публичных ответов, скрытие `personal.*` вне профиля.
- Минимизировать хранение чувствительных ответов: TTL/архив для `PairActivity.answers` и `PairQuestionnaireAnswer`.
- Логи: маскирование/редакция текстовых ответов и запрет на логирование токенов.
- Админ-доступ: отдельный флаг/роль с явным аудитом действий.

## Update 2026-02-07 (PROB-001 Iteration 2)

- Для self-scoped приватных API запрещено использовать `userId` из `query/body/path` как субъект доступа.
- Субъект запроса определяется только через `requireSession(req).data.userId`.
- Legacy поля `userId`/`fromId`, если клиент их все еще присылает, считаются неавторитетными и игнорируются.
- `/api/users/me*` объявлены как приоритетные self-пути; self-клиентский flow переведен с `/api/users/[id]` на `/api/users/me` и `/api/users/me/onboarding`.
- Разделение `401`/`403`:
  - `401` при отсутствии/невалидности session (через `requireSession`).
  - `403` для авторизованного пользователя без прав на конкретный ресурс (resource guards в PROB-003).
