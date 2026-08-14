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
    EXPIRED: "Срок ответа истёк",
    BLOCKED: "Контакт заблокирован",
    MATCHED: "Взаимный интерес",
  };
  return labels[status];
};

export const matchingLikeActionLabel = (action: MatchLikeAction): string => {
  const labels: Record<MatchLikeAction, string> = {
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
  preferences.filter((preference) => preference.useAllowed);
