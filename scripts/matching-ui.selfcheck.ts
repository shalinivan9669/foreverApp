import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import CandidateCard from "@/components/matching/CandidateCard";
import LikeComposer from "@/components/matching/LikeComposer";
import MatchingConnectionCard from "@/components/matching/MatchingConnectionCard";
import MatchingErrorPanel from "@/components/matching/MatchingErrorPanel";
import MatchingCardForm from "@/components/matching/MatchingCardForm";
import MatchingPreferencesForm from "@/components/matching/MatchingPreferencesForm";
import { matchingPreferencesBodySchema } from "@/app/api/match/schemas";
import SearchPage from "@/app/search/page";
import MatchCardPage from "@/app/match-card/create/page";
import MatchInboxPage from "@/app/match/inbox/page";
import MatchingProfileTabPage from "@/app/profile/(tabs)/matching/page";
import MatchLikeDetailPage from "@/app/match/like/[id]/page";
import { matchingPreferencesForSave } from "@/client/viewmodels/matching";
import { matchingComposerReadiness } from "@/client/viewmodels/matchingComposer";
import type { MatchPublicCardDTO } from "@/client/api/match.api";
import type { MatchingStatementReaction } from "@/lib/contracts/matchingProduct";

const run = async (): Promise<void> => {
  const cardFormMarkup = renderToStaticMarkup(createElement(MatchingCardForm, {
    initial: null,
    requiredDataReady: false,
    missingRequiredTopics: ["lifePlans.family.childrenIntent", "lifePlans.relationship.intent", "future.internal.requiredTopic"],
    saving: false,
    onSave: async () => true,
  }));
  assert.match(cardFormMarkup, /Для поиска осталось подготовить: Отношение к детям, Формат знакомства, Дополнительные данные для подбора/);
  assert.match(cardFormMarkup, /Выберите ответы в разделе/);
  assert.match(cardFormMarkup, /href="#matching-relationship-intent"/);
  assert.match(cardFormMarkup, /id="matching-relationship-intent"/);
  assert.doesNotMatch(cardFormMarkup, /lifePlans|childrenIntent|future\.internal/);
  assert.match(cardFormMarkup, /id="matching-publish"[^>]*disabled=""/, 'unready draft cannot silently attempt publication');
  const candidateGrant = "secret-candidate-grant-must-not-render";
  const candidateMarkup = renderToStaticMarkup(
    createElement(CandidateCard, {
      candidate: {
        candidate: { id: "u2", username: "Алекс", avatar: "" },
        card: {
          requirements: ["Уважение", "Диалог", "Надёжность"],
          give: ["Поддержка", "Тепло", "Честность"],
          questions: ["Что помогает доверять?", "Как вы отдыхаете?"],
        },
        fit: {
          label: "LOW_INFORMATION",
          confidence: "LOW",
          explanations: ["Пока мало данных для подробного объяснения"],
        },
        candidateGrant,
      },
      onOpen: () => undefined,
    }),
  );
  assert.match(candidateMarkup, /Нужно больше данных/);
  assert.match(candidateMarkup, /Пока мало данных/);
  assert.doesNotMatch(candidateMarkup, /%|matchScore|score/i);
  assert.doesNotMatch(candidateMarkup, new RegExp(candidateGrant));

  const composerMarkup = renderToStaticMarkup(
    createElement(LikeComposer, {
      questions: ["Что помогает доверять?", "Как вы отдыхаете?"],
      loading: false,
      onSubmit: async () => true,
    }),
  );
  assert.match(composerMarkup, /Начать ответ/);
  assert.match(composerMarkup, /не обязывает другого человека отвечать/);
  assert.doesNotMatch(composerMarkup, /<textarea/, 'viewing a candidate must not immediately open a response form');
  const v2Card: MatchPublicCardDTO = {
    requirements: ['Уважение', 'Диалог', 'Надёжность'], give: ['Поддержка', 'Тепло', 'Честность'],
    boundaries: ['Граница А', 'Граница Б', 'Граница В'], boundaryDealbreakers: [true, false, false],
    questions: ['Первый вопрос', 'Второй вопрос', 'Третий вопрос'],
  };
  const savedPlansMarkup = renderToStaticMarkup(createElement(MatchingCardForm, {
    initial: { ...v2Card, give: ['Поддержка', 'Тепло', 'Честность'], active: false, ageRange: { min: 18, max: 40 }, maxDistanceKm: 50, actual: { relationshipIntent: 'LOOKING_FOR_LONG_TERM', childrenIntent: 'UNSURE' } },
    requiredDataReady: false,
    missingRequiredTopics: ['lifePlans.relationship.intent', 'lifePlans.family.childrenIntent'],
    saving: false,
    onSave: async () => true,
  }));
  assert.match(savedPlansMarkup, /Ваши ответы о планах сохранены/);
  assert.match(savedPlansMarkup, /href="#preferences-title"/);
  assert.match(savedPlansMarkup, /Без вашего разрешения данные не используются для поиска/);
  assert.doesNotMatch(savedPlansMarkup, /В сохранённых данных пока не указаны|lifePlans\./);
  const empty = matchingComposerReadiness(v2Card, ['', '', ''], [], [false, false, false]);
  assert.equal(empty.ready, false);
  assert.equal(empty.statements.length, 9);
  const reactions: MatchingStatementReaction[] = empty.statements.map(({ section, index }) => ({ section, index, reaction: 'NEUTRAL' }));
  assert.equal(matchingComposerReadiness(v2Card, ['A', 'B', 'C'], reactions, [true, true, true]).ready, true);
  assert.equal(matchingComposerReadiness(v2Card, ['A', 'B', ' '], reactions, [true, true, true]).ready, false, 'third mandatory answer cannot be omitted');
  assert.equal(matchingComposerReadiness(v2Card, ['A', 'B', 'C'], [...reactions.slice(1), reactions[1]], [true, true, true]).ready, false, 'duplicate reaction cannot replace a missing statement');
  assert.equal(matchingComposerReadiness(v2Card, ['A', 'B', 'C'], reactions, [true, true, false]).ready, false, 'all promises require explicit confirmation');
  const disagree = (index: number) => reactions.map((item) => item.section === 'boundaries' && item.index === index ? { ...item, reaction: 'AGAINST' as const } : item);
  assert.equal(matchingComposerReadiness(v2Card, ['A', 'B', 'C'], disagree(0), [true, true, true]).ready, false);
  assert.equal(matchingComposerReadiness(v2Card, ['A', 'B', 'C'], disagree(1), [true, true, true]).ready, true, 'ordinary disagreement remains allowed');
  assert.equal(matchingComposerReadiness(undefined, ['A', 'B'], [], [true, true, true]).ready, true, 'legacy two-question flow remains valid');

  const connectionMarkup = renderToStaticMarkup(
    createElement(MatchingConnectionCard, {
      connection: {
        id: "connection-1",
        participant: { id: "u2", username: "Алекс", avatar: "" },
        stage: "MATCHED",
        status: "ACTIVE",
        confirmation: {
          state: "PENDING",
          requestedByMe: false,
          confirmedByMe: false,
          confirmedByPartner: true,
        },
        allowedActions: ["CONFIRM", "CANCEL"],
      },
      onAction: async () => true,
    }),
  );
  assert.match(connectionMarkup, /Вам предложили подтвердить отношения/);
  assert.match(connectionMarkup, /Подтвердить отношения/);
  assert.match(connectionMarkup, /Отменить предложение/);
  assert.doesNotMatch(connectionMarkup, /создана автоматически/i);

  const errorMarkup = renderToStaticMarkup(
    createElement(MatchingErrorPanel, {
      error: {
        kind: "state_conflict",
        code: "STATE_CONFLICT",
        message: "backend-internal-message",
        status: 409,
      },
      onRetry: () => undefined,
    }),
  );
  assert.match(errorMarkup, /Состояние уже изменилось/);
  assert.doesNotMatch(errorMarkup, /backend-internal-message/);

  const templatePreference = {
    factorKey: "lifePlans.relationship.intent",
    target: {
      kind: "CATEGORICAL_SET" as const,
      allowedValues: ["GETTING_TO_KNOW", "LOOKING_FOR_LONG_TERM"],
    },
    importance: "HIGH" as const,
    flexibility: "FLEXIBLE" as const,
    constraintMode: "NONE" as const,
    useAllowed: false,
  };
  assert.deepEqual(
    matchingPreferencesForSave([templatePreference]),
    [],
    "untouched catalog defaults must not be submitted as conscious preferences",
  );
  assert.equal(
    matchingPreferencesForSave([{ ...templatePreference, useAllowed: true }])
      .length,
    1,
    "explicit matching-use grant should include a preference in save payload",
  );
  const catalogPreference = { ...templatePreference, label: 'Формат знакомства', hardAllowed: true, useAllowed: true };
  assert.equal(matchingPreferencesBodySchema.safeParse({ revision: 0, preferences: [catalogPreference] }).success, false, 'server deliberately rejects GET presentation-only fields on PUT');
  const preparedPreferences = matchingPreferencesForSave([catalogPreference]);
  assert.equal(matchingPreferencesBodySchema.safeParse({ revision: 0, preferences: preparedPreferences }).success, true, 'actual catalog DTO must become a valid strict preferences PUT body');
  assert.equal('label' in preparedPreferences[0], false);
  assert.equal('hardAllowed' in preparedPreferences[0], false);
  const preferencesMarkup = renderToStaticMarkup(createElement(MatchingPreferencesForm, { revision: 0, initial: [{ ...catalogPreference, useAllowed: false }], saving: false, onSave: async () => true }));
  assert.match(preferencesMarkup, /Сначала познакомиться/);
  assert.match(preferencesMarkup, /Ищет долгосрочные отношения/);
  assert.match(preferencesMarkup, /Для поиска обязательны формат знакомства и отношение к детям/);
  assert.doesNotMatch(preferencesMarkup, /GETTING_TO_KNOW|LOOKING_FOR_LONG_TERM/);
  const emptyPreferenceMarkup = renderToStaticMarkup(createElement(MatchingPreferencesForm, { revision: 0, initial: [{ ...catalogPreference, target: { kind: 'CATEGORICAL_SET', allowedValues: [] } }], saving: false, onSave: async () => true }));
  assert.match(emptyPreferenceMarkup, /Выберите хотя бы один подходящий вариант: Формат знакомства/);

  const pageElements = [
    SearchPage(),
    MatchCardPage(),
    MatchInboxPage(),
    MatchingProfileTabPage(),
    await MatchLikeDetailPage({ params: Promise.resolve({ id: "like-1" }) }),
  ];
  for (const page of pageElements) {
    assert.ok(page, "matching page must return a functional view");
  }

  const activeMarkup = [
    candidateMarkup,
    composerMarkup,
    connectionMarkup,
    errorMarkup,
  ].join("\n");
  assert.doesNotMatch(
    activeMarkup,
    /[ГђГ‘][\u0080-\u00BF]/,
    "matching UI contains mojibake",
  );

  console.log("Matching UI self-check passed.");
};

void run();
