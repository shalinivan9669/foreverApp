import type { DevelopmentOverviewDTO, DevelopmentRunDTO } from "@/lib/dto/development.dto";

type PairStatus = "active" | "paused" | "ended" | null;

export const developmentRunHref = (runId: string) => `/development?run=${encodeURIComponent(runId)}`;

export function resumableDevelopmentRuns(overview: DevelopmentOverviewDTO, pairId?: string | null, pairStatus?: PairStatus) {
  return overview.recent.filter((run) => run.status !== "COMPLETED" &&
    (!run.pairId || (run.pairId === pairId && pairStatus !== "ended")))
    .sort((a, b) => Number(a.myCompletion) - Number(b.myCompletion));
}

export function developmentRunStatus(run: DevelopmentRunDTO, paused = false) {
  if (paused && run.pairId) return "Пара на паузе. Продолжить можно после возобновления.";
  if (run.status === "COMPLETED") return run.pairId ? "Общий итог готов: оба участника завершили занятие." : "Личное занятие завершено.";
  if (run.myCompletion) return "Частичный итог: ваш результат сохранён, ожидаем партнёра.";
  if (run.partnerCompleted) return "Партнёр завершил занятие. Для общего итога остался ваш результат.";
  return "Занятие начато. Можно продолжить и сохранить личный результат.";
}

/** Navigation follows published program order and existing progress, without scoring. */
export function nextDevelopmentProgramStep(program: DevelopmentOverviewDTO["programs"][number], overview: DevelopmentOverviewDTO) {
  return program.contentKeys.map((key) => overview.content.find((item) => item.key === key))
    .find((card) => card && card.completedCount === 0) ?? null;
}

export const isTogetherDevelopment = (kind: string) => ["PAIR_PRACTICE", "TOPIC", "LEISURE"].includes(kind);
