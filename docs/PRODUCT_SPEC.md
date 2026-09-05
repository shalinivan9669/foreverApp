# ForeverApp / «Вместе»: направление продукта

Статус: каноническое описание публичного бесплатного продукта. Обновлено 2026-08-13.

Дополнение от 2026-09-05: текущие границы определяют [ответы владельца](PRODUCT_DECISIONS.md) и [состояние реализации](PRODUCT_IMPLEMENTATION.md). К описанному ниже ядру добавлены самостоятельное развитие одиночки и участника пары, шесть областей навыков, знакомство с независимыми ответами, практические модули общей жизни и заработанная валюта с магазином. Основной подбор и цикл пары остаются бесплатными. Демонстрационные материалы не являются валидированными психологическими методиками. Telegram/mobile, родительство, аналитика повторяющихся конфликтов и новое сопровождение расставания относятся к будущему развитию.

Scope и gates: [MVP_SPEC.md](./MVP_SPEC.md). Подробное поведение: [MVP_FLOWS.md](./MVP_FLOWS.md). Вычислительная модель: [TARGET_DOMAIN_MODEL.md](./TARGET_DOMAIN_MODEL.md).

## 1. Продукт

«Вместе» — приложение для совершеннолетних людей, которые ищут отношения через Factor Matching или уже состоят в отношениях и добровольно создают общую Pair-область.

Оно помогает найти кандидата без публичного compatibility score, взаимно подтвердить MatchingConnection и затем:

1. отдельно отметить состояние текущей недели;
2. увидеть осторожное privacy-safe резюме пары;
3. выбрать один посильный следующий шаг;
4. выполнить его и раздельно дать feedback;
5. повторять цикл без оплаты или лимита числа циклов.

Продукт не определяет, «хорошая» ли пара, не показывает процент совместимости, не диагностирует человека/отношения, не читает мысли партнёра и не заменяет терапию, медицину, кризисную или экстренную помощь.

## 2. Главная гипотеза

Если Factor Matching помогает двум людям безопасно и взаимно сформировать Pair, а оба участника регулярно проходят короткий цикл

```text
check-in → Pair Summary → одно действие → отдельный feedback → следующий цикл
```

то им проще замечать текущий контекст и совершать небольшие полезные действия без перегрузки и раскрытия личных ответов.

Единица долгосрочного activation/retention — Pair. Matching value event — ответ получателя и принятие инициатором создают `MatchingConnection`; Pair value event — оба явно подтвердили переход в Pair. Первый цикл value event — оба увидели первое допустимое общее резюме; полный value event — активность завершена с feedback и пара начала следующий цикл.

## 3. Для кого MVP

- совершеннолетний пользователь, который добровольно активирует Factor Matching для поиска отношений;
- существующая романтическая пара;
- ровно два добровольно подтвердивших участника в каждой `MatchingConnection`/Pair;
- Discord Embedded App и текущий русский интерфейс;
- короткое регулярное взаимодействие, а не длинная диагностика.

Другие рынки/языки, несовершеннолетние и регулируемые verticals требуют отдельных решений.

## 4. Продуктовые принципы

### Бесплатное ядро

Onboarding, MatchingProfile/preferences/feed/Like/connection/block, invitation, Pair confirmation, weekly cycles, Pair Summary, recommendation, activity, feedback, history, profile/settings/help, pair end/reconnect и privacy operations доступны без entitlement. Нет trial, цены, checkout, subscription CTA или hard paywall. Billing-инфраструктура может существовать только как отключённый будущий контур.

### Matching — качественный, consent-bound подбор

`MatchingProfile` существует отдельно от owner semantic profile и Pair. Actual profile строится из текущих Factor snapshots только при активном per-factor `MatchingUseGrant`; желаемый профиль хранится отдельно как versioned `PartnerPreferenceProfile`. Candidate discovery использует минимальную coarse projection, а подробная карточка и Like требуют ограниченный по requester/candidate/revisions/version/expiry candidate grant.

Internal fit может упорядочивать кандидатов, но участник видит только qualitative label/confidence/explanations — без numeric score, raw Factor values, чужих preferences, evidence graph или причины hard constraint. Like создаёт `MatchingConnection`, а Pair — только два разных session-derived подтверждения.

### Два человека и отдельный Pair subject

У каждого есть личные данные; Pair имеет собственный контекст, evidence, snapshots, activities и history. Общая область не делает owner-private ответы общими. Порядок участников не задаёт продуктовую роль A/B.

### Действие важнее рейтинга

Pair Summary ведёт к одному понятному шагу. Большой паспорт, радар, множество чисел и «здоровье отношений» не являются продуктовой ценностью.

### Семантика вместо шести осей

Trait, state, skill, preference, need, role capability, constraint и outcome — разные сущности. Полюса не означают хорошо/плохо. Только skills могут получать развитие; constraint не усредняется. Domain — навигационная группировка, а не число пользователя.

### Недостаток данных — нормален

