# Карточки анкет (UI-экран)

## Цель
Показать список анкет и дать быстрый старт за 2 сценария: один пользователь или пара, с понятным статусом, прогрессом и CTA.

## Структура карточки (6 блоков)
1) **Заголовок анкеты**
- Название: заголовок + ось (коммуникация/быт/взгляды/финансы/интим/психика)
- Подзаголовок: описание + мини-оффер (суммарно 2 строки)

2) **Короткий факт**
- Кол-во вопросов (1–2 цифры)
- Примерная длительность (1 строка): «X–Y минут»

3) **Сложность и сигналы**
- `estMinutesMin–estMinutesMax`
- `questionCount`
- `level` (уровень 1–5)
- Доп. сигналы: если есть `rewardCoins`, `insightsCount`

4) **Теги**
- Публичные: 0–2, остальное в «+N»
- Системные теги скрываются (`baseline`, `multi-axis`, `starter`)

5) **Статус + CTA**
- `new`: CTA «начать»
- `required`: CTA «обязательная анкета»
- `in_progress`: прогресс-бар + CTA «продолжить»
- `completed`: прогресс 100% + CTA «результат»
- `locked`: CTA disabled + причина

6) **Кнопка перехода**
- Выглядит как основной action
- Текст: «Начать» / «Продолжить» / «Результат»
- Value: текущий статус карточки

## Допустимые статусы
- `new`
- `required`
- `in_progress`
- `completed`
- `locked`

## Сетки и размеры
- 2 колонки на десктопе
- 2 колонки + «+N» для тегов
- Карточки одинаковой высоты (min-h + одинаковые отступы)

## DTO (формат для UI)
Источник данных — DTO от `/api/questionnaires/cards`:

```ts
QuestionnaireCardDTO = {
  id,
  vector,
  audience,
  title,
  subtitle,
  tagsPublic,
  tagsHiddenCount,
  questionCount,
  estMinutesMin,
  estMinutesMax,
  level,
  rewardCoins?,
  insightsCount?,
  status,
  progressPct?,
  lockReason?,
  cta,
  isStarter?,
  pairId?
}
```

## Маппинг из UI DTO в источник
| UI поле | Источник | Примечания/логика |
|---|---|---|
| title | `Questionnaire.title` | берём `ru` → `en` → `_id` |
| subtitle | `Questionnaire.description` | `ru/en`, fallback «Прокачает {axis}» |
| vector | `Questionnaire.axis` | маппинг оси |
| audience | `Questionnaire.target` | `couple` → `pair`, иначе `universal/solo` |
| questionCount | `Questionnaire.questions` | `$size` массива вопросов |
| estMinutesMin/Max | server calc | формула по count |
| level | `Questionnaire.difficulty` + count | base + bump, clamp 1..5 |
| tagsPublic | `Questionnaire.tags` | фильтр системных, максимум 2 |
| tagsHiddenCount | `Questionnaire.tags` | остаток |
| status | sessions + pair | in_progress > completed > required > new, locked если нет пары |
| progressPct | answers | количество уникальных questionId по sessionId+by |
| cta | status | locked/result/continue/start |
| isStarter | `Questionnaire.meta.isStarter` | стартовая анкета |
| pairId | `Pair._id` | если есть активная пара |

## Evidence (path:line)
- `Questionnaire.axis/target/difficulty/questions/meta`: `src/models/Questionnaire.ts:6,23,29,33,51-62`
- `Pair.members`: `src/models/Pair.ts:16,51`
- `PairQuestionnaireSession.status`: `src/models/PairQuestionnaireSession.ts:9,22`
- `PairQuestionnaireAnswer.by/questionId/sessionId`: `src/models/PairQuestionnaireAnswer.ts:4,7-8,17-21`
- DTO/статусы/прогресс: `src/app/api/questionnaires/cards/route.ts:109-190`

## Примечания
- Стартовые анкеты помечаются по `Questionnaire.meta.isStarter`.
- Все карточки приходят из `/api/questionnaires/cards`.
- Прогресс считается по уникальным `questionId` в рамках `sessionId` и `by` (A/B).
