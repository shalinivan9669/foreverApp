import { BETA_QUESTIONNAIRES, BETA_SCORING_VERSION } from './seedBetaQuestionnaires';

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
  const spec = expected.get(questionnaire._id) ?? fail(`unexpected questionnaire ${questionnaire._id}`);
  const meta = questionnaire.meta ?? fail(`missing meta for ${questionnaire._id}`);
  if (questionnaire.title.ru !== spec.title) fail(`bad title for ${questionnaire._id}`);
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
  if (meta.scoringVersion !== BETA_SCORING_VERSION) {
    fail(`bad scoring version meta for ${questionnaire._id}`);
  }
  if (questionnaire.questions.length < spec.min || questionnaire.questions.length > spec.max) {
    fail(`bad question count for ${questionnaire._id}`);
  }

  for (const question of questionnaire.questions) {
    if (!question.axis) fail(`missing axis in ${questionnaire._id}/${question.id}`);
    if (!question.facet) fail(`missing facet in ${questionnaire._id}/${question.id}`);
    if (question.polarityNumeric !== 1 && question.polarityNumeric !== -1) {
      fail(`missing polarity numeric in ${questionnaire._id}/${question.id}`);
    }
    if (question.reverseScoring === undefined) {
      fail(`missing reverseScoring in ${questionnaire._id}/${question.id}`);
    }
    if (!Number.isFinite(question.weight) || question.weight <= 0) {
      fail(`bad weight in ${questionnaire._id}/${question.id}`);
    }
    if (!Number.isFinite(question.confidenceWeight) || (question.confidenceWeight ?? 0) <= 0) {
      fail(`bad confidenceWeight in ${questionnaire._id}/${question.id}`);
    }
    if (!question.scope) fail(`missing scope in ${questionnaire._id}/${question.id}`);
    if (!question.audience) fail(`missing audience in ${questionnaire._id}/${question.id}`);
    if (!question.sensitivity) fail(`missing sensitivity in ${questionnaire._id}/${question.id}`);
    if (question.locale !== 'ru') fail(`bad locale in ${questionnaire._id}/${question.id}`);
    if (!question.explanation) fail(`missing explanation in ${questionnaire._id}/${question.id}`);
    if (question.scoringVersion !== BETA_SCORING_VERSION) {
      fail(`bad question scoring version in ${questionnaire._id}/${question.id}`);
    }
  }
}

const pair = BETA_QUESTIONNAIRES.find((item) => item._id === 'beta_pair_expectations');
if (!pair || pair.target.type !== 'couple' || pair.meta?.targetLayer !== 'pair_passport') {
  fail('pair questionnaire must target pair passport only');
}

const weekly = BETA_QUESTIONNAIRES.find((item) => item._id === 'beta_weekly_checkin');
const weeklyFields = weekly?.meta?.weeklyFields;
if (!Array.isArray(weeklyFields) || weeklyFields.length !== 5) {
  fail('weekly questionnaire must declare five weekly fields');
}

console.log('beta questionnaires selfcheck passed');
