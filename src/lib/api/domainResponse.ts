import { asError, toDomainError } from "@/domain/errors";
import { jsonError, jsonOk } from "./response";

/** Sanitizes unexpected errors; participant routes never expose database details. */
export async function domainResponse<T>(
  read: () => Promise<T>,
): Promise<Response> {
  return domainRoute(async () => jsonOk(await read()));
}

export async function domainRoute(
  execute: () => Promise<Response>,
): Promise<Response> {
  try {
    return await execute();
  } catch (error) {
    const domain = toDomainError(asError(error));
    return jsonError(
      domain.status,
      domain.code,
      domain.message,
      domain.details,
    );
  }
}
