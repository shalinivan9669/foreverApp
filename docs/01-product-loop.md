**Как Сейчас (Обзор)**
1. Стартовая страница выполняет OAuth через Discord SDK, обменивает code на access_token через `/api/exchange-code`, получает профиль Discord, сохраняет пользователя в Zustand store и далее делает переход в меню или на онбординг в зависимости от данных профиля. Доказательства: `src/app/page.tsx:14-87`, `src/store/useUserStore.ts:17-27`, `src/app/api/exchange-code/route.ts:3-27`, `src/app/api/users/[id]/route.ts:9-14`.
2. Визит логируется запросом `/api/logs` (fire-and-forget). Доказательства: `src/app/page.tsx:70-75`, `src/app/api/logs/route.ts:6-11`.
3. Онбординг отображается страницей `/welcome` и реализован компонентом `OnboardingWizard`, который пишет базовые данные пользователя в `/api/users` и ответы в `/api/users/[id]/onboarding`. Доказательства: `src/app/welcome/page.tsx:1-5`, `src/components/OnboardingWizard.tsx:40-95`, `src/app/api/users/route.ts:6-33`, `src/app/api/users/[id]/onboarding/route.ts:9-25`.
4. Главное меню состоит из плиток навигации (поиск пары, профиль, анкеты, активность пары, лутбоксы). Доказательства: `src/app/main-menu/page.tsx:3-22`, `src/components/main-menu/SearchPairTile.tsx:35-37`, `src/components/main-menu/ProfileTile.tsx:7-13`, `src/components/main-menu/QuestionnaireTile.tsx:4-8`, `src/components/main-menu/CoupleActivityTile.tsx:4-8`, `src/components/main-menu/LootboxTile.tsx:4-8`.
5. Матчинг включает ленту кандидатов `/api/match/feed`, отправку лайка `/api/match/like`, просмотр входящих/исходящих `/api/match/inbox`, ответ на лайк `/api/match/respond`, решения инициатора `/api/match/accept` и `/api/match/reject`, подтверждение пары `/api/match/confirm`, детальную страницу лайка `/api/match/like/[id]`. Доказательства: `src/app/search/page.tsx:34-99`, `src/components/LikeModal.tsx:35-65`, `src/app/match/inbox/page.tsx:113-178`, `src/app/match/inbox/page.tsx:347-378`, `src/app/match/like/[id]/page.tsx:78-151`.
6. Пара и активности: профиль пары читает `/api/pairs/me` и `/api/pairs/[id]/summary`, состояние пары можно поставить на паузу/возобновить через `/api/pairs/[id]/pause` и `/api/pairs/[id]/resume`. Экран активностей пары использует `/api/pairs/[id]/activities` для текущих/предложенных/истории, `/api/pairs/[id]/suggest` для предложения, `/api/activities/[id]/accept|cancel|checkin` для действий. Доказательства: `src/app/pair/page.tsx:60-107`, `src/app/couple-activity/page.tsx:54-145`, `src/app/api/pairs/[id]/summary/route.ts:11-58`, `src/app/api/pairs/[id]/pause/route.ts:8-13`, `src/app/api/pairs/[id]/resume/route.ts:8-13`, `src/app/api/pairs/[id]/activities/route.ts:43-57`, `src/app/api/pairs/[id]/suggest/route.ts:11-71`, `src/app/api/activities/[id]/accept/route.ts:7-17`, `src/app/api/activities/[id]/cancel/route.ts:7-13`, `src/app/api/activities/[id]/checkin/route.ts:8-26`.
7. Анкетирование: одиночный опросник `/questionnaire` получает вопросы из `/api/questions` и отправляет ответы в `/api/answers/bulk`, список анкет `/questionnaires` загружает `/api/questionnaires`, прохождение анкеты `/questionnaire/[id]` использует `/api/questionnaires/[id]`, парный опросник `/pair/[id]/questionnaire/[qid]` стартует сессией `/api/pairs/[id]/questionnaires/[qid]/start` и пишет ответы в `/api/pairs/[id]/questionnaires/[qid]/answer`. Доказательства: `src/app/questionnaire/page.tsx:15-35`, `src/app/questionnaires/page.tsx:22-24`, `src/app/questionnaire/[id]/page.tsx:32-54`, `src/app/pair/[id]/questionnaire/[qid]/page.tsx:65-85`, `src/app/api/questions/route.ts:7-31`, `src/app/api/answers/bulk/route.ts:31-103`, `src/app/api/questionnaires/route.ts:6-15`, `src/app/api/questionnaires/[id]/route.ts:39-116`, `src/app/api/pairs/[id]/questionnaires/[qid]/start/route.ts:11-47`, `src/app/api/pairs/[id]/questionnaires/[qid]/answer/route.ts:18-49`.
8. Диагностика пары: `/pair/[id]/diagnostics` использует `/api/pairs/[id]/diagnostics`, а CTA берёт первую couple-анкету из `/api/questionnaires?target=couple`. Доказательства: `src/app/pair/[id]/diagnostics/page.tsx:30-45`, `src/app/api/pairs/[id]/diagnostics/route.ts:43-67`.
9. Профиль: обзор профиля `/profile` и вкладка matching читают `/api/users/me/profile-summary`. Доказательства: `src/app/(auth)/profile/page.tsx:45-51`, `src/app/profile/(tabs)/matching/page.tsx:18-24`, `src/app/api/users/me/profile-summary/route.ts:38-157`.

