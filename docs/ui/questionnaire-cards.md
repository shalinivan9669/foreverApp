# Карточки анкет (UI)

## Цель
Показать список анкет и дать быстрый старт для двух сценариев: персонального и парного, с понятным статусом, прогрессом и CTA.

## Структура карточки
1. Заголовок и ось: коммуникация, быт, взгляды, финансы, интим, психика.
2. Краткое описание (до двух строк).
3. Метрики: `questionCount`, `estMinutesMin..estMinutesMax`, `level`.
4. Теги: до 2 публичных тегов, остальные в формате `+N`.
5. Статус и CTA.
6. Основная кнопка действия.

## Допустимые статусы
- `new`
- `required`
- `in_progress`
- `completed`
- `locked`

## Правила CTA
- `new` -> «Начать»
- `required` -> «Обязательная анкета»
- `in_progress` -> «Продолжить» + прогресс-бар
- `completed` -> «Результат»
- `locked` -> отключенная кнопка + причина блокировки

## DTO для UI
Источник: `GET /api/questionnaires/cards`.

```ts
type QuestionnaireCardDTO = {
  id: string;
  vector: 'communication' | 'domestic' | 'personalViews' | 'finance' | 'sexuality' | 'psyche';
  scope: 'personal' | 'couple';
  audience: 'pair' | 'solo' | 'universal';
  title: string;
  subtitle: string;
  tagsPublic: string[];
  tagsHiddenCount: number;
  questionCount: number;
  estMinutesMin: number;
  estMinutesMax: number;
  level: 1 | 2 | 3 | 4 | 5;
  rewardCoins?: number;
  insightsCount?: number;
  status: 'new' | 'required' | 'in_progress' | 'completed' | 'locked';
  progressPct?: number;
  lockReason?: string;
  cta: 'start' | 'continue' | 'result' | 'locked';
  isStarter?: boolean;
  pairId?: string | null;
};
```

## Ключевые маппинги
- `title` -> `Questionnaire.title` (`ru -> en -> id`).
- `subtitle` -> `Questionnaire.description` (fallback: «Прокачает {axis}»).
- `questionCount` -> количество вопросов анкеты.
- `status/progressPct` -> сессии/ответы пользователя (или пары).
- `isStarter` -> `Questionnaire.meta.isStarter`.

## Evidence
- `src/models/Questionnaire.ts`
- `src/models/Pair.ts`
- `src/models/PairQuestionnaireSession.ts`
- `src/models/PairQuestionnaireAnswer.ts`
- `src/app/api/questionnaires/cards/route.ts`
