import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { DomainError } from '@/domain/errors';
import { BETA_COMPARISON_VERSION } from '@/domain/assessment/betaComparison';
import type { BetaDiscoveryDTO } from '@/lib/dto/assessmentBeta.dto';
import { AssessmentDiscoverySession } from '@/models/AssessmentDiscoverySession';
import { assessmentFail as fail, assessmentTransaction, requireAssessmentOwner, requireAssessmentEffect } from './assessmentAccess.service';
import { calculateBetaComparison, resolveBetaDirect } from './assessmentBetaComparison.service';
import { getCandidateMatchingCard, getMatchingFeed } from './matching/matchingApplication.service';
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const querySchema = z.object({ cursor: z.string().regex(/^[A-Za-z0-9_-]{43}$/).optional(), limit: z.number().int().min(1).max(10).default(6) }).strict();
export const betaDiscoveryService = {
  async get(ownerId: string, input: { cursor?: string; limit?: number } = {}): Promise<BetaDiscoveryDTO> {
    const query = querySchema.parse(input);
    await requireAssessmentOwner(ownerId);
    await requireAssessmentEffect('MATCHING');
    const direct = await assessmentTransaction(session => resolveBetaDirect(ownerId, 'MATCHING', session));
    if (!direct) return { cards: [], nextCursor: null, scope: 'AUTHORIZED_DIRECT_CONDITIONS', exhausted: true };
    let upstreamCursor: string | undefined;
    if (query.cursor) {
      const cursor = await AssessmentDiscoverySession.findOne({ _id: digest(query.cursor), ownerId, directRevision: direct.revision, permissionRevision: direct.permissionRevision, modelVersion: BETA_COMPARISON_VERSION, limit: query.limit, expiresAt: { $gt: new Date() } }).select('+upstreamCursor').lean();
      if (!cursor) fail('MATCHING_CURSOR_STALE', 'Выдача изменилась. Обновите список.');
      upstreamCursor = cursor.upstreamCursor;
    }
    // This reuses the only social graph, existing hard filters, blocks, cooldowns,
    // candidate grants and bounded preselection. New authored skills never rank this feed.
    const page = await getMatchingFeed({ currentUserId: ownerId, cursor: upstreamCursor, limit: query.limit });
    const cards: BetaDiscoveryDTO['cards'] = [];
    for (const item of page.items) {
      const candidateId = item.candidate.id;
      const candidate = await assessmentTransaction(session => resolveBetaDirect(candidateId, 'MATCHING', session)).catch((error: Error) => {
        if (error instanceof DomainError && [403, 404].includes(error.status)) return null;
        throw error;
      });
      if (!candidate) continue;
      if ((candidate.betaPlan.offer !== null && direct.betaPlan.excludedOffers.includes(candidate.betaPlan.offer))
        || (direct.betaPlan.offer !== null && candidate.betaPlan.excludedOffers.includes(direct.betaPlan.offer))) continue;
      const comparison = await calculateBetaComparison(ownerId, candidateId, [], true);
      if (!comparison.current) continue;
      await getCandidateMatchingCard({ currentUserId: ownerId, candidateId, candidateGrant: item.candidateGrant });
      const lane = comparison.current.status === 'TARGET_SUPPORTED' ? 'CURRENT_SUPPORTED' : comparison.scenarios.some(scenario => scenario.result.status === 'TARGET_SUPPORTED') ? 'CONDITIONAL_PATH' : comparison.current.status === 'NEEDS_CLARIFICATION' || comparison.current.status === 'INCOMPLETE' ? 'CLARIFY' : 'VISIBLE_DIFFERENCE';
      cards.push({ candidateId, candidateGrant: item.candidateGrant, displayName: item.candidate.username, lane, comparison: comparison.current });
    }
    let nextCursor: string | null = null;
    if (page.nextCursor) {
      nextCursor = randomBytes(32).toString('base64url');
      await AssessmentDiscoverySession.create({ _id: digest(nextCursor), ownerId, directRevision: direct.revision, permissionRevision: direct.permissionRevision, modelVersion: BETA_COMPARISON_VERSION, limit: query.limit, upstreamCursor: page.nextCursor, expiresAt: new Date(Date.now() + 10 * 60000) });
    }
    return { cards, nextCursor, scope: 'AUTHORIZED_DIRECT_CONDITIONS', exhausted: !nextCursor };
  },
};
