import { DomainError } from "@/domain/errors";
import { User } from "@/models/User";
import type { MatchingParticipantFencePort } from "./ports";

export const mongoMatchingParticipantFencePort: MatchingParticipantFencePort = {
  async fence(input): Promise<void> {
    const result = await User.updateMany(
      { id: { $in: [...input.participantIds] } },
      { $inc: { pairMembershipRevision: 1 } },
      { session: input.session },
    );
    if (result.matchedCount !== input.participantIds.length) {
      throw new DomainError({
        code: "NOT_FOUND",
        status: 404,
        message: "Matching participant was not found",
      });
    }
  },
};
