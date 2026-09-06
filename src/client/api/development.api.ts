import { http } from "./http";
import type {
  DevelopmentCompleteInput,
  DevelopmentDetailDTO,
  DevelopmentOverviewDTO,
  DevelopmentRunPageDTO,
} from "@/lib/dto/development.dto";

export const developmentApi = {
  overview: (signal?: AbortSignal) =>
    http.get<DevelopmentOverviewDTO>("/api/development", { signal }),
  unfinishedRuns: (cursor?: string, signal?: AbortSignal) =>
    http.get<DevelopmentRunPageDTO>(
      `/api/development/runs${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
      { signal },
    ),
  start: async (
    contentKey: string,
    pairId?: string,
  ): Promise<DevelopmentDetailDTO> => {
    const receipt = await http.post<
      { runId: string },
      { contentKey: string; pairId?: string }
    >(
      "/api/development/start",
      { contentKey, ...(pairId ? { pairId } : {}) },
      { idempotency: true },
    );
    return developmentApi.detail(receipt.runId);
  },
  detail: (id: string, signal?: AbortSignal) =>
    http.get<DevelopmentDetailDTO>(
      `/api/development/runs/${encodeURIComponent(id)}`,
      { signal },
    ),
  complete: async (
    input: DevelopmentCompleteInput,
  ): Promise<DevelopmentDetailDTO> => {
    const receipt = await http.post<
      { runId: string },
      DevelopmentCompleteInput
    >("/api/development/complete", input, { idempotency: true });
    return developmentApi.detail(receipt.runId);
  },
};
