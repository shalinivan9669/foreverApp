import { type ClientSession } from "mongoose";
import { requirePairMember } from "@/lib/auth/resourceGuards";
import { Pair } from "@/models/Pair";
import { DomainError } from "@/domain/errors";

const unavailable = (): never => {
  throw new DomainError({
    code: "NOT_FOUND",
    status: 404,
    message: "Пара недоступна.",
  });
};
/** Central resource guard first; transaction fence serializes writes against pause/end. */
export const pairContextAccess = {
  async read(pairId: string, userId: string) {
    const result = await requirePairMember(pairId, userId);
    if (!result.ok) return unavailable();
    return result.data.pair;
  },
  async fence(pairId: string, userId: string, session: ClientSession) {
    const pair = await Pair.findOneAndUpdate(
      { _id: pairId, members: userId, status: "active" },
      { $inc: { lifecycleRevision: 1 } },
      { new: true, session, timestamps: false },
    );
    if (!pair) return unavailable();
    return pair;
  },
};