`MISSING`, `INVALID`, `UNKNOWN` и `INSUFFICIENT_DATA` не заменяются midpoint. Один ответ участника не превращается в вывод о паре.

### Объяснимость и воспроизводимость

Definitions, evidence, snapshots и recommendation provenance версионированы. Исторический результат не меняется молча. Пользователь видит нейтральное объяснение, но не внутренний score/confidence/evidence graph.

### Приватность — часть модели

Capture permission и derived disclosure разделены. Pair result не должен позволять восстановить ответ партнёра. A's observation не меняет B's personal profile. SafetyGate остаётся owner-private system-only veto.

### Явное действие пользователя

PartnerSignal отправляется только после preview/explicit confirm. Skip/pause/end/delete требуют понятного отдельного действия. Система не отправляет партнёру выводы автоматически.

### Детерминированное ядро

MVP использует типизированные правила и reviewed content. AI не выставляет Factor/Safety/constraint, не диагностирует и не получает всю историю по умолчанию.

## 5. Основной путь

```text
Discord auth
→ personal onboarding
→ matching profile/preferences → candidate feed → Like/response
→ MatchingConnection → two-party Pair confirmation
  OR one-time invite → partner accepts
→ Pair created
→ both submit/skip weekly independently
→ privacy-safe Pair Summary
→ offer / accept / replace once / skip
→ activity start + separate feedback
→ bounded history
→ next free cycle
```

Путь выдерживает refresh, повтор запроса, A/B order, partial failure и concurrency; он не создаёт duplicate pair/cycle/evidence/snapshot/decision/activity.

## 6. Информационная архитектура

- entry/onboarding/join/waiting;
- `/search`, `/match/inbox`, `/match/like/[id]`, `/match-card/create` и matching-tab профиля — Factor Matching;
- `/main-menu` — текущий Pair/cycle hub;
- weekly form и Pair Summary;
- `/couple-activity` — current offer/activity/feedback/history states;
- `/profile` — semantic owner profile и personal today;
- settings/privacy/SafetyGate/help/end/reconnect/export/delete.

Legacy vector/scoring implementation удалён из active runtime. Пространство `/api/match/**` теперь обслуживает только Factor Matching с session-derived actor, candidate grants и qualitative DTO. `/api/pairs/create` остаётся guarded compatibility seam с `PAIR_INVITE_REQUIRED`; Pair создаётся через принятие приглашения либо через двухсторонне подтверждённую `MatchingConnection`.

## 7. Входит в public-free MVP

- Discord session/resource boundary and durable logout revocation;
- resumable personal onboarding and consent;
- standalone MatchingProfile, Factor use grants, partner preferences, bounded candidate feed/grants, Like/response, MatchingConnection/block and two-party Pair transition;
- hashed invite, cancel/reissue/expiry/accept;
- weekly untouched/explicit input, skip/expiry and Pair Summary;
- semantic Factor evidence/snapshots/evaluations;
- deterministic recommendation, one replacement, neutral fallback;
- PairActivity lifecycle and separate feedback;
- bounded history and neutral member notifications;
- owner semantic profile, settings and private help;
- explicit PartnerSignal;
- SafetyGate;
- pause/resume/end/new-context reconnect;
- bounded export, request/cancel/confirm deletion and session revocation;
- versioned content/publication, audit/analytics and release migrations.

## 8. Не входит

- numeric compatibility/relationship-health score or six-axis passport;
- public user directory, unbounded social feed/chat or automatic Pair creation from a unilateral Like;
- diagnosis, motive reading or automatic abuse detection;
- AI therapist/chat/memory, voice/emotion analysis;
- household/task manager, budget/calendar, marketplace/social network;
- pregnancy/children/medicine/clinics;
- production payment provider, subscription/paywall or pricing;
- unreviewed sensitive/jurisdiction-specific advice.

## 9. После подтверждения MVP

Only with pilot evidence and a new scoped decision:

- trends and user-confirmed patterns;
- broader factor/content registry and personal skill programs;
- agreements/rituals/household modules;
- richer matching content/discovery controls beyond the current consent-bound Factor policy;
- approved localized resource catalogs;
- limited AI rephrasing/summarization behind purpose-specific consent.

No later feature may reintroduce six-axis scoring, global compatibility, hidden partner inference or a core paywall by default.

## 10. Metrics

- pair activation and time to first safe summary;
- matching profile activation, qualitative feed-to-Like/response/connection/Pair conversion and stale-grant/session rates;
- full-loop completion and next-cycle starts;
- accept/replace/skip and activity feedback completion;
- retention by completed pair cycles;
- retries/conflicts/duplicate canonical artifacts;
- privacy/safety incidents;
- critical route p95/error rate.

Analytics contains only allowlisted technical events, never answers, notes, summary text or user/pair ids.

## 11. External launch decisions

Repository completion is not production deployment evidence. Public traffic still requires named owners for jurisdiction/terms/retention, expert review of sensitive Russian help/content, real Discord two-session verification, production secrets/topology/backup/restore/alerts/incident response and explicit deployment authorization.
