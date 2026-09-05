import { DomainError } from "@/domain/errors";
import type { DevelopmentContent } from "./catalog";

export function developmentPeriod(date: Date): string {
  const monday = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  return monday.toISOString().slice(0, 10);
}

export function validateDevelopmentAnswers(
  content: DevelopmentContent,
  answers: Array<{ question: number; value: number | null }>,
) {
  const sorted = [...answers].sort((a, b) => a.question - b.question);
  if (
    sorted.length !== content.prompts.length ||
    sorted.some(
      (answer, i) =>
        answer.question !== i ||
        (answer.value !== null &&
          (!Number.isInteger(answer.value) ||
            answer.value < 0 ||
            answer.value > 3)),
    )
  ) {
    throw new DomainError({
      code: "VALIDATION_ERROR",
      status: 400,
      message: "Ответьте на каждый пункт или явно пропустите его.",
    });
  }
  return sorted;
}
