# Safety/help and retention external review packet

Status: **DRAFT FOR EXTERNAL REVIEW — NOT APPROVED FOR PUBLICATION OR LAUNCH**.

This packet records implemented behavior and the decisions required from named external reviewers. It is not legal advice, a safety/crisis expert opinion, or publication approval. The gate remains open until decisions are recorded for the exact release artifact, catalog version and launch jurisdiction.

## 1. Review identity

| Field | Current value |
| --- | --- |
| Prepared | 2026-08-13 |
| Inspected base HEAD | `d92f1cb41cef131a5c25f77717f2f8ce0240f7da` |
| Exact release artifact | **Not assigned**; the worktree was not clean when this packet was prepared |
| Help catalog | `help-ru-v1`, locale `ru` |
| Intended audience | Two adults already in a relationship; voluntary pair participation |
| Launch country/jurisdiction | **Not provided — blocking** |
| Controller/operator identity and privacy contact | **Not provided — blocking** |
| Safety/crisis content reviewer | **Not provided — blocking** |
| Legal/privacy reviewer | **Not provided — blocking** |
| Publication owner and review-expiry owner | **Not provided — blocking** |
| Backup/restore and retention owner | **Not provided — blocking** |

The final decision record must replace the candidate-artifact placeholder with an immutable build identifier and confirm that the reviewed source below is byte-for-byte the content in that artifact.

## 2. Product and claim boundary presented for review

- Forever is a private Discord Embedded App for two adults already in a relationship. It is not a dating/matching score product.
- Participation, onboarding inputs, weekly inputs, PartnerSignal sends, Pair lifecycle actions and account deletion are explicit user actions.
- The product does not claim to diagnose a person or relationship, detect danger automatically, provide therapy/medical advice, contact a partner or helper automatically, or replace crisis/emergency services.
- Pair-facing output is qualitative and must not reveal a peer's raw answers, notes, exact Factor values, numeric confidence/evidence, SafetyGate state/reason or compatibility score.
- SafetyGate is owner-private and may only narrow that owner's eligible activity choices to neutral low-load options. It does not alter Pair Summary or notify the partner.
- Opening help is private and creates no partner notification.

Technical sources: [PRODUCT_SPEC.md](./PRODUCT_SPEC.md), [SECURITY.md](./SECURITY.md), [TARGET_DOMAIN_OPERATIONS.md](./TARGET_DOMAIN_OPERATIONS.md), and `src/domain/model/privacy/disclosure.ts`.

## 3. Exact Russian help catalog submitted for review

Source of truth: `src/client/content/helpCatalog.ts`. Rendering surface: `src/app/profile/help/page.tsx`.

### Crisis limitation notice (`immediate-danger`)

**Ограничения в кризисной ситуации**

> Forever не является экстренной службой, кризисным центром или медицинским сервисом. Приложение не распознаёт опасность автоматически и не связывается за вас с партнёром, близкими или службами помощи. Если есть непосредственная угроза жизни или безопасности, обратитесь в местную экстренную службу или к человеку, которому доверяете.

### Еженедельный цикл (`weekly-cycle`)

Короткая сверка помогает паре увидеть общий ритм без раскрытия личных ответов.

- Каждый отвечает отдельно; общая сводка готова только после ответов обоих.
- Партнёр не видит точные значения и личную заметку из вашей формы.
- Если цикл пропущен, система не подставляет ответы за вас.

### Границы приватности (`privacy-boundaries`)

По умолчанию личные данные остаются у их владельца.

- Личный дневник, приватные заметки и настройки SafetyGate не показываются партнёру.
- Парная часть получает безопасные общие сигналы, а не чужие сырые ответы.
- Свои данные можно скачать в настройках аккаунта.
- Action: «Открыть настройки данных» → `/profile/settings`.

### Сигналы партнёру (`partner-signals`)

Сигнал — это отдельная фраза, которую вы решаете отправить сами.

- Черновик остаётся личным, пока вы явно не подтвердите отправку.
- Партнёру передаётся выбранный текст, а не дневник или подробности состояния.
- Forever не читает личные переписки за пределами приложения.

### Пауза, завершение и новое подключение (`pair-lifecycle`)

Это разные действия с разными последствиями.

- Пауза временно останавливает новые совместные действия; пару можно возобновить.
- Завершение закрывает текущую пару и не равно удалению аккаунта.
- После завершения новое подключение начинается через новое взаимное приглашение.

### SafetyGate (`safety-gate`)

Приватная настройка оставляет только нейтральные активности с низкой нагрузкой.

- Партнёр не получает причину включения и не видит ваш выбор.
- Настройка не меняет общую сводку или результат пары.
- SafetyGate можно включить или выключить в любой момент, пока пара доступна.
- Action: «Открыть SafetyGate» → `/profile/safety`.

The reviewer must decide whether this generic copy is appropriate for the named jurisdiction, whether local crisis resources are required, who verifies those resources, and how their accuracy/availability is monitored. No jurisdiction-specific resource may be added or presented as an emergency service without that decision.

## 4. Implemented safety/privacy behavior to validate

| Area | Implemented boundary | Evidence requested from reviewer |
| --- | --- | --- |
| Help access | Private; no partner notification; no automatic diagnosis or contact | Claims/copy acceptable for named jurisdiction |
| SafetyGate | Owner-private boolean; only narrows owner activity eligibility; revoked at Pair end | Safety model and wording acceptable; no implied protection guarantee |
| PartnerSignal | Private draft until explicit confirm; receiver gets exact confirmed text; audit stores no text | Consent/send wording and retention acceptable |
| Weekly/Pair Summary | One-sided input discloses no pair signal; peer raw input/note stays private | Privacy explanation is clear and non-misleading |
| Pair end/reconnect | End is terminal for the context; reconnect creates a new Pair context | User consequences are adequately explained |
| Export | Bounded owner data plus permitted shared summaries; no peer raw source | Scope and user description are adequate |

