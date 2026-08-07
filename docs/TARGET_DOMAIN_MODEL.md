# ForeverApp / «Вместе»: целевая доменная модель

Статус: техническое направление будущих изменений. Дата решения: 2026-08-07.

Документ определяет сущности и вычислительные границы. Privacy, safety, versioning, API/storage invariants, scaling и AI boundary вынесены в `docs/TARGET_DOMAIN_OPERATIONS.md`.

Это не применённая Mongoose-схема и не новый публичный API. Любая реализация или миграция выполняется отдельной задачей после targeted as-is audit.

## 1. Архитектурная формула

```text
versioned definitions + user evidence
→ typed personal assessments
→ pair-safe evaluations
→ PairStateSnapshot
→ deterministic RecommendationDecision
→ PairActivity + separate feedback
→ new evidence and snapshot
```

Слои не смешиваются:

1. **Definition** — что измеряется и как разрешено интерпретировать.
2. **Evidence** — конкретный ответ, check-in, action или feedback.
3. **Assessment** — типизированная производная оценка одного человека.
4. **Pair evaluation** — сравнение одной характеристики участников.
5. **Pair state** — состояние конкретного cycle.
6. **Display projection** — то, что безопасно и понятно показывать.

Evidence — первичный источник. Assessment/snapshot — пересчитываемая проекция. UI DTO — отдельное privacy-safe представление.

## 2. Основные сущности

### `User`

Технический Discord account, lifecycle state и личные настройки. Отдельный `Person` aggregate MVP не нужен: relationship profile является логической проекцией данных пользователя.

### `PairInvite`

Одноразовое приглашение до образования пары: creator, token hash, expiry, status/revocation, accepted user/time и idempotency metadata.

### `Pair`

Область ровно двух активных участников MVP:

- unordered member ids без семантики `A/B`;
- status и lifecycle timestamps;
- контекст конкретных отношений, включая relationship stage;
- ссылки на current cycle/snapshot только как read optimization;
- одна каноническая сторона связи с entitlement.

Будущая семья создаётся отдельным агрегатом, а не расширением `Pair` неограниченным числом участников.

### Контент и evidence

- `QuestionnaireVersion`, `QuestionDefinition`, `AnswerEvidence`;
- `ActivityTemplateVersion`;
- точная locale/content revision, sensitivity и capture policy;
- owner, pair/cycle context, capture time и source revision.

Опубликованная версия immutable. Изменение текста, шкалы или mapping создаёт новую версию.

### Assessments и snapshots

- `DimensionDefinition`;
- `PersonDimensionAssessment`;
- `PairEvaluationSnapshot`;
- `PairStateSnapshot`.

Snapshot хранит версии входов/алгоритма и не содержит raw private text.

### Cycle и action loop

- `WeeklyCycle` и отдельный `WeeklyCheckIn` каждого `memberId`;
- `RecommendationDecision` со статусами offer/accept/skip/replace/expire;
- `PairActivity` как runtime instance;
- независимый `ActivityFeedback` каждого участника.

### Отмеченные расширения

- `PartnerSignal` — `NEXT`; существующий экспериментальный flow можно сохранить изолированно, но не расширять в `P0`;
- `PartnerObservation` — `NEXT`; контекстное восприятие observer о subject внутри конкретной Pair, не истина о человеке и не переносимый профиль;
- `SafetyGate` — `P0`; system-only veto eligibility без partner disclosure;
- `Subscription/Entitlement`, `AuditEvent` — по соответствующему release gate.

## 3. Не один универсальный `VectorValue`

`{ key, value: 0..1 }` теряет семантику. Объект с optional `polarity`, `intensity`, `skillScore` и `stateScore` также неверен: он допускает бессмысленные комбинации.

Канон:

- dimension — одна атомарная характеристика;
- domain profile — набор dimensions одного контекста;
- допустимые поля определяет discriminant `kind`;
- отсутствие данных не равно нулю или нейтральной позиции;
- UI label выводится из versioned definition, а не хранится второй истиной.

