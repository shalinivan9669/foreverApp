import {
  BETA_CONTENT_REVISION,
  BETA_QUESTIONNAIRES,
} from './seedBetaQuestionnaires';
import { QUESTIONNAIRE_CONTENT_MODEL } from '@/models/Questionnaire';

const fail = (message: string): never => {
  throw new Error(message);
};

const expected = new Map([
  ['beta_baseline_communication_style', { title: 'Стиль сложного разговора', min: 8, max: 10 }],
  ['beta_state_resource_fatigue', { title: 'Ресурс и усталость', min: 7, max: 9 }],
  ['beta_pair_expectations', { title: 'Ожидания в паре', min: 12, max: 16 }],
  ['beta_weekly_checkin', { title: 'Как прошла неделя', min: 5, max: 5 }],
]);

if (BETA_QUESTIONNAIRES.length !== expected.size) {
  fail(`expected ${expected.size} beta questionnaires`);
}

for (const questionnaire of BETA_QUESTIONNAIRES) {
  const spec = expected.get(questionnaire._id) ??
    fail(`unexpected questionnaire ${questionnaire._id}`);
  const meta = questionnaire.meta ?? fail(`missing meta for ${questionnaire._id}`);

  if (questionnaire.title.ru !== spec.title) fail(`bad title for ${questionnaire._id}`);
  if (questionnaire.contentModel !== QUESTIONNAIRE_CONTENT_MODEL) {
    fail(`bad content model for ${questionnaire._id}`);
  }
  if (!questionnaire.domainKey) fail(`missing domainKey for ${questionnaire._id}`);
  if (questionnaire.version < 2) fail(`semantic questionnaire version is stale: ${questionnaire._id}`);
  if (questionnaire.publicationStatus !== 'published') {
    fail(`questionnaire is not explicitly published: ${questionnaire._id}`);
  }
  if (!(questionnaire.reviewedAt instanceof Date) || !(questionnaire.publishedAt instanceof Date)) {
    fail(`questionnaire publication timestamps are missing: ${questionnaire._id}`);
  }
  if (questionnaire.retiredAt !== undefined) {
    fail(`published questionnaire is retired: ${questionnaire._id}`);
  }
  if (!meta.isBeta) fail(`missing beta meta for ${questionnaire._id}`);
  if (meta.contentRevision !== BETA_CONTENT_REVISION) {
    fail(`bad content revision meta for ${questionnaire._id}`);
  }
  if ('axis' in questionnaire || 'vector' in questionnaire.target) {
    fail(`legacy vector contract leaked into ${questionnaire._id}`);
  }
  if (questionnaire.questions.length < spec.min || questionnaire.questions.length > spec.max) {
    fail(`bad question count for ${questionnaire._id}`);
  }

  const questionIds = new Set<string>();
  for (const question of questionnaire.questions) {
    if (questionIds.has(question.id)) fail(`duplicate question id ${question.id}`);
    questionIds.add(question.id);
    if (!question.domainKey) fail(`missing domainKey in ${questionnaire._id}/${question.id}`);
    if (!question.topicKey) fail(`missing topicKey in ${questionnaire._id}/${question.id}`);
    if (question.optionCount !== (question.scale === 'bool' ? 2 : 5)) {
      fail(`bad optionCount in ${questionnaire._id}/${question.id}`);
    }
    if (question.contentRevision !== BETA_CONTENT_REVISION) {
      fail(`bad content revision in ${questionnaire._id}/${question.id}`);
    }
    if (!question.scope) fail(`missing scope in ${questionnaire._id}/${question.id}`);
    if (!question.audience) fail(`missing audience in ${questionnaire._id}/${question.id}`);
    if (!question.sensitivity) fail(`missing sensitivity in ${questionnaire._id}/${question.id}`);
    if (question.locale !== 'ru') fail(`bad locale in ${questionnaire._id}/${question.id}`);
    if (!question.explanation) fail(`missing explanation in ${questionnaire._id}/${question.id}`);
    if (
      'axis' in question ||
      'facet' in question ||
      'polarity' in question ||
      'map' in question ||
      'scoringVersion' in question
    ) {
      fail(`legacy scoring metadata leaked into ${questionnaire._id}/${question.id}`);
    }
    if ('factorKey' in question || 'measurementKey' in question) {
      fail(`unreviewed factor binding leaked into ${questionnaire._id}/${question.id}`);
    }
  }
}

const pair = BETA_QUESTIONNAIRES.find((item) => item._id === 'beta_pair_expectations');
if (!pair || pair.target.type !== 'couple' || pair.domainKey !== 'sharedLife') {
  fail('pair questionnaire must use the semantic shared-life contract');
}

const weekly = BETA_QUESTIONNAIRES.find((item) => item._id === 'beta_weekly_checkin');
const weeklyFields = weekly?.meta?.weeklyFields;
if (!Array.isArray(weeklyFields) || weeklyFields.length !== 5) {
  fail('weekly questionnaire must declare five weekly fields');
}

console.log('beta questionnaires selfcheck passed');
