import type { LogType } from '@/models/Log';

type IdLike = string | { toString(): string };

type LogSource = LogType & { _id?: IdLike };

export type LogDTO = {
  id?: string;
  at: string;
  userId?: string;
};

export type ToLogDtoOptions = {
  includeUserId?: boolean;
  includeId?: boolean;
};

export function toLogDTO(log: LogSource, opts: ToLogDtoOptions = {}): LogDTO {
  const includeUserId = opts.includeUserId ?? false;
  const includeId = opts.includeId ?? true;

  const dto: LogDTO = {
    at: log.at.toISOString(),
  };

  if (includeUserId) dto.userId = log.userId;
  if (includeId && log._id) dto.id = String(log._id);

  return dto;
}

