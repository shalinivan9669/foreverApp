import { createHash } from "node:crypto";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/mongodb";
import { DomainError } from "@/domain/errors";
import {
  DEVELOPMENT_CONTENT_REPOSITORY,
  DEVELOPMENT_DOMAINS,
  DEVELOPMENT_PROGRAMS,
} from "@/domain/model/development/catalog";
import type { DevelopmentContentRepository } from "@/domain/model/development/publications";
import {
  decodeDevelopmentRunCursor,
  DEVELOPMENT_RUN_PAGE_SIZE,
  encodeDevelopmentRunCursor,
} from "@/domain/model/development/runPagination";
import { ECONOMY_CATALOG } from "@/domain/model/economy/catalog";
import {
  developmentPeriod,
  validateDevelopmentAnswers,
} from "@/domain/model/development/progress";
import { DevelopmentRun } from "@/models/DevelopmentRun";
import { DevelopmentCompletion } from "@/models/DevelopmentCompletion";
import { Pair } from "@/models/Pair";
import {
  toDevelopmentRunDTO,
  type DevelopmentCompleteInput,
  type DevelopmentDetailDTO,
  type DevelopmentOverviewDTO,
  type DevelopmentRunPageDTO,
} from "@/lib/dto/development.dto";
import { economyService } from "./economy.service";
import { pairContextAccess } from "./pairContextAccess.service";

const hash = (value: string): string =>
  createHash("sha256").update(value).digest("hex");
const missing = (): never => {
  throw new DomainError({
    code: "NOT_FOUND",
    status: 404,
    message: "Занятие не найдено.",
  });
};
const accessibleRun = async (
  userId: string,
  runId: string,
  mutation = false,
) => {
  await connectToDatabase();
  const run = await DevelopmentRun.findOne({
    _id: runId,
    participantIds: userId,
  }).lean();
  if (!run) return missing();
  if (run.pairId) {
    const pair = await pairContextAccess.read(run.pairId, userId);
    if (mutation && pair.status !== "active") return missing();
  }
  return run;
};

