import { DevelopmentCompletion } from "@/models/DevelopmentCompletion";
import { PairWorkspace } from "@/models/PairWorkspace";
import { Pair } from "@/models/Pair";
import { toSharedLifeDTO } from "@/lib/dto/sharedLife.dto";

/** Export contains owner answers and currently accessible shared records, never peer reflections. */
export const productWorkspacePrivacy = {
  async exportOwnerData(userId: string) {
    const completions = await DevelopmentCompletion.find({ userId })
      .sort({ createdAt: -1, _id: -1 })
      .limit(501)
      .lean();
    const pairs = await Pair.find({
      members: userId,
      status: { $in: ["active", "paused"] },
    })
      .limit(100)
      .lean();
    const workspaces = await PairWorkspace.find({
      _id: { $in: pairs.map((pair) => pair._id.toString()) },
    }).lean();
    const today = new Date().toISOString().slice(0, 10);
    return {
      version: "product-workspace-owner-v1",
      completions: {
        limit: 500,
        truncated: completions.length > 500,
        items: completions.slice(0, 500).map((item) => ({
          id: item._id,
          runId: item.runId,
          contentKey: item.contentKey,
          contentRevision: item.contentRevision,
          answers: item.answers.map((answer) => ({
            question: answer.question,
            value: answer.value,
          })),
          feedback: item.feedback,
          privateNote: item.privateNote,
          createdAt: item.createdAt.toISOString(),
        })),
      },
      sharedWorkspaces: workspaces.map((workspace) => {
        const pair = pairs.find(
          (candidate) => candidate._id.toString() === workspace._id,
        )!;
        return toSharedLifeDTO(workspace, {
          myRole: pair.members[0] === userId ? "A" : "B",
          readOnly: pair.status !== "active",
          today,
        });
      }),
    };
  },
};
