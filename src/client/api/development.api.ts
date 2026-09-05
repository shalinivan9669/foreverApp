import { http } from "./http";
import type {
  DevelopmentCompleteInput,
  DevelopmentDetailDTO,
  DevelopmentOverviewDTO,
} from "@/lib/dto/development.dto";

export const developmentApi = {
  overview: (signal?: AbortSignal) =>
    http.get<DevelopmentOverviewDTO>("/api/development", { signal }),
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
