import { DomainError } from "@/domain/errors";

export const DEVELOPMENT_RUN_PAGE_SIZE = 30;

export type DevelopmentRunCursor = {
  createdAt: Date;
  id: string;
  scope: string;
};

export function encodeDevelopmentRunCursor(cursor: DevelopmentRunCursor): string {
  return Buffer.from(
    `v1|${cursor.createdAt.toISOString()}|${cursor.id}|${cursor.scope}`,
  ).toString("base64url");
}

/** Position only: every page independently authorizes the current session. */
export function decodeDevelopmentRunCursor(cursor: string): DevelopmentRunCursor {
  const invalid = (): never => {
    throw new DomainError({
      code: "VALIDATION_ERROR",
      status: 400,
      message: "Не удалось прочитать страницу занятий. Обновите список.",
    });
  };
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(cursor)) return invalid();
  const raw = Buffer.from(cursor, "base64url").toString("utf8");
  if (Buffer.from(raw).toString("base64url") !== cursor) return invalid();
  const match = /^v1\|(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\|([a-f\d]{64})\|([a-f\d]{64})$/.exec(raw);
  if (!match) return invalid();
  const createdAt = new Date(match[1]);
  if (!Number.isFinite(createdAt.getTime()) || createdAt.toISOString() !== match[1]) return invalid();
  return { createdAt, id: match[2], scope: match[3] };
}