`household.cleaning` раскладывается, например, на:

```text
cleanliness_standard          PREFERENCE_AXIS
cleaning_willingness         PREFERENCE_AXIS
cleaning_skill               SKILL
initiative_willingness       ROLE_PREFERENCE
planning_willingness         ROLE_PREFERENCE
execution_willingness        ROLE_PREFERENCE
current_ownership            ROLE_ASSIGNMENT
reported_load                OUTCOME
reported_fairness            OUTCOME
```

«Умеет», «хочет» и «фактически отвечает» — разные значения.

## 4. Типизированные dimensions

Концептуально:

```ts
type PersonDimensionValue =
  | { kind: "STATE"; level: number }
  | { kind: "TRAIT"; level: number }
  | { kind: "SKILL"; skillScore: number }
  | {
      kind: "PREFERENCE_AXIS";
      position: number; // -1..1, оба полюса подписаны
      salience?: number;
    }
  | { kind: "ROLE_PREFERENCE"; willingness: number }
  | {
      kind: "ROLE_ASSIGNMENT";
      ownership: "NONE" | "SHARED" | "PRIMARY";
    }
  | {
      kind: "CONSTRAINT";
      choiceKey: string;
      nonNegotiable: boolean;
    }
  | { kind: "OUTCOME"; level: number };
```

При реализации payload строго типизируется по definition/schema без произвольного `any` или `unknown`.

Metadata assessment:

```text
dimensionKey + definitionVersion
subjectUserId + pairId/contextKey при необходимости
typed value
assessmentConfidence + dataStatus
sourceEvidenceIds + sourceRevision
algorithmVersion + effective interval + createdAt
```

`assessmentConfidence` — надёжность оценки по evidence, не устойчивость позиции и не вероятность истинности. Устойчивость/жёсткость хранится отдельно только при явном ответе пользователя.

Для MVP generic `intensity` не вводится: на bipolar axis оно часто дублирует `abs(position)`. Способность роли моделируется `SKILL`, желание — `ROLE_PREFERENCE`, распределение — `ROLE_ASSIGNMENT`.

## 5. `DimensionDefinition`

Концептуально:

```ts
interface DimensionDefinition {
  key: string;
  version: string;
  domain: string;
  kind: PersonDimensionValue["kind"];
  scale: ScaleDefinition;
  poleLabels?: { negative: string; positive: string };
  evaluationStrategy?: EvaluationStrategy;
  evaluationParams?: EvaluationParams;
  guards?: EvaluationGuard[];
  aggregationGroup?: string;
  sensitivity: "STANDARD" | "SENSITIVE" | "HIGHLY_SENSITIVE";
  defaultCapturePolicy: CapturePolicy;
  explanationKeys: string[];
}
```

Правила:

- key namespaced и version обязательна;
- bipolar axis подписывает оба полюса; `−/+` не означает «плохо/хорошо»;
- `SKILL` хранит score, а `BASIC/INTERMEDIATE/ADVANCED` — display mapping из versioned thresholds;
- вместо уникального кода на каждый key используются немногочисленные стратегии с параметрами;
- correlated dimensions объединяются `aggregationGroup`, чтобы не считаться независимыми доказательствами.

Исторические направления `communication/domestic/personalViews/finance/sexuality/psyche` допустимы как версия контентной таксономии, но не как вечные колонки БД. `Psyche` и «диагностика» не используются в UI без валидированной методологии.

## 6. Pair evaluation

MVP реализует только стратегии, которые реально использует первый контент:

- `SIMILARITY` — близость подтверждённых позиций;
- `TARGET_RANGE` — оба значения в допустимом диапазоне;
- `COMPLEMENT` — разные предпочтения покрывают функцию;
- `BOUNDED_GAP` — умеренная разница допустима, большая требует внимания;
- `ROLE_COVERAGE` — покрытие ролей составного процесса.

Guards отделены от стратегии:

