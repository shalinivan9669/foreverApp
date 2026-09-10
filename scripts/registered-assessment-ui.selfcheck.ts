import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import AssessmentSettingsPanel from '@/features/assessments/AssessmentSettingsPanel';
import AssessmentHubPage from '@/features/assessments/AssessmentHubPage';
import QuestionnairesPageView from '@/features/questionnaires/QuestionnairesPageView';
import { ASSESSMENT_DATA_FLOW, ASSESSMENT_INFORMATION_VERSION, ASSESSMENT_TERMS_VERSION, type AssessmentSettingsDTO } from '@/domain/assessment/admission';
import type { AssessmentPortfolioDTO } from '@/lib/dto/assessmentClient.dto';

// Actual components rendered with a deterministic first resource state. Effects
// and transport do not run during SSR; the real browser suite covers submission.
const base: AssessmentSettingsDTO = {
  mode: 'REGISTERED', admission: 'ELIGIBLE', revision: 0, viewerToken: 'a'.repeat(64),
  termsVersion: ASSESSMENT_TERMS_VERSION, informationVersion: ASSESSMENT_INFORMATION_VERSION,
  registration: null, settings: { ownerAssessment: false, discovery: false, pairSharing: false, publicationIds: [] },
  dataFlow: ASSESSMENT_DATA_FLOW, availablePublicationIds: ['com-s02-knowledge-beta'],
};
const originalState = React.useState;
const descriptor = Object.getOwnPropertyDescriptor(React, 'useState');
function render(resource: object, element: React.ReactElement): string {
  let index = 0;
  Object.defineProperty(React, 'useState', { configurable: true, writable: true, value: <T,>(initial: T | (() => T)) => originalState(index++ === 0 ? resource as T : initial) });
  try { return renderToStaticMarkup(element); }
  finally { if (descriptor) Object.defineProperty(React, 'useState', descriptor); }
}
const setup = render(base, React.createElement(AssessmentSettingsPanel, { registration: true }));
assert.match(setup, /Один раз перед первой анкетой/);
assert.match(setup, /Принимаю описанные условия использования анкет/);
assert.match(setup, /Приглашение от администратора не нужно/);
assert.match(setup, /<button[^>]*disabled=""[^>]*>Сохранить выбор и продолжить/);
assert.equal((setup.match(/type="checkbox"/g) ?? []).length, 5);
assert.doesNotMatch(setup, /type="checkbox"[^>]*checked=""/);
assert.doesNotMatch(setup, /закрыт[а-я]+ бет|участие пока недоступно/i);

const active = { ...base, admission: 'ACTIVE' as const, revision: 1, settings: { ...base.settings, ownerAssessment: true } };
const ready = render(active, React.createElement(AssessmentSettingsPanel, { registration: true }));
assert.match(ready, /href="\/questionnaires"[^>]*>Перейти к анкетам/);
assert.doesNotMatch(ready, /Мне исполнилось|Принимаю описанные условия|Сохранить выбор и продолжить/);
assert.match(ready, /Сохранить настройки/);
const revoked = render({ ...base, admission: 'REVOKED' }, React.createElement(AssessmentSettingsPanel, { registration: true }));
assert.match(revoked, /Сохранить выбор и продолжить/);
assert.match(revoked, /Их можно подключить снова/);
const privateRevoked = render({ ...base, mode: 'PRIVATE_BETA', admission: 'REVOKED' }, React.createElement(AssessmentSettingsPanel, { registration: true }));
assert.doesNotMatch(privateRevoked, /Сохранить выбор и продолжить/);

const hub = render({ settings: base, portfolio: null }, React.createElement(AssessmentHubPage, { embedded: true }));
assert.match(hub, /href="\/assessments\/start"[^>]*>Настроить и открыть анкеты/);
assert.doesNotMatch(hub, /<main|Условия и участие|действующий допуск/);
const portfolio: AssessmentPortfolioDTO = {
  viewerToken: base.viewerToken, revision: 0, goal: 'SELF',
  profile: { version: 'assessment-profile-v1', status: 'NOT_STARTED', snapshot: null, unavailableSkills: [] },
  publications: [], planner: { publicationId: null, reasonCode: 'DECLINED_OR_UNAVAILABLE', message: 'Выберите тему' }, practiceCatalog: [], practices: [],
};
const primary = render({ settings: active, portfolio }, React.createElement(QuestionnairesPageView, {
  activeTab: 'personal', onChangeTab: () => undefined, canAccessCouple: false, personalCards: [], coupleCards: [],
  loadingCards: false, loadFailed: false, loadingByQuestionnaireId: {}, onStartQuestionnaire: () => undefined,
  legacyErrors: React.createElement('p', { role: 'alert' }, 'SYNTHETIC_LEGACY_ERROR'),
}));
assert.doesNotMatch(primary, /<main/);
assert.ok(primary.indexOf('Темы и сохранённые формы') < primary.indexOf('Прежние короткие анкеты и результаты'));
const legacy = primary.slice(primary.indexOf('<details class="app-panel p-4"'));
assert.match(legacy, /^<details class="app-panel p-4"><summary/);
assert.match(legacy, /SYNTHETIC_LEGACY_ERROR/);
assert.match(legacy, /Личные характеристики: шесть областей/);
assert.match(primary, /href="\/assessments\/discovery"/);
assert.match(primary, /href="\/assessments\/pair"/);
assert.doesNotMatch(primary, /Настроить и открыть анкеты|Один раз перед первой анкетой/);
process.stdout.write(`${JSON.stringify({ suite: 'registered-assessment-ui', status: 'passed', checks: 26, scope: 'ACTUAL_COMPONENT_SSR_WITH_RESOURCE_STATE_NOT_BROWSER' })}\n`);
