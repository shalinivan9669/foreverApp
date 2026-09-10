import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ModeAwareProfileOverview from '@/components/profile/ModeAwareProfileOverview';
import { createEmptyProfileSummary, normalizeProfileSummary } from '@/client/viewmodels/profile.viewmodels';
import { computeAssessmentProfile } from '@/domain/assessment/profile';
import { assessmentErrorMessage } from '@/client/api/assessmentErrors';
import { ApiClientError } from '@/client/api/errors';
import { ReportForm } from '@/features/assessments/AssessmentPairPanel';
import type { AssessmentPairDTO } from '@/lib/dto/assessmentPair.dto';

const source = createEmptyProfileSummary();
source.user.id = 'synthetic-profile-owner';
source.user.avatarUrl = '/synthetic-avatar.png';
source.assessments = {
  version: 'assessment-profile-v1', status: 'READY', snapshot: computeAssessmentProfile({
    subjectId: source.user.id, sourceId: 'synthetic-assessment-source', revision: 4, generation: 0,
    period: { id: 'test-period', startsAt: '2026-08-13T00:00:00.000Z', endsAt: '2026-09-10T00:00:00.000Z' }, answers: [],
  }),
};
// Reproduce the actual profile path: complete server DTO -> client normalizer ->
// real overview component. The former normalizer dropped this entire section.
const html = renderToStaticMarkup(React.createElement(ModeAwareProfileOverview, { summary: normalizeProfileSummary(source) }));
assert.match(html, /data-skill-id="DOM.S07"/);
assert.match(html, /Неизвестно: нет подходящих данных/);
assert.match(html, /Описанное применение/);
assert.match(html, /\/assessments\/dom-s07/);
assert.match(html, /период \(UTC\) 13\.08\.2026 — 09\.09\.2026/);
assert.equal(html.split('Перенос ответственности без согласования').length - 1, 1, 'household negatives belong only to the household pilot');
assert.match(html, /Для этой темы доступны отдельные учебные формы/);
assert.doesNotMatch(html, /анкета этого навыка ещё не опубликована/, 'BETA-032: new published themes must not be described as unavailable');
const disabledSource = createEmptyProfileSummary();
disabledSource.user.avatarUrl = '/synthetic-avatar.png';
const disabled = renderToStaticMarkup(React.createElement(ModeAwareProfileOverview, { summary: normalizeProfileSummary(disabledSource) }));
assert.doesNotMatch(disabled, /\/assessments\/dom-s07/);
assert.doesNotMatch(disabled, /data-skill-id="DOM.S07"/);
assert.equal(assessmentErrorMessage(new ApiClientError({ status: 401, code: 'AUTH_REQUIRED', message: 'unauthorized' }), 'fallback'), 'Сессия завершена. Войдите снова.');
assert.equal(assessmentErrorMessage(new ApiClientError({ status: 404, code: 'NOT_FOUND', message: 'internal-resource-name' }), 'fallback'), 'Раздел недоступен для текущего аккаунта.');
assert.equal(assessmentErrorMessage(new ApiClientError({ status: 0, code: 'INVALID_ENVELOPE', message: 'Invalid API envelope' }), 'Повторите загрузку.'), 'Повторите загрузку.');
// The pair service publishes every window to avoid revealing partner presence.
// An absent own row must remain unselected; an explicit own unknown is saved.
const emptyWindow: AssessmentPairDTO['reports'][number] = { periodId: 'pair-week:2026-09-07', own: null, ownRecorded: false, ownShared: false, A: null, B: null, status: 'SHARED_DATA_INCOMPLETE', ownTrend: 'UNKNOWN' };
const report = (previous: AssessmentPairDTO['reports'][number]) => renderToStaticMarkup(React.createElement(ReportForm, { previous, busy: false, save: async () => true }));
const untouched = report(emptyWindow);
assert.doesNotMatch(untouched, /checked=""/);
assert.match(untouched, /Оценка заранее не выбрана/);
assert.match(untouched, /button[^>]+disabled=""/);
const savedUnknown = report({ ...emptyWindow, ownRecorded: true });
assert.equal(savedUnknown.split('checked=""').length - 1, 1);
assert.match(savedUnknown, /Показан ваш сохранённый отчёт/);
assert.doesNotMatch(savedUnknown, /button[^>]+disabled=""/);
process.stdout.write(`${JSON.stringify({ suite: 'assessment-profile-ui', status: 'passed', checks: 18, scope: 'ACTUAL_PROFILE_NORMALIZER_AND_RENDER_NOT_BROWSER' })}\n`);
