import type { DevelopmentContent } from "@/domain/model/development/catalog";
import type { DevelopmentRunType } from "@/models/DevelopmentRun";

export type DevelopmentCardDTO = Omit<
  DevelopmentContent,
  "steps" | "prompts"
> & {
  locked: boolean;
  completedCount: number;
};
export type DevelopmentRunDTO = {
  id: string;
  contentKey: string;
  periodKey: string;
  pairId: string | null;
  status: DevelopmentRunType["status"];
  myCompletion: boolean;
  partnerCompleted: boolean;
  completedAt: string | null;
};
export const toDevelopmentRunDTO = (
  run: DevelopmentRunType,
  userId: string,
): DevelopmentRunDTO => ({
  id: run._id,
  contentKey: run.contentKey,
  periodKey: run.periodKey,
  pairId: run.pairId ?? null,
  status: run.status,
  myCompletion: run.completedUserIds.includes(userId),
  partnerCompleted: run.completedUserIds.some((id) => id !== userId),
  completedAt: run.completedAt?.toISOString() ?? null,
});

export type DevelopmentOverviewDTO = {
  suggestion: {
    contentKey: string;
    title: string;
    reason: string;
    basedOn: "SELF_REFLECTION" | "EXPLORATION";
  };
  content: DevelopmentCardDTO[];
  domains: Array<{
    key: string;
    title: string;
    description: string;
    factorDomains: readonly string[];
  }>;
  programs: Array<{
    key: string;
    title: string;
    contentKeys: readonly string[];
    completedSteps: number;
  }>;
  recent: DevelopmentRunDTO[];
};
export type DevelopmentDetailDTO = {
  content: DevelopmentContent;
  run: DevelopmentRunDTO;
  responseOptions: readonly string[];
  ownResult: {
    feedback: string;
    privateNote: string;
    answers: Array<{ question: number; value: number | null }>;
  } | null;
};
export type DevelopmentCompleteInput = {
  runId: string;
  answers: Array<{ question: number; value: number | null }>;
  feedback: "HELPFUL" | "NEUTRAL" | "NOT_FOR_ME";
  privateNote: string;
};
