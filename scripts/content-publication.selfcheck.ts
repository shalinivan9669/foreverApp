import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ActivityTemplate,
  publishedActivityTemplateFilter,
} from '@/models/ActivityTemplate';
import {
  QUESTIONNAIRE_CONTENT_MODEL,
  Questionnaire,
  publishedQuestionnaireFilter,
} from '@/models/Questionnaire';
import { MVP_FACTOR_REGISTRY } from '@/domain/model/definitions/mvpDefinitions';
import { BETA_QUESTIONNAIRES } from './seedBetaQuestionnaires';

const readProjectFile = (path: string): string =>
  readFileSync(resolve(process.cwd(), path), 'utf8');

const main = async (): Promise<void> => {
  assert.deepEqual(publishedActivityTemplateFilter(), {
    publicationStatus: 'published',
    contentVersion: { $gte: 1 },
    'actionDefinition.key': { $type: 'string' },
    'actionDefinition.actionVersion': { $gte: 1 },
    'actionDefinition.registryVersion': { $gte: 1 },
    'targetFactorKeys.0': { $exists: true },
    reviewedAt: { $type: 'date' },
    publishedAt: { $type: 'date' },
    retiredAt: { $exists: false },
  });
  assert.deepEqual(publishedQuestionnaireFilter(), {
    contentModel: QUESTIONNAIRE_CONTENT_MODEL,
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
    actionDefinition: {
      key: 'action.gentleThreeMinuteCheckIn',
      actionVersion: 1,
      registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
    },
    targetFactorKeys: [
      'communication.weekly.connection',
      'wellbeing.current.overload',
    ],
    difficulty: 1,
    intensity: 1,
    title: { ru: 'Проверка', en: 'Check' },
    description: { ru: 'Проверка', en: 'Check' },
    checkIns: [],
  });
  await assert.rejects(activity.validate(), /requires review and publish timestamps/);

  const questionnaire = new Questionnaire({
    _id: 'publication-selfcheck',
    contentModel: QUESTIONNAIRE_CONTENT_MODEL,
    publicationStatus: 'published',
    version: 1,
    title: { ru: 'Проверка', en: 'Check' },
    target: { type: 'individual', gender: 'unisex' },
    domainKey: 'communication',
    difficulty: 1,
    tags: [],
    randomize: false,
    questions: [
      {
        id: 'publication-selfcheck-question',
        domainKey: 'communication',
        topicKey: 'publication.selfcheck',
        scale: 'bool',
        optionCount: 2,
        text: { ru: 'Проверка', en: 'Check' },
        contentRevision: 'publication-selfcheck-v1',
      },
    ],
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
    'src/domain/services/activityTemplateCatalog.service.ts',
    'src/domain/services/questionnaires.service.ts',
    'src/domain/services/questionnaireCards.service.ts',
    'src/domain/services/questionnaireCatalog.service.ts',
  ];
  for (const path of gatedQueryFiles) {
    assert.match(readProjectFile(path), /published(?:ActivityTemplate|Questionnaire)Filter/);
  }
  assert.match(
    readProjectFile('src/app/api/activity-templates/route.ts'),
    /activityTemplateCatalogService\.listPublished/
  );
  assert.match(
    readProjectFile('src/app/api/questionnaires/route.ts'),
    /questionnaireCatalogService\.listPublished/
  );
  assert.match(
    readProjectFile('src/app/api/questionnaires/[id]/route.ts'),
    /questionnaireCatalogService\.getPublishedById/
  );

  const preflightSource = readProjectFile('scripts/release-preflight.ts');
  assert.match(preflightSource, /legacy-activity-content-not-publishable/);
  assert.match(preflightSource, /legacy-questionnaire-content-not-publishable/);
  assert.doesNotMatch(preflightSource, /publicationStatus[^\n]+\$set[^\n]+published/);

  console.log('content publication selfcheck passed');
};

void main();