**Evidence**
| Факт | Тип | Источник (path:line) | Цитата (?2 строки) |
|---|---|---|---|
| OAuth через Discord SDK и обмен code на token | ui | `src/app/page.tsx:18-43` | `const clientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID!;`<br>`const { code } = await sdk.commands.authorize({` |
| Визит логируется через /api/logs | ui | `src/app/page.tsx:70-75` | `fetch('/.proxy/api/logs', {`<br>`  body: JSON.stringify({ userId: user.id }),` |
| /api/logs пишет Log | api | `src/app/api/logs/route.ts:6-11` | `const entry = await Log.create({ userId, at: new Date() });`<br>`return NextResponse.json(entry);` |
| Пользователь сохраняется в Zustand | util | `src/store/useUserStore.ts:17-27` | `user: null,`<br>`setUser: (u) => set({ user: u }),` |
| /welcome рендерит OnboardingWizard | ui | `src/app/welcome/page.tsx:1-5` | `import OnboardingWizard from '@/components/OnboardingWizard';`<br>`return <OnboardingWizard />;` |
| Онбординг: POST /api/users | ui | `src/components/OnboardingWizard.tsx:40-57` | `const res = await fetch('/.proxy/api/users', {`<br>`  body: JSON.stringify({` |
| Онбординг: PATCH /api/users/[id]/onboarding | ui | `src/components/OnboardingWizard.tsx:90-95` | `const res = await fetch(`/.proxy/api/users/${user.id}/onboarding`, {`<br>`  method: 'PATCH',` |
| /api/users upsert пользователя | api | `src/app/api/users/route.ts:20-21` | `const doc = await User.findOneAndUpdate(` <br> `  { id: body.id },` |
| /api/users/[id]/onboarding пишет profile.onboarding | api | `src/app/api/users/[id]/onboarding/route.ts:15-16` | for (const [k, v] of Object.entries(body)) {<br>set[\`profile.onboarding.${k}\`] = v; |
| Главное меню содержит плитки навигации | ui | `src/app/main-menu/page.tsx:3-22` | `import SearchPairTile from '@/components/main-menu/SearchPairTile';`<br>`<CoupleActivityTile />` |
| Плитка поиска ведёт на /pair или /search | ui | `src/components/main-menu/SearchPairTile.tsx:35-37` | `href={hasActive ? '/pair' : '/search'}` |
| Плитка профиля ведёт на /profile | ui | `src/components/main-menu/ProfileTile.tsx:7-13` | `return (`<br>`  <Link href="/profile"` |
| Плитка анкет ведёт на /questionnaires | ui | `src/components/main-menu/QuestionnaireTile.tsx:4-8` | `href="/questionnaires"` |
| Плитка активностей пары ведёт на /couple-activity | ui | `src/components/main-menu/CoupleActivityTile.tsx:4-8` | `href="/couple-activity"` |
| Плитка лутбоксов ведёт на /lootboxes | ui | `src/components/main-menu/LootboxTile.tsx:4-8` | `href="/lootboxes"` |
| Поиск пары: guard /api/pairs/me и /api/match/card | ui | `src/app/search/page.tsx:34-38` | `fetch(api(`/api/pairs/me?userId=${user.id}`))`<br>`fetch(api(`/api/match/card?userId=${user.id}`))` |
| Поиск пары: лента /api/match/feed | ui | `src/app/search/page.tsx:71-74` | `fetch(api(`/api/match/feed?userId=${user.id}`))` |
| LikeModal читает /api/match/card/:id | ui | `src/components/LikeModal.tsx:35-37` | `fetch(api(`/api/match/card/${candidate.id}`))` |
| LikeModal пишет /api/match/like | ui | `src/components/LikeModal.tsx:56-64` | `const res = await fetch(api('/api/match/like'), {`<br>`  body: JSON.stringify({` |
| Inbox читает /api/match/inbox | ui | `src/app/match/inbox/page.tsx:113-118` | `const res = await fetch(api(`/api/match/inbox?userId=${user.id}`), {` |
| Inbox: accept/reject инициатором | ui | `src/app/match/inbox/page.tsx:148-155` | `const endpoint = accepted ? '/api/match/accept' : '/api/match/reject';` |
| Inbox: create pair через /api/match/confirm | ui | `src/app/match/inbox/page.tsx:164-170` | `const res = await fetch(api('/api/match/confirm'), {` |
| RespondModal грузит /api/match/like/[id] | ui | `src/app/match/inbox/page.tsx:347-349` | `const res = await fetch(api(`/api/match/like/${likeId}`));` |
| RespondModal пишет /api/match/respond | ui | `src/app/match/inbox/page.tsx:370-378` | `const res = await fetch(api('/api/match/respond'), {`<br>`  body: JSON.stringify({` |
| Детальная страница лайка читает /api/match/like/[id] | ui | `src/app/match/like/[id]/page.tsx:78-83` | `const res = await fetch(api(`/api/match/like/${id}`));` |
| Детальная страница лайка вызывает /api/match/accept/reject | ui | `src/app/match/like/[id]/page.tsx:138-145` | `post('/api/match/accept', { userId: user.id, likeId: like.id });` |
| Детальная страница лайка подтверждает пару | ui | `src/app/match/like/[id]/page.tsx:148-151` | `await post('/api/match/confirm', { userId: user.id, likeId: like.id });` |
| Профиль пары читает /api/pairs/me | ui | `src/app/pair/page.tsx:60-65` | `fetch(api(`/api/pairs/me?userId=${user.id}`))` |
| Профиль пары читает /api/pairs/[id]/summary | ui | `src/app/pair/page.tsx:77-80` | `const res = await fetch(api(`/api/pairs/${id}/summary`));` |
| Пауза/возобновление пары | ui | `src/app/pair/page.tsx:93-104` | `await fetch(api(`/api/pairs/${pairId}/pause`), { method: 'POST' });` |
| Активности пары: /api/pairs/me | ui | `src/app/couple-activity/page.tsx:54-60` | `fetch(api(`/api/pairs/me?userId=${user.id}`))` |
| Активности пары: /api/pairs/[id]/activities | ui | `src/app/couple-activity/page.tsx:80-83` | `const res = await fetch(api(`/api/pairs/${pairId}/activities?s=${s}`));` |
| Активности пары: /api/pairs/[id]/suggest | ui | `src/app/couple-activity/page.tsx:112-114` | `const res = await fetch(api(`/api/pairs/${pairId}/suggest`), { method: 'POST' });` |
| Активности пары: accept/cancel | ui | `src/app/couple-activity/page.tsx:122-129` | `await fetch(api(`/api/activities/${id}/accept`), { method: 'POST' });` |
| Активности пары: checkin | ui | `src/app/couple-activity/page.tsx:136-145` | `await fetch(api(`/api/activities/${id}/checkin`), {`<br>`  body: JSON.stringify({ by: 'A', answers }),` |
| Одиночный опрос: /api/questions | ui | `src/app/questionnaire/page.tsx:15-18` | `fetch('/api/questions?limit=12')` |
| Одиночный опрос: /api/answers/bulk | ui | `src/app/questionnaire/page.tsx:28-34` | `await fetch('/api/answers/bulk', {`<br>`  body: JSON.stringify({` |
| Список анкет: /api/questionnaires | ui | `src/app/questionnaires/page.tsx:22-24` | `fetch('/api/questionnaires')` |
| Прохождение анкеты: /api/questionnaires/[id] | ui | `src/app/questionnaire/[id]/page.tsx:50-54` | `await fetch(api(`/api/questionnaires/${id}`), {`<br>`  body: JSON.stringify({ userId: user.id, qid, ui }),` |
| Парный опрос: start session | ui | `src/app/pair/[id]/questionnaire/[qid]/page.tsx:65-67` | `fetch(api(`/api/pairs/${pairId}/questionnaires/${qnId}/start`), { method: 'POST' })` |
| Парный опрос: answer | ui | `src/app/pair/[id]/questionnaire/[qid]/page.tsx:81-85` | `const res = await fetch(api(`/api/pairs/${pairId}/questionnaires/${qnId}/answer`), {` |
| Диагностика пары: /api/pairs/[id]/diagnostics | ui | `src/app/pair/[id]/diagnostics/page.tsx:42-45` | `const res = await fetch(api(`/api/pairs/${pairId}/diagnostics`));` |
| Диагностика CTA: /api/questionnaires?target=couple | ui | `src/app/pair/[id]/diagnostics/page.tsx:30-33` | `fetch(api('/api/questionnaires?target=couple'))` |
| Профиль: /api/users/me/profile-summary | ui | `src/app/(auth)/profile/page.tsx:45-50` | `fetch(api(`/api/users/me/profile-summary?userId=${user.id}`))` |

**Гипотезы/Риски/Куда Идём**
- Сформировать недельную петлю ценности как явный сценарий (session > activities > reflection > insight > следующий шаг) и связать её с событиями аналитики.
- Ввести детерминированные reason codes для подбора активностей/матчинга.
- Нормализовать единый формат ответов API (envelope) и слой сервисов для бизнес?логики.
- Добавить entitlements/billing как отдельный адаптер.
