import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { entryProfileService } from '@/domain/services/entryProfile.service';
import { saveOwnMatchingCard, getMatchingPreferences, updateMatchingPreferences, getMatchingFeed, createMatchingLike, respondMatchingLike } from '@/domain/services/matching/matchingApplication.service';
import { updateMatchingConversation } from '@/domain/services/matching/matchingConversation.service';
import type { MatchingStatementReaction } from '@/lib/contracts/matchingProduct';

/** Synthetic browser fixtures only; caller owns and removes this isolated instance. */
export async function seedLocalAcceptanceMatching(subjects: { a: string; b: string }, scenario: 'matching' | 'matching-connection'): Promise<void> {
  const match = /^local-acceptance-([a-f0-9]{12})-a$/.exec(subjects.a);
  assert.ok(match, 'Matching fixtures require local acceptance subjects');
  assert.equal(subjects.b, `local-acceptance-${match[1]}-b`);
  const uri = new URL(process.env.MONGODB_URI ?? '');
  assert.equal(uri.hostname, '127.0.0.1');
  assert.equal(uri.pathname, `/vmeste_local_${match[1]}_test`);
  assert.equal(uri.searchParams.get('replicaSet'), `vmesteLocal${match[1]}`);
  assert.equal(mongoose.connection.name, `vmeste_local_${match[1]}_test`);
  const auditRequest = { requestId: randomUUID(), route: 'local-acceptance-matching', method: 'POST' };
  for (const actor of ['a', 'b'] as const) {
    const currentUserId = subjects[actor];
    await entryProfileService.save({ currentUserId, profile: { cohort: 'SOLO', age: 25, gender: actor === 'a' ? 'female' : 'male', city: 'Кызылорда', locationMode: 'DEVICE', coordinates: [65.51, 44.85] } });
    const card: Parameters<typeof saveOwnMatchingCard>[0]['card'] = {
      requirements: ['Уважение к личному времени', 'Спокойный диалог', 'Готовность обсуждать планы'],
      give: ['Поддержка в трудный день', 'Внимание к мелочам', 'Честность в разговоре'],
      boundaries: ['Оскорбления', 'Давление на решение', 'Разный темп общения'], boundaryDealbreakers: [true, true, false],
      questions: ['Что помогает вам доверять?', 'Как вы отдыхаете после сложного дня?', 'Как вы предпочитаете обсуждать разногласия?'],
      ageRange: { min: 18, max: 99 }, maxDistanceKm: 100, active: true, soughtGender: 'ANY',
      actual: { relationshipIntent: 'LOOKING_FOR_LONG_TERM', childrenIntent: 'UNSURE', structurePreference: 0.2, socialActivityPreference: 0.1, cleaningPreference: 0.6, repairSkill: 0.8, relationshipPriority: 0.9 },
    };
    // Two independent published observations satisfy the existing repairSkill
    // readiness rule; this never modifies Factor definitions or scoring.
    for (let observation = 0; observation < 2; observation += 1) await saveOwnMatchingCard({ currentUserId, card, idempotencyKey: randomUUID(), auditRequest });
    const preferences = await getMatchingPreferences({ currentUserId });
    await updateMatchingPreferences({ currentUserId, revision: preferences.revision, preferences: preferences.preferences.map((item) => ({ factorKey: item.factorKey, target: 'allowedValues' in item.target ? { ...item.target, allowedValues: [...item.target.allowedValues] } : item.target, importance: item.importance, flexibility: item.flexibility, constraintMode: item.constraintMode, useAllowed: true })), idempotencyKey: randomUUID(), auditRequest });
  }
  const feed = await getMatchingFeed({ currentUserId: subjects.a, limit: 20 });
  const candidate = feed.items.find((item) => item.candidate.id === subjects.b);
  assert.ok(candidate, 'Synthetic matching candidate must be discoverable');
  if (scenario === 'matching') return;
  const reactions: MatchingStatementReaction[] = (['give', 'requirements', 'boundaries'] as const).flatMap((section) => [0, 1, 2].map((index) => ({ section, index, reaction: 'AGREE' as const })));
  const like = await createMatchingLike({ currentUserId: subjects.a, candidateId: subjects.b, candidateGrant: candidate.candidateGrant, agreements: [true, true, true], answers: ['Тест: доверие растёт постепенно.', 'Тест: прогулка и спокойный вечер.', 'Тест: сначала выслушать друг друга.'], reactions, idempotencyKey: randomUUID(), auditRequest });
  const response = await respondMatchingLike({ currentUserId: subjects.b, likeId: like.id, agreements: [true, true, true], answers: ['Тест: важны честность и уважение.', 'Тест: время для себя.', 'Тест: говорить по очереди.'], reactions, auditRequest });
  assert.ok(response.connection, 'Two synthetic responses must create a connection');
  const connectionId = response.connection.id;
  await updateMatchingConversation({ currentUserId: subjects.a, connectionId, action: 'SUBMIT', topicKey: 'boundaries', round: 1, text: 'Синтетический личный ответ А: мне важно время на отдых.', revealConsent: true });
  for (const actor of ['a', 'b'] as const) await updateMatchingConversation({ currentUserId: subjects[actor], connectionId, action: 'SUBMIT', topicKey: 'mutual-interest', round: 1, text: actor === 'a' ? 'Синтетический открытый ответ А: хочу продолжить общение.' : 'Синтетический открытый ответ Б: мне интересно узнать больше.', revealConsent: true });
}