- `INDIVIDUAL_MINIMUM` не компенсируется навыком партнёра;
- `EXPLICIT_CONSTRAINT` использует подтверждённые choice + `nonNegotiable`, а не шумную inference;
- `SafetyGate` только veto eligibility и не участвует в compatibility.

В matching будущего explicit constraint может блокировать кандидата. Для существующей пары тот же факт называется `CRITICAL_DIVERGENCE / REQUIRES_DISCUSSION`, а не приговором отношениям.

```ts
interface PairDimensionEvaluation {
  dimensionKey: string;
  definitionVersion: string;
  relation:
    | "MATCH"
    | "COMPLEMENT"
    | "WORKABLE"
    | "GAP"
    | "DEFICIT"
    | "CONFLICT"
    | "CRITICAL_DIVERGENCE"
    | "INSUFFICIENT_DATA";
  severity: "INFO" | "ATTENTION" | "HIGH";
  blocking: boolean;
  dataStatus: "ENOUGH" | "PARTIAL" | "INSUFFICIENT";
  assessmentConfidence: number;
  reasonCodes: string[];
  inputRevisions: string[];
}
```

`blocking` запрещает только dependent calculation/recommendation, не оценивает существование пары. Внутренний numeric rank допустим, но не показывается как процент и не перекрывает constraint/safety бонусами.

Инварианты:

- сравниваются compatible versions/contexts;
- перестановка участников не меняет relation, только role assignment;
- skill progress не меняет preference/constraint;
- низкая надёжность даёт `INSUFFICIENT_DATA`;
- local complement проверяется вместе с общей reported load/fairness;
- expected activity delta — гипотеза, не доказанный прогресс.

## 7. Pair state и recommendation

```text
PairDimensionEvaluation = соотношение конкретных значений
SkillProgress           = изменение способности человека
PairStateSnapshot       = состояние пары в текущем cycle
SafetyGate              = разрешён ли сценарий вообще
```

Они не превращаются в один «здоровье пары score».

`PairStateSnapshot` immutable для конкретной revision. Display projection показывает максимум четыре нейтральных сигнала: тепло/контакт, напряжение, восстановление, ритм/ресурс. Privacy filter применяется к derived output, а не только raw answers.

Один `PairMode` enum не используется для взаимоисключающих признаков. Decision context содержит совместимые reason-coded flags. Глубокие patterns не генерируются в MVP; позже они остаются подтверждаемыми гипотезами с evidence window.

Recommendation pipeline:

```text
safety/privacy exclusions
→ data sufficiency + current cycle
→ topic/format eligibility + consent
→ cooldown/repetition/recent feedback
→ deterministic rank
→ assigned roles + explanation keys
→ persisted RecommendationDecision
```

Абстрактный `safeDepth 0..5` не доказывает безопасность. Используются sensitivity темы, mutual consent, hard exclusions, ограничения и system-only veto.

Recommendation lifecycle:

```text
OFFERED → ACCEPTED | SKIPPED | REPLACED | EXPIRED
REPLACED → новое OFFERED с reason code + previousDecisionId
ACCEPTED → один идемпотентно связанный PairActivity
```

Роли шаблона задаются как `roles[]`; instance фиксирует `roleKey → participantId`. Назначение зависит от данных/правил, а не пола или позиции в массиве.

## 8. Эволюция текущей модели

Существующие `User.vectors`, six-axis levels, `VectorSnapshot`, scoring services, pair diagnostics, weekly check-in и activity decision engine — база targeted gap analysis, не повод переписать всё.

Переход:

1. инвентаризировать реально используемые keys/sources;
2. определить versions только для MVP-контента;
3. добавить typed projections рядом с legacy reads;
4. сравнить вычисления и DTO disclosure;
5. переключать consumers через feature flag;
6. миграцию/удаление legacy данных обсуждать после подтверждения эквивалентности.

До отдельного `MODEL_SCHEMA_CHANGE` приведённые интерфейсы остаются концептуальными. Операционные правила продолжены в `docs/TARGET_DOMAIN_OPERATIONS.md`.