Repository checks validate implementation invariants; they do not constitute expert or legal approval.

## 5. Technical retention inventory

This is an implementation inventory, not an approved retention schedule.

| Category | Current runtime behavior | Decision still required |
| --- | --- | --- |
| PartnerSignal text | `expiresAt` at 30 days; Mongo TTL index | Purpose, jurisdictional basis and backup-copy timing |
| Audit events | `short=14`, `abuse=30`, `long=90` days; Mongo TTL index | Category mapping, incident/legal-hold exceptions and access owner |
| Notifications | `expiresAt` at 180 days; Mongo TTL index | Whether 180 days is necessary and adequately disclosed |
| Idempotency records | Mongo TTL at 172800 seconds (48 hours) | Confirm operational necessity and payload-minimization claim |
| SafetyGate | `UNTIL_REVOKED_OR_PAIR_END` | Confirm deletion/revocation wording and backup handling |
| Factor evidence | Semantic classes include `OWNER_CONTROLLED`, `PAIR_CONTEXT`, `SAFETY_CRITICAL`; these are not durations | Define exact duration/trigger per class and exceptions |
| Questionnaire/check-in/history artifacts | Bounded reads and lifecycle/deletion handling; no complete externally approved duration schedule | Define category-level retention and Pair-end/account-deletion behavior |
| Executed PrivacyRequest | Owner identity becomes `deleted:<one-way subject hash>`; schema has no TTL/expiry | Define purpose, exact duration, access, deletion and legal-hold rules |
| Production backups | Runbook requires encrypted named backup and isolated restore proof | Provider/region, cadence, retention, RPO/RTO, deletion propagation and legal holds |

Technical sources include `src/domain/services/partnerSignal.service.ts`, `src/lib/audit/eventTypes.ts`, `src/domain/services/notification.service.ts`, `src/models/IdempotencyRecord.ts`, `src/models/SafetyGate.ts`, `src/domain/model/evidence/evidence.ts`, `src/models/PrivacyRequest.ts`, and [RELEASE_RUNBOOK.md](./RELEASE_RUNBOOK.md).

## 6. Export, deletion and restore questions

Implemented account deletion is two-step and destructive:

1. explicit request and `DELETE_ACCOUNT` confirmation;
2. durable session-version revocation before destructive work;
3. active Pair termination;
4. account, owner-private and affected pair-scoped artifact deletion;
5. retention of a pseudonymized PrivacyRequest lifecycle record;
6. old session replay denied.

The external reviewers must resolve and approve:

- how the shared-Pair impact is described to both participants;
- whether the retained pseudonymous lifecycle record is necessary and for exactly how long;
- what users are told about live-data deletion versus backup expiry;
- how a deletion tombstone/request is reapplied after a restore without re-identifying or restoring access;
- legal-hold and incident exceptions, authorized roles and auditability;
- controller/privacy contact and the process for access, export and deletion requests.

The current UI explains irreversibility, account deletion and session revocation, but the final reviewer must verify copy covering shared-Pair effects, backup timing and retained pseudonymous lifecycle evidence.

## 7. Operations evidence attachment

The operations owner must attach a sanitized record for the exact target:

| Evidence | Required record |
| --- | --- |
| Backup | Provider/region, encrypted backup alias, age/cadence and retention |
| Restore drill | Isolated target alias, date, operator, duration, outcome and integrity checks |
| Objectives | Approved RPO/RTO and measured comparison |
| Deletion propagation | Procedure and proof for restored data/backups |
| Topology | Replica-set/transaction capability and least-privilege roles, without credentials |
| Monitoring | Health/SLO dashboards, tested alert delivery, privacy/canonical-duplicate alarms |
| Ownership | Named on-call and privacy incident owner with escalation path |
| Rollback | Exact NEW_ONLY-compatible artifact and index/migration compatibility |

## 8. Required decision records

### Safety/content expert

- Name, organization and relevant credentials:
- Jurisdiction/language competence:
- Exact artifact and catalog version reviewed:
- Scope and materials reviewed:
- Disposition: `APPROVED` / `APPROVED_WITH_CHANGES` / `REJECTED`:
- Required changes and verification evidence:
- Decision date and review-expiry/update trigger:
- Signature or authoritative reference:

### Legal/privacy reviewer

- Name, role and organization:
- Launch jurisdiction and controller/operator identity:
- Exact artifact and documents reviewed:
- Approved retention schedule/version:
- Export/deletion/shared-Pair/backup conclusions:
- Required user-facing copy or process changes:
- Disposition and date:
- Signature or authoritative reference:

### Operations owner

- Name/on-call role:
- Target/deploy artifact aliases:
- Backup/restore evidence reference:
- RPO/RTO and backup retention:
- Deletion-after-restore procedure:
- Alert-delivery evidence and escalation path:
- Go/no-go disposition and date:

## 9. Current external blockers

The gate remains open because none of the following were provided:

1. launch jurisdiction/countries and data-residency scope;
2. named qualified Russian-language safety/crisis reviewer and signed decision for `help-ru-v1`;
3. named legal/privacy reviewer, controller/operator identity, privacy contact and publication owner;
4. approved per-category retention schedule, especially for PrivacyRequest, Factor evidence, shared Pair artifacts, backup copies and legal holds;
5. production backup owner/provider/region, retention, RPO/RTO, restore drill and deletion-after-restore proof.

Do not mark safety/help or retention approved from this packet alone.
