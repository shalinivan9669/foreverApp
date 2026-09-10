import { DevelopmentCompletion } from "@/models/DevelopmentCompletion";
import { MeasurementTestSession } from '@/models/MeasurementTestSession';
import { PairWorkspace } from "@/models/PairWorkspace";
import { Pair } from "@/models/Pair";
import { toSharedLifeDTO } from "@/lib/dto/sharedLife.dto";
import { exportOwnerAssessmentData } from '@/domain/services/assessmentRuns.service';
import { exportOwnerAssessmentPairData } from '@/domain/services/assessmentPairPrivacy.service';
import { exportOwnerAssessmentComparisonData } from '@/domain/services/assessmentComparison.service';
import { assessmentAdmissionService } from '@/domain/services/assessmentAdmission.service';

/** Export contains owner answers and currently accessible shared records, never peer reflections. */
export const productWorkspacePrivacy = {
  async exportOwnerData(userId: string) {
    const measurementTests = await MeasurementTestSession.find({ ownerId: userId }).limit(100).lean();
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
      assessments: await exportOwnerAssessmentData(userId),
      assessmentSettings: await assessmentAdmissionService.exportOwnerData(userId),
      assessmentPairReports: await exportOwnerAssessmentPairData(userId),
      assessmentDirect: await exportOwnerAssessmentComparisonData(userId),
      measurementTests: measurementTests.map((row) => ({ testKey: row.testKey, contentRevision: row.contentRevision, registryVersion: row.registryVersion, status: row.status, answers: row.answers.map(({ questionId, choice }) => ({ questionId, choice })), pairUse: row.pairUse, permissionRevision: row.permissionRevision, finalizedAt: row.finalizedAt?.toISOString() ?? null })),
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
