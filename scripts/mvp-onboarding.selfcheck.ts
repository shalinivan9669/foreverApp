import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MVP_ONBOARDING_CONTENT_REVISION,
  MVP_ONBOARDING_POLICY_VERSION,
  MVP_ONBOARDING_QUESTIONS,
  buildMvpOnboardingCursor,
  canCompleteMvpOnboarding,
  reviseMvpOnboardingAnswers,
  toMvpOnboardingOwnerDTO,
  validateMvpOnboardingAnswer,
} from '@/domain/services/mvpOnboarding.service';
import type {
  MvpOnboardingAnswer,
  MvpOnboardingAnswerValue,
  MvpOnboardingSessionType,
} from '@/models/MvpOnboardingSession';

const readProjectFile = (path: string): string =>
  readFileSync(join(process.cwd(), path), 'utf8');

assert.ok(
  MVP_ONBOARDING_QUESTIONS.length >= 8 && MVP_ONBOARDING_QUESTIONS.length <= 12,
  'MVP onboarding must stay within 8–12 questions'
);
assert.equal(
  new Set(MVP_ONBOARDING_QUESTIONS.map((question) => question.id)).size,
  MVP_ONBOARDING_QUESTIONS.length,
  'question ids must be unique'
);
assert.ok(
  MVP_ONBOARDING_QUESTIONS.every(
    (question) => question.revision.length > 0 && question.allowedCapturePolicies.length > 0
  ),
  'every question must have a revision and capture policy choices'
);
assert.ok(
  MVP_ONBOARDING_QUESTIONS.filter((question) => question.sensitive).every(
    (question) => question.optional
  ),
  'sensitive questions must be optional'
);

const questionCopy = JSON.stringify(MVP_ONBOARDING_QUESTIONS).toLowerCase();
for (const forbidden of [
  'gender',
  'male',
  'female',
  'мужчина должен',
  'женщина должна',
  'dating',
  'знакомств',
]) {
  assert.equal(
    questionCopy.includes(forbidden),
    false,
    `onboarding copy must not contain assumption: ${forbidden}`
  );
}

const firstQuestion = MVP_ONBOARDING_QUESTIONS[0];
const firstOption = firstQuestion.choices?.[0];
assert.ok(firstQuestion && firstOption);

const firstRevision = reviseMvpOnboardingAnswers({
  answers: [],
  question: firstQuestion,
  questionRevision: firstQuestion.revision,
  capturePolicy: 'PAIR_MODEL_ONLY',
  value: { kind: 'single', optionId: firstOption.id },
  answeredAt: new Date('2026-08-07T10:00:00.000Z'),
});
assert.equal(firstRevision.changed, true);
assert.equal(firstRevision.answers[0]?.answerRevision, 1);
assert.equal(firstRevision.answers[0]?.questionRevision, firstQuestion.revision);

const repeatedRevision = reviseMvpOnboardingAnswers({
  answers: firstRevision.answers,
  question: firstQuestion,
  questionRevision: firstQuestion.revision,
  capturePolicy: 'PAIR_MODEL_ONLY',
  value: { kind: 'single', optionId: firstOption.id },
  answeredAt: new Date('2026-08-07T10:01:00.000Z'),
});
assert.equal(repeatedRevision.changed, false, 'same answer must be semantically idempotent');
assert.equal(repeatedRevision.answers[0]?.answerRevision, 1);

const secondOption = firstQuestion.choices?.[1];
assert.ok(secondOption);
const changedRevision = reviseMvpOnboardingAnswers({
  answers: firstRevision.answers,
  question: firstQuestion,
  questionRevision: firstQuestion.revision,
  capturePolicy: 'PRIVATE',
  value: { kind: 'single', optionId: secondOption.id },
  answeredAt: new Date('2026-08-07T10:02:00.000Z'),
});
assert.equal(changedRevision.changed, true);
assert.equal(changedRevision.answers[0]?.answerRevision, 2);

assert.throws(() =>
  validateMvpOnboardingAnswer({
    question: firstQuestion,
    questionRevision: firstQuestion.revision,
    capturePolicy: 'PRIVATE',
    value: { kind: 'single', optionId: 'not-a-real-option' },
  })
);
assert.throws(() =>
  validateMvpOnboardingAnswer({
    question: firstQuestion,
    questionRevision: firstQuestion.revision,
    capturePolicy: 'PRIVATE',
    value: { kind: 'skipped' },
  })
);

const optionalSensitive = MVP_ONBOARDING_QUESTIONS.find(
  (question) => question.sensitive && question.optional
);
assert.ok(optionalSensitive);
assert.deepEqual(
  validateMvpOnboardingAnswer({
    question: optionalSensitive,
    questionRevision: optionalSensitive.revision,
    capturePolicy: 'PRIVATE',
    value: { kind: 'skipped' },
  }).value,
  { kind: 'skipped' }
);
assert.throws(() =>
  validateMvpOnboardingAnswer({
    question: optionalSensitive,
    questionRevision: optionalSensitive.revision,
    capturePolicy: 'SHARED',
    value: { kind: 'skipped' },
  })
);

