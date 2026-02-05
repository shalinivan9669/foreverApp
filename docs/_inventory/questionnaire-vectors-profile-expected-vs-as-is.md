# Questionnaire → Vectors → Profile: Expected vs As-Is

**Scope**
Анкеты/тесты (индивидуальные и парные), обновление `User.vectors.*`, отображение осей/паспортов в профиле.

**Docs: As-Is (что описано как текущее)**
| Тема | Что сказано в docs | Evidence (path:line + цитата ≤2 строки) |
|---|---|---|
| Карточки анкет (UI/DTO) | Описан формат `QuestionnaireCardDTO` и статусы карточек | `docs/ui/questionnaire-cards.md:49-74` — `## DTO (формат для UI)` / `QuestionnaireCardDTO = {` |
| Парный флоу анкет | Описаны `start` и `answer` для парных анкет | `docs/data/questionnaire-flow.md:23-35` — `## 2) Start/Resume анкеты` / `POST /api/pairs/:id/questionnaires/:qid/start`<br>`docs/data/questionnaire-flow.md:32-35` — `## 3) Отправка ответов` / `POST /api/pairs/:id/questionnaires/:qid/answer` |
| Прогресс парной анкеты | Прогресс по уникальным `questionId`, статус `completed` в `PairQuestionnaireSession` | `docs/data/questionnaire-flow.md:40-42` — `Прогресс считается по уникальным questionId` / `Статус completed фиксируется` |
| API для индивидуальных анкет | `/api/questionnaires/[id]` (GET/POST) и `/api/answers/bulk` описаны | `docs/04-api-contracts.md:56-58` — ``/api/questionnaires/[id]`` / ``/api/answers/bulk`` |
| Обновление осей/векторов | Docs прямо говорят, что `/api/questionnaires/[id]` и `/api/answers/bulk` обновляют `vectors.*` | `docs/04-api-contracts.md:75` — ``/api/questionnaires/[id]` и `/api/answers/bulk` считают оси и обновляют `vectors.*`.`` |
| Домен: вопросы/анкеты | В домене есть `Question` и `Questionnaire` с `axis/facet/map/weight` | `docs/02-domain-model.md:11-12` — `Question: поля _id, axis, facet, polarity, scale, map, weight` / `Questionnaire: поля _id, title, description, target..., axis, difficulty, ...` |

**Code: As-Is (что реально реализовано)**
| Тема | Реализация в коде | Evidence (path:line + цитата ≤2 строки) |
|---|---|---|
| Индивидуальный быстрый тест | Страница `/questionnaire` грузит `/api/questions` и пишет ответы в `/api/answers/bulk` | `src/app/questionnaire/page.tsx:16-34` — `fetch('/api/questions?limit=12')` / `await fetch('/api/answers/bulk', {` |
| Индивидуальная анкета | Страница `/questionnaire/[id]` грузит анкету и пишет ответ в `/api/questionnaires/[id]` | `src/app/questionnaire/[id]/page.tsx:31-54` — `fetch(api(
`/api/questionnaires/${id}`))` / `await fetch(api(
`/api/questionnaires/${id}`), {` |
| Обновление векторов (bulk) | `/api/answers/bulk` считает `avgSigned` и пишет `vectors.{axis}.level` + `positives/negatives` | `src/app/api/answers/bulk/route.ts:81-88` — `const avgSigned = addSigned[axis] / cnt[axis];` / `setLevels[
`vectors.${axis}.level`] = next;`<br>`src/app/api/answers/bulk/route.ts:96-100` — `addToSet[
`vectors.${axis}.positives`] = { $each: pos[axis] };` / `negatives` |
| Обновление векторов (single answer) | `/api/questionnaires/[id]` обновляет `vectors.*` так же, как bulk | `src/app/api/questionnaires/[id]/route.ts:112-118` — `const avgSigned = addSigned[axis] / cnt[axis];` / `setLevels[
`vectors.${axis}.level`] = next;`<br>`src/app/api/questionnaires/[id]/route.ts:121-127` — `addToSet[
`vectors.${axis}.positives`] = { $each: pos[axis] };` / `negatives` |
| Шкала уровней | Уровень хранится в `User.vectors.*.level` как число | `src/models/User.ts:13-16` — `vectors: Record<string, {` / `level: number;` |
| Профиль → уровни осей | `profile-summary` берет `user.vectors.*.level`, clamp 0..1, переводит в 0..100 | `src/app/api/users/me/profile-summary/route.ts:69-81` — `// Уровни по 6 осям` / `levelsByAxis[a] = Math.round(clamped * 100);` |
| Отображение осей | `AxisRadar` показывает проценты по осям | `src/components/charts/AxisRadar.tsx:6-28` — `AxisRadar({ levels })` / `Math.round(levels[it.key] ?? 0)` |
| Парные анкеты | `/api/pairs/[id]/questionnaires/[qid]/answer` пишет `PairQuestionnaireAnswer`, без обновления `User.vectors` | `src/app/api/pairs/[id]/questionnaires/[qid]/answer/route.ts:39-49` — `await PairQuestionnaireAnswer.create({` / `return NextResponse.json({ ok: true });` |

**Docs: Should-Be (что описано как целевое/«куда идём»)**
| Тема | Что обещано в docs | Evidence |
|---|---|---|
| Анкеты → обновление векторов/профиля | Явного целевого описания «как должно быть» в разделах “Куда идем/Notes/Target” по этой теме не обнаружено в перечисленных docs | — |

**Gap list (Docs vs Code)**
| Разрыв | В чем проявляется | Evidence |
|---|---|---|
| В docs нет целевого поведения «как должно быть» для обновления осей в профиле | Документы описывают текущий flow и DTO, но не фиксируют целевую динамику осей/психики | `docs/ui/questionnaire-cards.md:1-104` — описание UI/DTO без требований к обновлению осей<br>`docs/data/questionnaire-flow.md:1-57` — флоу парных анкет без упоминания профиля |
| Парные анкеты не обновляют `User.vectors` | Если пользователь проходит парную анкету, профильные оси не меняются, т.к. запись идет в `PairQuestionnaireAnswer` | `src/app/api/pairs/[id]/questionnaires/[qid]/answer/route.ts:39-49` — `PairQuestionnaireAnswer.create({` / `return NextResponse.json({ ok: true });` |

**Трассировка: «ответ → вектор → профиль»**
| Шаг | Индивидуальный тест (`/questionnaire`) | Индивидуальная анкета (`/questionnaire/[id]`) | Парная анкета (`/pair/[id]/questionnaire/[qid]`) |
|---|---|---|---|
| UI → API | `POST /api/answers/bulk` | `POST /api/questionnaires/[id]` | `POST /api/pairs/[id]/questionnaires/[qid]/answer` |
| API → DB | `User.updateOne` с `vectors.*` | `User.updateOne` с `vectors.*` | `PairQuestionnaireAnswer.create` |
| Профиль | `GET /api/users/me/profile-summary` берёт `user.vectors` | то же | изменений осей нет, т.к. `vectors` не обновляются |
| Evidence | `src/app/questionnaire/page.tsx:28-34` — `fetch('/api/answers/bulk', {` / `answers: Object.entries(ans)`<br>`src/app/api/answers/bulk/route.ts:81-88` — `setLevels[
`vectors.${axis}.level`] = next;` | `src/app/questionnaire/[id]/page.tsx:50-54` — `fetch(api(
`/api/questionnaires/${id}`), {` / `body: JSON.stringify({ userId: user.id, qid, ui })`<br>`src/app/api/questionnaires/[id]/route.ts:112-118` — `setLevels[
`vectors.${axis}.level`] = next;` | `src/app/api/pairs/[id]/questionnaires/[qid]/answer/route.ts:39-49` — `PairQuestionnaireAnswer.create({` / `return NextResponse.json({ ok: true });` |

**Примечание по ожиданию “двигаются оси/психика”**
- По коду оси двигаются только в индивидуальных флоу (`/api/answers/bulk`, `/api/questionnaires/[id]`). Парные ответы не обновляют `User.vectors`.
- `profile-summary` всегда читает `user.vectors.*.level` и переводит 0..1 → 0..100; если `vectors` не обновлены, UI не изменится. Evidence: `src/app/api/users/me/profile-summary/route.ts:69-81` — `const lvl = Number(user.vectors?.[a]?.level ?? 0);` / `levelsByAxis[a] = Math.round(clamped * 100);`