export function createDevelopmentService(
  repository: DevelopmentContentRepository = DEVELOPMENT_CONTENT_REPOSITORY,
) {
  const catalog = repository.listLatest().map(({ content }) => content);
  const contentFor = (key: string) =>
    repository.findLatest(key)?.content ?? missing();
  const publicationForRun = (run: {
    contentKey: string;
    contentRevision: number;
  }) => {
    const publication = repository.findRevision(
      run.contentKey,
      run.contentRevision,
    );
    if (!publication)
      throw new DomainError({
        code: "CONTENT_VERSION_UNAVAILABLE",
        status: 409,
        message:
          "Версия материала для этого прохождения недоступна. Сохранённый результат не изменён. Попробуйте открыть прохождение позже.",
      });
    return publication;
  };
  const lockedContentKeys = async (userId: string) => {
    const locked = new Set<string>();
    for (const item of ECONOMY_CATALOG) {
      if (item.kind !== "CONTENT" || !item.contentKey) continue;
      try {
        await economyService.assertContentAccess({ userId, contentKey: item.contentKey });
      } catch (error) {
        if (error instanceof DomainError && (error.status === 403 || error.status === 402)) locked.add(item.contentKey);
        else throw error;
      }
    }
    return locked;
  };

  return {
    async listUnfinishedRuns(userId: string, cursor?: string): Promise<DevelopmentRunPageDTO> {
      const position = cursor === undefined ? null : decodeDevelopmentRunCursor(cursor);
      await connectToDatabase();
      const accessiblePairs = await Pair.find({
        members: userId,
        status: { $in: ["active", "paused"] },
      }).select({ _id: 1, status: 1 }).lean();
      // Reuse the centralized resource guard, including on subsequent pages.
      const guardedPairs = await Promise.all(accessiblePairs.map((pair) => pairContextAccess.read(pair._id.toString(), userId)));
      const lockedKeys = await lockedContentKeys(userId);
      const scope = hash(JSON.stringify([
        userId,
        guardedPairs.map((pair) => `${pair._id.toString()}:${pair.status}`).sort(),
        [...lockedKeys].sort(),
      ]));
      if (position && position.scope !== scope) {
        throw new DomainError({
          code: "RUN_LIST_CHANGED",
          status: 409,
          message: "Доступ к занятиям изменился. Обновите список с первой страницы.",
        });
      }
      const candidates = await DevelopmentRun.find({
        participantIds: userId,
        status: { $in: ["ACTIVE", "PARTIAL"] },
        contentKey: { $nin: [...lockedKeys] },
        $and: [
          { $or: [
            { pairId: { $exists: false } },
            { pairId: { $in: guardedPairs.map((pair) => pair._id.toString()) } },
          ] },
          ...(position ? [{ $or: [
            { createdAt: { $lt: position.createdAt } },
            { createdAt: position.createdAt, _id: { $lt: position.id } },
          ] }] : []),
        ],
      }).sort({ createdAt: -1, _id: -1 }).limit(DEVELOPMENT_RUN_PAGE_SIZE + 1).lean();
      const runs = candidates.slice(0, DEVELOPMENT_RUN_PAGE_SIZE);
      const last = runs.at(-1);
      return {
        runs: runs.map((run) => toDevelopmentRunDTO(run, userId)),
        nextCursor: candidates.length > DEVELOPMENT_RUN_PAGE_SIZE && last
          ? encodeDevelopmentRunCursor({ createdAt: last.createdAt, id: last._id, scope })
          : null,
      };
    },
    async assertRunAccess(userId: string, runId: string) {
      const run = await accessibleRun(userId, runId, true);
      await economyService.assertContentAccess({
        userId,
        contentKey: run.contentKey,
      });
      publicationForRun(run);
    },
    async overview(userId: string): Promise<DevelopmentOverviewDTO> {
      await connectToDatabase();
      const accessiblePairs = await Pair.find({
        members: userId,
        status: { $in: ["active", "paused"] },
      })
        .select({ _id: 1 })
        .lean();
      const accessibleContext = {
        participantIds: userId,
        $or: [
          { pairId: { $exists: false } },
          {
            pairId: { $in: accessiblePairs.map((pair) => pair._id.toString()) },
          },
        ],
      };
      const [completions, unfinishedRuns, completedRuns, reflections] =
        await Promise.all([
          DevelopmentCompletion.aggregate<{ _id: string; count: number }>([
            { $match: { userId } },
            { $group: { _id: "$contentKey", count: { $sum: 1 } } },
          ]),
          DevelopmentRun.find({
            ...accessibleContext,
            status: { $in: ["ACTIVE", "PARTIAL"] },
          })
            .sort({ createdAt: -1 })
            .limit(30)
            .lean(),
          DevelopmentRun.find({ ...accessibleContext, status: "COMPLETED" })
            .sort({ completedAt: -1 })
            .limit(30)
            .lean(),
          DevelopmentCompletion.find({ userId, "answers.0": { $exists: true } })
            .sort({ createdAt: -1 })
            .limit(20)
            .lean(),
        ]);
      const count = new Map(completions.map((item) => [item._id, item.count]));
      const lockedKeys = await lockedContentKeys(userId);
      const focus = reflections.find(
        (reflection) =>
          !lockedKeys.has(reflection.contentKey) &&
          reflection.answers.some(
            (answer) => answer.value !== null && answer.value <= 1,
          ),
      );
      const focusDomain = focus
        ? (repository.findRevision(focus.contentKey, focus.contentRevision)
            ?.content.domain ?? null)
        : null;
      const next =
        catalog.find(
          (item) =>
            item.kind === "SOLO_PRACTICE" &&
            !count.has(item.key) &&
            !lockedKeys.has(item.key) &&
            (!focusDomain || item.domain === focusDomain),
        ) ??
        catalog.find(
          (item) => item.kind === "SOLO_PRACTICE" && !lockedKeys.has(item.key),
        )!;
      return {
        suggestion: {
          contentKey: next.key,
          title: next.title,
          reason: focusDomain
            ? "В личной саморефлексии вы отметили, что некоторые действия пока даются не всегда. Можно попробовать эту небольшую практику; это предложение по вашему ответу, не диагноз."
            : "Данных для личного вывода пока недостаточно. Начните с небольшой практики или выберите интересующую область.",
          basedOn: focusDomain ? "SELF_REFLECTION" : "EXPLORATION",
        },
        content: catalog.map((card) => ({
          key: card.key,
          revision: card.revision,
          domain: card.domain,
          kind: card.kind,
          title: card.title,
          purpose: card.purpose,
          durationMinutes: card.durationMinutes,
          conditions: card.conditions,
          outcome: card.outcome,
          reviewStatus: card.reviewStatus,
          locked: lockedKeys.has(card.key),
          completedCount: count.get(card.key) ?? 0,
        })),
        domains: DEVELOPMENT_DOMAINS.map((domain) => ({ ...domain })),
        programs: DEVELOPMENT_PROGRAMS.map((program) => ({
          ...program,
          completedSteps: program.contentKeys.filter((key) => count.has(key))
            .length,
        })),
        recent: [
          ...new Map(
            [...unfinishedRuns, ...completedRuns].map((run) => [run._id, run]),
          ).values(),
        ]
          .filter((run) => !lockedKeys.has(run.contentKey))
          .map((run) => toDevelopmentRunDTO(run, userId)),
      };
    },

    async start(
      userId: string,
      contentKey: string,
      pairId?: string,
    ): Promise<DevelopmentDetailDTO> {
      const content = contentFor(contentKey);
      const pairOnly = ["PAIR_PRACTICE", "TOPIC", "LEISURE"].includes(
        content.kind,
      );
      if (pairOnly && !pairId)
        throw new DomainError({
          code: "VALIDATION_ERROR",
          status: 400,
          message: "Выберите текущую пару для совместного занятия.",
        });
      if (!pairOnly && pairId)
        throw new DomainError({
          code: "VALIDATION_ERROR",
          status: 400,
          message: "Это личное занятие.",
        });
      await connectToDatabase();
      if (pairId) {
        const guardedPair = await pairContextAccess.read(pairId, userId);
        pairId = guardedPair._id.toString();
      }
      await economyService.assertContentAccess({ userId, contentKey });
      const periodKey = developmentPeriod(new Date());
      const runId = hash(
        JSON.stringify([
          pairId ? `pair:${pairId}` : `owner:${userId}`,
          content.key,
          content.revision,
          periodKey,
        ]),
      );
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          const pair = pairId
            ? await pairContextAccess.fence(pairId, userId, session)
            : null;
          await DevelopmentRun.updateOne(
            { _id: runId },
            {
              $setOnInsert: {
                contentKey,
                contentRevision: content.revision,
                periodKey,
                ...(pairId ? { pairId } : {}),
                participantIds: pair ? pair.members : [userId],
                completedUserIds: [],
                status: "ACTIVE",
                revision: 0,
                createdAt: new Date(),
              },
            },
            { upsert: true, session },
          );
        });
      } finally {
        await session.endSession();
      }
      return this.detail(userId, runId);
    },

    async detail(userId: string, runId: string): Promise<DevelopmentDetailDTO> {
      const run = await accessibleRun(userId, runId);
      await economyService.assertContentAccess({
        userId,
        contentKey: run.contentKey,
      });
      const publication = publicationForRun(run);
      const own = await DevelopmentCompletion.findOne({ runId, userId }).lean();
      return {
        content: publication.content,
        run: toDevelopmentRunDTO(run, userId),
        responseOptions: publication.responseOptions,
        ownResult: own
          ? {
              feedback: own.feedback,
              privateNote: own.privateNote,
              answers: own.answers.map(({ question, value }) => ({
                question,
                value,
              })),
            }
          : null,
      };
    },

    async complete(
      userId: string,
      input: DevelopmentCompleteInput,
    ): Promise<DevelopmentDetailDTO> {
      const run = await accessibleRun(userId, input.runId, true);
      await economyService.assertContentAccess({
        userId,
        contentKey: run.contentKey,
      });
      const content = publicationForRun(run).content;
      const answers = validateDevelopmentAnswers(content, input.answers);
      const privateNote = input.privateNote.trim();
      const payloadHash = hash(
        JSON.stringify([answers, input.feedback, privateNote]),
      );
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          if (run.pairId)
            await pairContextAccess.fence(run.pairId, userId, session);
          await economyService.assertContentAccess({
            userId,
            contentKey: content.key,
            session,
          });
          const current = await DevelopmentRun.findOneAndUpdate(
            { _id: run._id, participantIds: userId },
            { $inc: { revision: 1 } },
            { new: true, session },
          );
          if (!current) return missing();
          const existing = await DevelopmentCompletion.findOne({
            runId: run._id,
            userId,
          }).session(session);
          if (existing && existing.payloadHash !== payloadHash)
            throw new DomainError({
              code: "STATE_CONFLICT",
              status: 409,
              message:
                "Этот результат уже сохранён. Новое прохождение доступно на следующей неделе.",
            });
          if (!existing)
            await DevelopmentCompletion.create(
              [
                {
                  _id: hash(JSON.stringify([run._id, userId])),
                  userId,
                  runId: run._id,
                  contentKey: content.key,
                  contentRevision: content.revision,
                  answers,
                  feedback: input.feedback,
                  privateNote,
                  payloadHash,
                  createdAt: new Date(),
                },
              ],
              { session },
            );
          current.completedUserIds = [
            ...new Set([...current.completedUserIds, userId]),
          ];
          current.status = current.participantIds.every((id) =>
            current.completedUserIds.includes(id),
          )
            ? "COMPLETED"
            : "PARTIAL";
          if (current.status === "COMPLETED")
            current.completedAt ??= new Date();
          await current.save({ session });
          if (!run.pairId) {
            await economyService.rewardCompletion({
              userId,
              sourceKind:
                content.kind === "REFLECTION"
                  ? "QUESTIONNAIRE"
                  : "SOLO_PRACTICE",
              sourceId: `development:${content.key}:${content.revision}:${content.kind === "REFLECTION" ? "first" : run.periodKey}`,
              session,
            });
          } else if (
            current.status === "COMPLETED" &&
            content.kind === "PAIR_PRACTICE"
          ) {
            for (const memberId of current.participantIds)
              await economyService.rewardCompletion({
                userId: memberId,
                sourceKind: "PAIR_ACTIVITY",
                sourceId: `development:${run.pairId}:${content.key}:${content.revision}:${run.periodKey}`,
                session,
              });
          }
        });
      } finally {
        await session.endSession();
      }
      return this.detail(userId, run._id);
    },
  };
}

export const developmentService = createDevelopmentService();