const firstClosedValue = (
  question: (typeof MVP_ONBOARDING_QUESTIONS)[number]
): MvpOnboardingAnswerValue => {
  if (question.kind === 'boolean') return { kind: 'boolean', booleanValue: true };
  const optionId = question.choices?.[0]?.id;
  assert.ok(optionId);
  return question.kind === 'multi'
    ? { kind: 'multi', optionIds: [optionId] }
    : { kind: 'single', optionId };
};

let requiredAnswers: MvpOnboardingAnswer[] = [];
for (const question of MVP_ONBOARDING_QUESTIONS.filter((item) => !item.optional)) {
  requiredAnswers = reviseMvpOnboardingAnswers({
    answers: requiredAnswers,
    question,
    questionRevision: question.revision,
    capturePolicy: 'PRIVATE',
    value: firstClosedValue(question),
    answeredAt: new Date('2026-08-07T11:00:00.000Z'),
  }).answers;
}
assert.equal(canCompleteMvpOnboarding(requiredAnswers), true);
assert.equal(
  canCompleteMvpOnboarding([
    { ...requiredAnswers[0], questionRevision: 'stale-question-revision' },
    ...requiredAnswers.slice(1),
  ]),
  false,
  'completion must reject answers from an outdated question revision'
);
assert.equal(
  buildMvpOnboardingCursor(requiredAnswers),
  MVP_ONBOARDING_QUESTIONS.findIndex((question) => question.optional),
  'resume cursor must point to the first unanswered optional question'
);

const now = new Date('2026-08-07T12:00:00.000Z');
const session: MvpOnboardingSessionType = {
  userId: 'owner-user-id',
  status: 'in_progress',
  contentRevision: MVP_ONBOARDING_CONTENT_REVISION,
  policyVersion: MVP_ONBOARDING_POLICY_VERSION,
  consent: {
    adultConfirmed: true,
    voluntaryParticipationConfirmed: true,
    privacyAcknowledged: true,
    confirmedAt: now,
  },
  cursor: buildMvpOnboardingCursor(requiredAnswers),
  answers: requiredAnswers,
  startedAt: now,
  createdAt: now,
  updatedAt: now,
};
const ownerJson = JSON.stringify(toMvpOnboardingOwnerDTO(session));
assert.equal(ownerJson.includes('owner-user-id'), false, 'owner DTO must omit DB subject id');
assert.equal(ownerJson.includes('questionRevision'), true);
assert.equal(ownerJson.includes('answerRevision'), true);
assert.equal(ownerJson.includes('capturePolicy'), true);

const modelSource = readProjectFile('src/models/MvpOnboardingSession.ts');
assert.match(modelSource, /contentRevision:\s*1, policyVersion:\s*1/);
assert.match(modelSource, /answerRevision/);
assert.match(modelSource, /PRIVATE[\s\S]*PAIR_MODEL_ONLY[\s\S]*SHARED/);
assert.doesNotMatch(modelSource, /freeText|note:\s*\{/);

const serviceSource = readProjectFile('src/domain/services/mvpOnboarding.service.ts');
assert.match(serviceSource, /currentUserId/);
assert.match(serviceSource, /updatedAt:\s*session\.updatedAt/);
assert.doesNotMatch(serviceSource, /@\/models\/(User|Pair)/);
assert.doesNotMatch(serviceSource, /console\.(log|error|warn)/);

const routeSource = readProjectFile('src/app/api/users/me/mvp-onboarding/route.ts');
assert.match(routeSource, /requireSession\(req\)/);
assert.match(routeSource, /currentUserId:\s*auth\.data\.userId/);
assert.doesNotMatch(routeSource, /withIdempotency/);
assert.match(routeSource, /Cache-Control', 'no-store/);
assert.match(routeSource, /export async function GET/);
assert.match(routeSource, /export async function PATCH/);
assert.doesNotMatch(routeSource, /body\.data\.userId|body\.userId/);

const clientSource = readProjectFile('src/client/api/mvpOnboarding.api.ts');
assert.doesNotMatch(clientSource, /idempotency:\s*true/);
assert.doesNotMatch(clientSource, /\bfetch\(/);

const pageSource = readProjectFile('src/app/mvp-onboarding/page.tsx');
assert.match(pageSource, /Мне исполнилось 18 лет/);
assert.match(pageSource, /участвую добровольно/);
assert.match(pageSource.toLocaleLowerCase('ru'), /только для меня/);
assert.doesNotMatch(pageSource, /<textarea|type="text"/);

console.log('mvp-onboarding.selfcheck passed');
