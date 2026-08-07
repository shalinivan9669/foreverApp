# ForeverApp / «Вместе»: операционные границы домена

Статус: приложение к `docs/TARGET_DOMAIN_MODEL.md`. Дата решения: 2026-08-07.

Документ фиксирует privacy/consent, safety, versioning, API/storage invariants, scaling и дальний AI boundary. Это требования к будущим задачам, а не уже применённые contracts или schema.

## 1. Privacy и consent

### 1.1 Capture policy

Для каждого raw evidence отдельно фиксируются:

- владелец и допустимый owner read;
- personal computation permission;
- pair computation permission;
- raw partner disclosure permission;
- retention class;
- consent/version timestamp.

Пользовательские режимы MVP:

- `PRIVATE` — доступ владельцу, не участвует в Pair Summary;
- `PAIR_MODEL_ONLY` — может участвовать в pair computation, raw answer скрыт;
- `SHARED` — raw answer можно показать в явно предусмотренном UI.

Новая policy не раскрывает старые данные задним числом без explicit consent.

### 1.2 Derived disclosure

Производный результат имеет отдельный scope:

- `OWNER_ONLY`;
- `PAIR_SUMMARY`;
- `SYSTEM_ONLY`.

В паре из двух человек агрегат может раскрыть скрытый ответ. Перед DTO проверяется reverse-disclosure risk; точные значения, цитаты и слишком специфичные причины не выдаются.

### 1.3 Partner signal (`NEXT`)

`SIGNAL_ONLY` не является raw visibility. Signal — новый объект:

1. пользователь выбирает intent;
2. видит точный текст;
3. явно подтверждает отправку;
4. сохраняется минимальная provenance;
5. партнёр получает нейтральное уведомление.

Автоматическая отправка запрещена. Existing experimental flow может сохраняться изолированно, но не является `P0` acceptance criterion.

### 1.4 System-only safety gate

`SYSTEM_ONLY_SAFETY_GATE` — отдельное explicit permission, не четвёртая raw visibility. Оно позволяет только veto eligibility совместной активности.

Gate:

- не участвует в score/ranking;
- не попадает в Pair Summary, partner DTO или explanation;
- не сообщает raw reason больше необходимого exclusion key;
- имеет owner controls, retention class и строго ограниченный operator access;
- удаляется/отзывается по утверждённой policy.

### 1.5 Завершение Pair

До публичного запуска утверждаются:

- что остаётся каждому из личного;
- судьба общей истории;
- export/delete/unlink flow;
- отзыв invites/access;
- создание новой Pair;
- запрет переноса старых private projections в новые отношения.

Intimate, health, safety и partner-observation data не переиспользуются для dating без нового purpose-specific consent и отдельной data boundary.

## 2. Safety boundary

Safety отделено от compatibility, ranking и display. Recommendation engine читает только итоговый system-only veto, не raw safety evidence.

- партнёр не уведомляется о safety answer/flag;
- система не объясняет мотивы потенциально опасного поведения;
- mutual-vulnerability/repair activity исключается при veto;
- operator access минимален и аудируется;
- автоматическая inference не считается надёжным обнаружением насилия;
- help resources добавляются после локальной экспертной/правовой проверки;
- private notes, intimate answers и свободный текст скрыто не анализируются в MVP.

Safety gate может только уменьшить eligibility. Он не увеличивает риск-score, не меняет Pair Summary и не создаёт partner-visible reason.

## 3. Versioning и recomputation

Versioned entities:

- questionnaire/question definitions;
- dimension/evaluation policies;
- activity templates;
- display copy;
- scoring/recommendation algorithms.

Каждый snapshot хранит content/definition versions, input revisions, algorithm version, generatedAt, data status и reason codes.

Новая версия:

- не переписывает старый snapshot;
- создаёт новую projection при необходимости;
- инвалидирует кэш по versioned input hash;
- сохраняет связь с evidence;
- не использует старую inference как новый независимый evidence, чтобы не создавать self-reinforcement loop.

## 4. Storage и API invariants

- Одна active MVP Pair на пользователя.
- Ровно два разных active member id.
- Invite token одноразовый, хешированный и ограниченный TTL/rate limit.
- Один check-in revision на `pairId + cycleId + memberId`.
- Один canonical result на input revisions + algorithm version.
- Recommendation/activity mutations идемпотентны и защищены state machines.
- Клиент отправляет answers, но не назначает score/confidence.
- Pair evaluation вычисляется сервером.
- DTO discriminated по kind и disclosure scope; owner/pair DTO различаются.
- Exact partner values не выдаются без `SHARED` policy.
- API не возвращает raw Mongoose documents.
- Индексы покрывают active Pair, invite expiry, current cycle, activity feed и snapshot lookup.

Raw answers, notes, cookies, tokens, authorization headers и sensitive projections не попадают в logs/audit/analytics payload.

Изменение auth, public API, security model или DB schema требует отдельного operating mode и соответствующих docs/tests/migration reasoning.

## 5. Масштабирование без преждевременной сложности

MVP:

- pure deterministic domain functions;
- синхронный ограниченный recomputation;
- materialized snapshots для чтения;
- typed versioned config/seed для контента;
- feature flags для legacy/new projections;
- observability по duration/outcome/reason code без content payload.

После измеренной нагрузки:

- outbox/background worker;
- идемпотентные jobs;
- cache по input hash;
- отдельные read models;
- publish workflow и минимальный RBAC для операторов.

Redis, event bus, vector database, микросервисы и LLM memory не вводятся заранее.

## 6. Дальний AI boundary

AI допускается после стабильной типизированной основы для:

- перефразирования уже вычисленного объяснения;
- суммаризации разрешённой истории;
- предложения вариантов PartnerSignal с user preview;
- поиска кандидатов контента до deterministic filters;
- opt-in mediated conversation.

AI не:

- выставляет constraints/safety flags как истину;
- диагностирует личность или отношения;
- меняет assessment без evidence;
- читает всю relationship history по умолчанию;
- использует private data для другой цели;
- самостоятельно отправляет вывод партнёру.

Пайплайн:

```text
typed structured data
→ deterministic computation
→ privacy/safety policy
→ минимальный redacted LLM context
→ user-previewed text
```

Для AI-flow обязательны purpose-specific consent, context minimization, redaction, evaluation set, audit metadata, user preview и deterministic safety gate.
