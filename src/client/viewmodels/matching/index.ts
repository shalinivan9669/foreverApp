import type {
  MatchFitDTO,
  MatchLikeAction,
  MatchLikeStatus,
  MatchingConnectionDTO,
  MatchingPreferenceDTO,
} from "@/client/api/match.api";

export type MatchFitViewModel = {
  title: string;
  description: string;
  toneClassName: string;
  confidenceLabel: string;
};

const confidenceLabels: Record<MatchFitDTO["confidence"], string> = {
  LOW: "Пока мало данных",
  MEDIUM: "Есть основа для знакомства",
  HIGH: "Вывод опирается на заполненные профили",
};

export const toMatchFitViewModel = (fit: MatchFitDTO): MatchFitViewModel => {
  const common = {
    confidenceLabel: confidenceLabels[fit.confidence],
  };

  if (fit.label === "PROMISING") {
    return {
      ...common,
      title: "Многообещающее знакомство",
      description: "В ваших ожиданиях есть несколько созвучных направлений.",
      toneClassName: "border-emerald-200 bg-emerald-50 text-emerald-900",
    };
  }

  if (fit.label === "WORKABLE") {
    return {
      ...common,
      title: "Стоит присмотреться",
      description: "Знакомство может раскрыться в спокойном диалоге.",
      toneClassName: "border-amber-200 bg-amber-50 text-amber-950",
    };
  }

  return {
    ...common,
    title: "Нужно больше данных",
    description: "Мы не делаем выводов, пока информации недостаточно.",
    toneClassName: "border-slate-200 bg-slate-50 text-slate-800",
  };
};

export const matchingLikeStatusLabel = (status: MatchLikeStatus): string => {
  const labels: Record<MatchLikeStatus, string> = {
    SENT: "Интерес отправлен",
    VIEWED: "Интерес просмотрен",
    RESPONDED: "Получен ответ",
    DECLINED: "Знакомство завершено",
    WITHDRAWN: "Отозвано",
  EXPIRED: "Срок ответа истёк",
    BLOCKED: "Контакт заблокирован",
    MATCHED: "Взаимный интерес",
  };
  return labels[status];
};

export const matchingLikeActionLabel = (action: MatchLikeAction): string => {
  const labels: Record<MatchLikeAction, string> = {
    WITHDRAW: "Отозвать интерес",
  RESPOND: "Ответить",
    ACCEPT: "Принять ответ",
    DECLINE: "Вежливо отказаться",
    BLOCK: "Заблокировать",
  };
  return labels[action];
};

export const matchingConnectionStageLabel = (
  stage: MatchingConnectionDTO["stage"],
): string => {
  const labels: Record<MatchingConnectionDTO["stage"], string> = {
    MATCHED: "Вы понравились друг другу",
    TALKING: "Вы общаетесь",
    DATING: "Вы встречаетесь",
    COUPLE_CONFIRMED: "Отношения подтверждены",
  };
  return labels[stage];
};

export const matchingConfirmationCopy = (
  connection: MatchingConnectionDTO,
): { title: string; description: string } => {
  if (connection.status === "CLOSED" || connection.status === "BLOCKED") return {
    title: "Знакомство завершено",
    description: "Продолжение тем и создание пары здесь недоступны. Можно вернуться к личному развитию или другим знакомствам.",
  };
  if (connection.status === "PAUSED") return {
    title: "Знакомство на паузе",
    description: "Новые ответы и предложение пары доступны после возобновления. Пауза продолжает занимать одно из трёх мест.",
  };
  if (connection.confirmation.state === "CONFIRMED") {
    return {
      title: "Отношения подтверждены",
      description: "Режим пары доступен обоим участникам.",
    };
  }
  if (connection.confirmation.requestedByMe) {
    return {
      title: "Предложение отправлено",
      description:
        "Пара появится только после отдельного подтверждения партнёра.",
    };
  }
  if (connection.confirmation.state === "PENDING") {
    return {
      title: "Вам предложили подтвердить отношения",
      description: "Подтвердите только если это обоюдное и осознанное решение.",
    };
  }
  return {
    title: "Когда будете готовы",
    description:
      "Один участник предлагает стать парой, второй подтверждает отдельно.",
  };
};

export const matchingPreferenceLabel = (
  preference: MatchingPreferenceDTO,
): string =>
  preference.label?.trim() || preference.factorKey.replace(/[._-]+/g, " ");

/** Owner-facing names match the fields in the card form, never internal factor IDs. */
export const matchingRequiredTopicLabel = (topic: string): string => {
  const labels: Record<string, string> = {
    "lifePlans.relationship.intent": "Формат знакомства",
    "lifePlans.family.childrenIntent": "Отношение к детям",
  };
  return labels[topic] ?? "Дополнительные данные для подбора";
};

export const matchingCategoryOptions = (factorKey: string): ReadonlyArray<{ value: string; label: string }> | null => {
  if (factorKey === "lifePlans.relationship.intent") return [
    { value: "GETTING_TO_KNOW", label: "Сначала познакомиться" },
    { value: "OPEN_TO_RELATIONSHIP", label: "Открыт(а) к отношениям" },
    { value: "LOOKING_FOR_LONG_TERM", label: "Ищет долгосрочные отношения" },
  ];
  if (factorKey === "lifePlans.family.childrenIntent") return [
    { value: "YES", label: "Хочет детей" },
    { value: "NO", label: "Не планирует детей" },
    { value: "UNSURE", label: "Пока не уверен(а)" },
  ];
  return null;
};

export const importanceLabel = (
  importance: MatchingPreferenceDTO["importance"],
): string => {
  const labels: Record<MatchingPreferenceDTO["importance"], string> = {
    LOW: "Не принципиально",
    MEDIUM: "Желательно",
    HIGH: "Важно",
    CRITICAL: "Критически важно",
  };
  return labels[importance];
};

export const flexibilityLabel = (
  flexibility: MatchingPreferenceDTO["flexibility"],
): string => {
  const labels: Record<MatchingPreferenceDTO["flexibility"], string> = {
    FLEXIBLE: "Готов(а) к разным вариантам",
    PREFER: "Есть предпочтение",
    IMPORTANT: "Граница важна",
    NON_NEGOTIABLE: "Не готов(а) отступать",
  };
  return labels[flexibility];
};

export const matchingPreferencesForSave = (
  preferences: readonly MatchingPreferenceDTO[],
): MatchingPreferenceDTO[] =>
  preferences.filter((preference) => preference.useAllowed).map((preference) => ({
    factorKey: preference.factorKey,
    target: preference.target,
    importance: preference.importance,
    flexibility: preference.flexibility,
    constraintMode: preference.constraintMode,
    useAllowed: preference.useAllowed,
  }));
