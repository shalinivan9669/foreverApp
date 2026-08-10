import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ActivityTemplate,
  publishedActivityTemplateFilter,
} from '@/models/ActivityTemplate';
import {
  Questionnaire,
  publishedQuestionnaireFilter,
} from '@/models/Questionnaire';
import { BETA_QUESTIONNAIRES } from './seedBetaQuestionnaires';

const readProjectFile = (path: string): string =>
  readFileSync(resolve(process.cwd(), path), 'utf8');

const main = async (): Promise<void> => {
  assert.deepEqual(publishedActivityTemplateFilter(), {
    publicationStatus: 'published',
    contentVersion: { $gte: 1 },
    reviewedAt: { $type: 'date' },
    publishedAt: { $type: 'date' },
    retiredAt: { $exists: false },
  });
  assert.deepEqual(publishedQuestionnaireFilter(), {
    publicationStatus: 'published',
    version: { $gte: 1 },
    reviewedAt: { $type: 'date' },
    publishedAt: { $type: 'date' },
    retiredAt: { $exists: false },
  });

  const activity = new ActivityTemplate({
    _id: 'publication-selfcheck',
    contentVersion: 1,
    publicationStatus: 'published',
    intent: 'improve',
    archetype: 'task',
    axis: ['communication'],
    difficulty: 1,
    intensity: 1,
    title: { ru: 'Проверка', en: 'Check' },
    description: { ru: 'Проверка', en: 'Check' },
    checkIns: [],
    effect: [],
  });
  await assert.rejects(activity.validate(), /requires review and publish timestamps/);

  const questionnaire = new Questionnaire({
    _id: 'publication-selfcheck',
    publicationStatus: 'published',
    version: 1,
    title: { ru: 'Проверка', en: 'Check' },
    target: { type: 'individual', gender: 'unisex', vector: 'neutral' },
    axis: 'communication',
    difficulty: 1,
    tags: [],
    randomize: false,
    questions: [],
  });
  await assert.rejects(questionnaire.validate(), /requires review and publish timestamps/);

  for (const item of BETA_QUESTIONNAIRES) {
    assert.equal(item.publicationStatus, 'published');
    assert.ok(item.reviewedAt instanceof Date);
    assert.ok(item.publishedAt instanceof Date);
    assert.equal(item.retiredAt, undefined);
  }

  const gatedQueryFiles = [
    'src/domain/services/activityOffer.service.ts',
    'src/app/api/activity-templates/route.ts',
    'src/domain/services/questionnaires.service.ts',
    'src/domain/services/pairAnswerScoring.service.ts',
    'src/app/api/questionnaires/route.ts',
    'src/app/api/questionnaires/[id]/route.ts',
    'src/app/api/questionnaires/cards/route.ts',
  ];
  for (const path of gatedQueryFiles) {
    assert.match(readProjectFile(path), /published(?:ActivityTemplate|Questionnaire)Filter/);
  }

  const preflightSource = readProjectFile('scripts/release-preflight.ts');
  assert.match(preflightSource, /legacy-activity-content-not-publishable/);
  assert.match(preflightSource, /legacy-questionnaire-content-not-publishable/);
  assert.doesNotMatch(preflightSource, /publicationStatus[^\n]+\$set[^\n]+published/);

  console.log('content publication selfcheck passed');
};

void main();
