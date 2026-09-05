import { http } from "./http";
import type { SharedLifeCommand } from "@/lib/contracts/sharedLife";
import type { SharedLifeDTO } from "@/lib/dto/sharedLife.dto";

const localToday = (): string => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const path = (pairId: string) =>
  `/api/pairs/${encodeURIComponent(pairId)}/shared-life?today=${localToday()}`;
export const sharedLifeApi = {
  get: (pairId: string, signal?: AbortSignal) =>
    http.get<SharedLifeDTO>(path(pairId), { signal }),
  update: async (
    pairId: string,
    command: SharedLifeCommand,
  ): Promise<SharedLifeDTO> => {
    const receipt = await http.post<
      { pairId: string; revision: number },
      SharedLifeCommand
    >(path(pairId), command, {
      idempotency: true,
    });
    return sharedLifeApi.get(receipt.pairId);
  },
};
