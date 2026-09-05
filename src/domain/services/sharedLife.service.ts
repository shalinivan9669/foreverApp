import mongoose from "mongoose";
import { DomainError } from "@/domain/errors";
import {
  DEFAULT_SHARED_LIFE_SETTINGS,
  type SharedLifeCommand,
  localDateSchema,
  sharedLifeCommandSchema,
} from "@/lib/contracts/sharedLife";
import { PairWorkspace, type PairWorkspaceType } from "@/models/PairWorkspace";
import { toSharedLifeDTO } from "@/lib/dto/sharedLife.dto";
import { pairContextAccess } from "./pairContextAccess.service";

const emptyWorkspace = (pairId: string): PairWorkspaceType => ({
  _id: pairId,
  revision: 0,
  entries: [],
  settings: { ...DEFAULT_SHARED_LIFE_SETTINGS },
  changes: [],
});
const conflict = (): never => {
  throw new DomainError({
    code: "STATE_CONFLICT",
    status: 409,
    message:
      "Партнёр уже изменил общие записи. Обновите страницу и повторите свою правку.",
  });
};

export const sharedLifeService = {
  async get(pairId: string, userId: string, today: string) {
    localDateSchema.parse(today);
    const pair = await pairContextAccess.read(pairId, userId);
    const canonicalPairId = pair._id.toString();
    const workspace =
      (await PairWorkspace.findById(canonicalPairId).lean()) ??
      emptyWorkspace(canonicalPairId);
    return toSharedLifeDTO(workspace, {
      myRole: pair.members[0] === userId ? "A" : "B",
      readOnly: pair.status !== "active",
      today,
    });
  },
  async update(
    pairId: string,
    userId: string,
    command: SharedLifeCommand,
    today: string,
  ) {
    localDateSchema.parse(today);
    const parsed = sharedLifeCommandSchema.parse(command);
    const guardedPair = await pairContextAccess.read(pairId, userId);
    pairId = guardedPair._id.toString();
    if (
      parsed.action === "SAVE" &&
      parsed.data.kind === "TASK" &&
      parsed.data.repeat !== "NONE" &&
      !parsed.data.date
    )
      throw new DomainError({
        code: "VALIDATION_ERROR",
        status: 400,
        message: "Для повторяющейся задачи нужна дата.",
      });
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const pair = await pairContextAccess.fence(pairId, userId, session);
        const actor: "A" | "B" = pair.members[0] === userId ? "A" : "B";
        const existing = await PairWorkspace.findById(pairId)
          .session(session)
          .lean();
        const workspace = existing ?? emptyWorkspace(pairId);
        if (workspace.revision !== parsed.expectedRevision) return conflict();
        const now = new Date();
        if (parsed.action === "SETTINGS") workspace.settings = parsed.settings;
        else if (parsed.action === "DELETE") {
          if (!workspace.entries.some((entry) => entry.id === parsed.entryId))
            return conflict();
          workspace.entries = workspace.entries.filter(
            (entry) => entry.id !== parsed.entryId,
          );
        } else {
          const index = workspace.entries.findIndex(
            (entry) => entry.id === parsed.entryId,
          );
          if (index === -1 && workspace.entries.length >= 300)
            throw new DomainError({
              code: "STATE_CONFLICT",
              status: 409,
              message:
                "В пространстве уже 300 записей. Удалите ненужные записи перед добавлением.",
            });
          const previous = workspace.entries[index];
          const entry = {
            id: parsed.entryId,
            data: parsed.data,
            createdBy: previous?.createdBy ?? actor,
            updatedBy: actor,
            createdAt: previous?.createdAt ?? now,
            updatedAt: now,
          };
          if (index === -1) workspace.entries.push(entry);
          else workspace.entries[index] = entry;
        }
        workspace.revision += 1;
        workspace.changes = [
          ...workspace.changes,
          {
            revision: workspace.revision,
            action: parsed.action,
            actor,
            ...("entryId" in parsed ? { entryId: parsed.entryId } : {}),
            at: now,
          },
        ].slice(-50);
        if (!existing) await PairWorkspace.create([workspace], { session });
        else {
          const result = await PairWorkspace.replaceOne(
            { _id: pairId, revision: parsed.expectedRevision },
            workspace,
            { session, runValidators: true },
          );
          if (result.modifiedCount !== 1) return conflict();
        }
      });
    } finally {
      await session.endSession();
    }
    return this.get(pairId, userId, today);
  },
};
