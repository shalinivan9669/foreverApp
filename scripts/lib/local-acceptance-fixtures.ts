import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import { usersService } from '@/domain/services/users.service';
import { entryProfileService } from '@/domain/services/entryProfile.service';
import { sessionRevocationService } from '@/domain/services/sessionRevocation.service';
import {
  mvpOnboardingService, MVP_ONBOARDING_QUESTIONS,
  MVP_ONBOARDING_CONTENT_REVISION, MVP_ONBOARDING_POLICY_VERSION,
} from '@/domain/services/mvpOnboarding.service';
import { signJwt } from '@/lib/jwt';
import { privacySubjectHash } from '@/lib/privacy/subjectHash';
import { User } from '@/models/User';
import { SessionSubject } from '@/models/SessionSubject';
import { DEVELOPMENT_CONTENT_REPOSITORY } from '@/domain/model/development/catalog';
import { DevelopmentRun } from '@/models/DevelopmentRun';
// Register the models required for the documented invite/development/shared-life
// browser journey before creating indexes on this new, privately owned database.
import '@/models/PairInvite';
import '@/models/PairMembershipClaim';
import '@/models/PairWorkspace';
import '@/models/DevelopmentCompletion';
import '@/models/IdempotencyRecord';
import '@/models/Notification';
import '@/models/PairEvent';
import type { LocalAcceptanceScenario } from './local-acceptance-options';
import { seedLocalAcceptanceMatching } from './local-acceptance-matching';
import { seedLocalAcceptanceNotifications } from './local-acceptance-notifications';

export const createLocalAcceptanceFixtures = async (runId: string, scenario: LocalAcceptanceScenario = 'existing-partner') => {
  assert.match(runId, /^[a-f0-9]{12}$/);
  const uri = new URL(process.env.MONGODB_URI ?? '');
  assert.equal(uri.hostname, '127.0.0.1');
  assert.equal(uri.pathname, `/vmeste_local_${runId}_test`);
  assert.equal(uri.searchParams.get('replicaSet'), `vmesteLocal${runId}`);
  const secret = process.env.JWT_SECRET;
  assert.ok(secret && secret.length >= 32);
  const subjects = { a: `local-acceptance-${runId}-a`, b: `local-acceptance-${runId}-b` };
  await mongoose.connect(uri.toString(), { autoIndex: false, serverSelectionTimeoutMS: 5_000 });
  for (const model of Object.values(mongoose.models)) {
    await model.createCollection();
    await model.createIndexes();
  }
  for (const actor of ['a', 'b'] as const) {
    const userId = subjects[actor];
    await usersService.upsertCurrentUserProfile({ currentUserId: userId, payload: {
      username: actor === 'a' ? 'Участник А — локальная проверка' : 'Участник Б — локальная проверка',
      avatar: 'https://cdn.discordapp.com/embed/avatars/0.png',
    } });
    if (scenario !== 'first-entry') await entryProfileService.save({ currentUserId: userId, profile: {
      cohort: scenario === 'existing-partner' || scenario === 'notifications' ? 'EXISTING_PARTNER' : 'SOLO', age: 25, gender: actor === 'a' ? 'female' : 'male',
      city: 'Тестовый город', locationMode: 'NONE',
    } });
    if (scenario !== 'onboarding' && scenario !== 'first-entry') {
    await mvpOnboardingService.mutate({ currentUserId: userId, mutation: {
      action: 'start', contentRevision: MVP_ONBOARDING_CONTENT_REVISION,
      policyVersion: MVP_ONBOARDING_POLICY_VERSION,
      consent: { adultConfirmed: true, voluntaryParticipationConfirmed: true, privacyAcknowledged: true },
    } });
    for (const question of MVP_ONBOARDING_QUESTIONS) {
      const value = question.optional ? { kind: 'skipped' as const }
        : question.kind === 'boolean' ? { kind: 'boolean' as const, booleanValue: true }
          : question.kind === 'multi' ? { kind: 'multi' as const, optionIds: question.choices?.slice(0, question.minSelections ?? 1).map((choice) => choice.id) ?? [] }
            : { kind: 'single' as const, optionId: question.choices?.[0]?.id };
      await mvpOnboardingService.mutate({ currentUserId: userId, mutation: {
        action: 'answer', questionId: question.id, questionRevision: question.revision,
        capturePolicy: question.optional ? 'PRIVATE' : 'PAIR_MODEL_ONLY', value,
      } });
    }
    await mvpOnboardingService.mutate({ currentUserId: userId, mutation: { action: 'complete' } });
    }
    const entry = await entryProfileService.get(userId);
    assert.equal(entry.hasPair, false);
    assert.equal(entry.onboardingCompleted, scenario !== 'onboarding' && scenario !== 'first-entry');
    if (scenario === 'first-entry') {
      assert.equal(entry.user.entryCohort, undefined);
      assert.equal(entry.user.entryCompletedAt, undefined);
      assert.equal(entry.user.profile?.matchCard, undefined);
    }
  }
  if (scenario === 'matching' || scenario === 'matching-connection') await seedLocalAcceptanceMatching(subjects, scenario);
  if (scenario === 'notifications') await seedLocalAcceptanceNotifications(subjects);
  const versions = {
    a: await sessionRevocationService.getOrCreateVersion(subjects.a),
    b: await sessionRevocationService.getOrCreateVersion(subjects.b),
  };
  // A long-lived account fixture exercises the complete continuation list. These
  // are real published v1 activities from distinct historical weekly periods,
  // without submitted answers, completions or rewards.
  const contentKey = 'communication.solo_practice.1';
  assert.ok(DEVELOPMENT_CONTENT_REPOSITORY.findRevision(contentKey, 1));
  if (scenario !== 'onboarding' && scenario !== 'first-entry') await DevelopmentRun.create(Array.from({ length: 35 }, (_, index) => {
    const createdAt = new Date(Date.UTC(2025, 0, 6 - index * 7));
    return {
      _id: createHash('sha256').update(`${runId}:browser-run:${index}`).digest('hex'),
      contentKey, contentRevision: 1, periodKey: createdAt.toISOString().slice(0, 10),
      participantIds: [subjects.a], completedUserIds: [], status: 'ACTIVE' as const,
      revision: 1, createdAt,
    };
  }));
  return {
    // Tokens stay inside the process and Set-Cookie headers. They are never
    // returned in JSON, URLs, logs, files, or the command line.
    sessionCookie: (actor: 'a' | 'b') => `session=${signJwt(subjects[actor], secret, 7_200, versions[actor])}; Path=/; HttpOnly; SameSite=Lax; Max-Age=7200`,
    cleanup: async () => {
      await Promise.all([
        User.deleteMany({ id: { $in: Object.values(subjects) } }),
        SessionSubject.deleteMany({ subjectKey: { $in: Object.values(subjects).map(privacySubjectHash) } }),
        DevelopmentRun.deleteMany({ participantIds: { $in: Object.values(subjects) } }),
      ]);
      await mongoose.disconnect();
    },
  };
};
