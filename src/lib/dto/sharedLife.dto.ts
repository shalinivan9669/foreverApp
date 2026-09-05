import type {
  SharedLifeEntryInput,
  SharedLifeSettings,
} from "@/lib/contracts/sharedLife";
import type { PairWorkspaceType } from "@/models/PairWorkspace";
import {
  nextEntryDate,
  summarizeBudget,
  systemOccasions,
} from "@/domain/model/sharedLife/calendar";
import { sharedLifeEntrySchema } from "@/lib/contracts/sharedLife";

export type SharedLifeEntryDTO = {
  id: string;
  data: SharedLifeEntryInput;
  nextDate: string | null;
  createdBy: "A" | "B";
  updatedBy: "A" | "B";
  updatedAt: string;
};
export type SharedLifeDTO = {
  pairId: string;
  revision: number;
  myRole: "A" | "B";
  readOnly: boolean;
  today: string;
  settings: SharedLifeSettings;
  entries: SharedLifeEntryDTO[];
  budget: ReturnType<typeof summarizeBudget>;
  occasions: ReturnType<typeof systemOccasions>;
  taskLoad: Array<{
    role: "A" | "B" | "BOTH";
    openTasks: number;
    plannedMinutes: number;
  }>;
  changes: Array<{
    revision: number;
    action: string;
    actor: "A" | "B";
    entryId: string | null;
    at: string;
  }>;
};
export function toSharedLifeDTO(
  workspace: PairWorkspaceType,
  input: { myRole: "A" | "B"; readOnly: boolean; today: string },
): SharedLifeDTO {
  const entries = workspace.entries.map((entry) => {
    const data = sharedLifeEntrySchema.parse(entry.data);
    return {
      id: entry.id,
      data,
      nextDate: nextEntryDate(data, input.today),
      createdBy: entry.createdBy,
      updatedBy: entry.updatedBy,
      updatedAt: entry.updatedAt.toISOString(),
    };
  });
  return {
    pairId: workspace._id,
    revision: workspace.revision,
    ...input,
    settings: { ...workspace.settings },
    entries,
    budget: summarizeBudget(entries.map((entry) => entry.data)),
    occasions: systemOccasions(workspace.settings, input.today),
    taskLoad: (["A", "B", "BOTH"] as const).map((role) => ({
      role,
      openTasks: entries.filter(
        ({ data }) =>
          data.kind === "TASK" &&
          data.status === "OPEN" &&
          data.assignee === role,
      ).length,
      plannedMinutes: entries.reduce(
        (sum, { data }) =>
          sum +
          (data.kind === "TASK" &&
          data.status === "OPEN" &&
          data.assignee === role
            ? data.effortMinutes
            : 0),
        0,
      ),
    })),
    changes: workspace.changes.map((change) => ({
      revision: change.revision,
      action: change.action,
      actor: change.actor,
      entryId: change.entryId ?? null,
      at: change.at.toISOString(),
    })),
  };
}
