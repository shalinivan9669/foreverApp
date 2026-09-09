import assert from 'node:assert/strict';
import { selectTodayAction } from '@/client/viewmodels/today.viewmodels';
import { normalizePairSummary } from '@/client/viewmodels/pair.viewmodels';
import type { CurrentWeeklyCycleDTO } from '@/client/api/weeklyCycles.api';
import type { RecommendationDecisionDTO } from '@/client/api/recommendations.api';

const summary = normalizePairSummary({ pair: { id: 'pair-a', status: 'active' }, nextStep: { kind: 'complete_weekly_checkin', title: 'Ответьте на вопросы', href: '#weekly-checkin', ctaLabel: 'Ответить' } });
const cycle: CurrentWeeklyCycleDTO = {
  pairId: 'pair-a', cycleId: 'cycle', cycleKey: 'week', window: { startsAt: '', endsAt: '', status: 'OPEN', timeZone: 'UTC' },
  currentUser: { completionStatus: 'PENDING' }, peer: { completionStatus: 'PENDING' },
  pair: { bothSubmitted: false, dataStatus: 'NOT_READY', reasonCodes: [], signals: [] },
  snapshot: { revision: 1, generatedAt: '', inputDefinitionVersion: '', algorithmVersion: '', displayVersion: '' },
};
const base: Parameters<typeof selectTodayAction>[0] = {
  loading: false, failed: false, userReady: true, existingPartnerIntent: false, pairId: null, summary: null, cycle: null, recommendation: null,
};
assert.equal(selectTodayAction(base)?.href, '/development');
assert.equal(selectTodayAction({ ...base, existingPartnerIntent: true })?.href, '/invite');
for (const [journey, href] of [['ENTRY', '/entry'], ['ONBOARDING', '/mvp-onboarding'], ['LOCATION', '/entry?intent=matching'], ['CARD', '/match-card/create'], ['SEARCH', '/search'], ['INVITE_WAITING', '/invite'], ['INVITE_CONFIRM', '/invite']] as const) {
  assert.equal(selectTodayAction({ ...base, journey })?.href, href);
}
assert.match(selectTodayAction({ ...base, journey: 'INVITE_WAITING' })?.description ?? '', /Повторять этот шаг не нужно/);
for (const blocked of [{ loading: true }, { failed: true }, { userReady: false }]) assert.equal(selectTodayAction({ ...base, ...blocked }), null);
const paired = { ...base, pairId: 'pair-a', pairStatus: 'active' as const, summary, cycle };
assert.equal(selectTodayAction(paired)?.href, '/pair/pair-a#weekly-checkin');
assert.equal(selectTodayAction({ ...paired, summary: null })?.href, '/pair/pair-a');
assert.ok(summary);
const waiting = selectTodayAction({ ...paired, summary: { ...summary, nextStep: { ...summary.nextStep, kind: 'wait_or_invite_peer_checkin' } }, cycle: { ...cycle, currentUser: { completionStatus: 'SUBMITTED' } } });
assert.equal(waiting?.label, 'Посмотреть статус');
assert.match(waiting?.description ?? '', /Повторно заполнять отметку не нужно/);
const skipped = { ...cycle, currentUser: { completionStatus: 'SKIPPED' as const } };
assert.equal(selectTodayAction({ ...paired, summary: { ...summary, nextStep: { ...summary.nextStep, kind: 'suggest_activity' } }, cycle: skipped })?.label, 'Посмотреть лёгкие активности');
const recommendation: RecommendationDecisionDTO = {
  id: 'recommendation', cycleKey: 'week', activity: { id: 'activity', title: { ru: 'Время вместе', en: '' }, difficulty: 1, actionDefinition: { key: 'action', actionVersion: 1, registryVersion: 1 } },
  status: 'OFFERED', reasonCode: 'CURRENT_CYCLE_SUPPORT', explanation: { ru: 'Короткая практика', en: '' }, decisionVersion: 'recommendation-decision-v1', canAccept: true, canSkip: true, canReplace: true,
};
const enough = { ...cycle, pair: { ...cycle.pair, dataStatus: 'ENOUGH' as const } };
assert.equal(selectTodayAction({ ...paired, summary: { ...summary, nextStep: { ...summary.nextStep, kind: 'suggest_activity' } }, cycle: enough, recommendation })?.label, 'Открыть рекомендацию');
assert.equal(selectTodayAction({ ...paired, cycle: enough, recommendation })?.href, '/pair/pair-a#weekly-checkin', 'server priority wins over a cached recommendation');
assert.equal(selectTodayAction({ ...paired, cycle: skipped, summary: { ...summary, nextStep: { ...summary.nextStep, kind: 'complete_current_activity', href: '/couple-activity?activityId=current' } } })?.href, '/couple-activity?activityId=current', 'current activity wins over skipped weekly cycle');
for (const pairStatus of ['paused', 'ended'] as const) {
  for (const staleCycle of [skipped, enough]) {
    const result = selectTodayAction({ ...paired, pairStatus, cycle: staleCycle, recommendation });
    assert.equal(result?.href, '/pair/pair-a');
    assert.doesNotMatch(result?.label ?? '', /Ответить|рекомендацию|лёгкие активности/);
  }
}
assert.equal(selectTodayAction({ ...paired, failed: true, recommendation }) , null);
console.log('Today action self-check passed: readiness, intent, lifecycle, wait, recommendation, anchor and access loss.');

