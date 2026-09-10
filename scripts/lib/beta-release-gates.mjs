/** Evaluates current execution evidence. It cannot grant target or operator approval. */
const ids = (from, to = from) => Array.from({ length: to - from + 1 }, (_, index) => `BETA-${String(from + index).padStart(3, '0')}`);
const selected = (...values) => [...new Set(values.flat())];
const externalOnly = new Set(['BETA-093', 'BETA-115', 'BETA-116', 'BETA-126']);
const codeCases = ids(1, 126).filter(id => !externalOnly.has(id));
const definitions = {
  G01: { type: 'CODE', cases: codeCases, original: true, readiness: 'implementationReady' },
  G02: { type: 'CODE', cases: codeCases, original: true, readiness: 'automaticPassed', allExecutions: true,
    executions: ['types', 'lint', 'agents', 'build', 'assessment-reference', 'http-mongodb', 'operations', 'load', 'browser', 'browser-feed', 'browser-artifact-identity', 'browser-feed-artifact-identity', 'unchanged-tested-tree', 'complete-patch-applied-and-blobs-verified'] },
  G03: { type: 'CODE', cases: selected(ids(9, 32), ids(40), ids(117)) },
  G04: { type: 'CODE', cases: selected(ids(3), ids(6), ids(23, 29), ids(60), ids(62, 63), ids(67, 69), ids(74), ids(76), ids(80, 88), ids(91, 92), ids(98), ids(101), ids(104, 105), ids(114)) },
  G05: { type: 'CODE_AND_ENVIRONMENT', cases: selected(ids(94, 107), ids(123)), executions: ['operations', 'load'], external: 'BLOCKED_EXTERNAL',
    externalReason: 'Actual target runner, indexes, backup/restore, alert delivery and operational settings have no verified target evidence in this execution.' },
  G06: { type: 'CODE_AND_EXTERNAL', cases: ids(109, 112), executions: ['browser', 'browser-feed', 'browser-artifact-identity', 'browser-feed-artifact-identity'], context: ids(115), external: 'NOT_RUN',
    externalReason: 'Native screen reader task, errors, review and controls were not executed by this synthetic pipeline; DOM and Chromium checks do not substitute for native AT.' },
  G07: { type: 'ENVIRONMENT_EXTERNAL', context: selected(ids(83), ids(116)), external: 'BLOCKED_EXTERNAL',
    externalReason: 'Real OAuth, iframe and authentication on an authorized target surface require actual external execution and permission.' },
  G08: { type: 'EXTERNAL_DECISION', context: ids(93), external: 'BLOCKED_EXTERNAL',
    externalReason: 'No adopted scoped platform/legal data-flow decision or necessary external clarification is supplied by test results or participant consent.' },
  G09: { type: 'CODE_AND_EXTERNAL', cases: selected(ids(1, 2), ids(5, 6), ids(82), ids(89, 91)), external: 'BLOCKED_EXTERNAL',
    externalReason: 'Adopted retention/processor policy and accountable operation of the support channel require the product owner and actual target evidence.' },
  G10: { type: 'ENVIRONMENT', context: selected(ids(99, 100), ids(102, 107)), external: 'BLOCKED_EXTERNAL',
    externalReason: 'Disposable synthetic MongoDB, workers and alerts do not establish target database, transport, storage or operations readiness.' },
  G11: { type: 'OPERATOR_ACTION', context: selected(ids(124), ids(126)), external: 'BLOCKED_EXTERNAL',
    externalReason: 'No authorized operator approval for this version/surface/cohort and no actual rollout are recorded by this pipeline.' },
  G12: { type: 'CODE_AND_CONTENT', cases: selected(ids(4), ids(15), ids(32), ids(68), ids(88), ids(117)), external: 'BLOCKED_EXTERNAL',
    externalReason: 'Automated wording and consumer checks are separate from independent content-owner review and psychometric validation; no such approval is inferred.' },
};
const identityMatches = (row, runId, sourceIdentity) => row?.runId === runId && row?.sourceIdentity === sourceIdentity;
const testKey = test => JSON.stringify([test?.runner ?? test?.file, test?.assertion ?? test?.test, test?.suite ?? null]);
const aggregate = evidence => evidence.some(row => row.status === 'FAILED') ? 'FAILED'
  : evidence.length > 0 && evidence.every(row => row.status === 'PASSED') ? 'PASSED'
    : evidence.some(row => ['PASSED', 'PARTIAL'].includes(row.status)) ? 'PARTIAL' : 'NOT_RUN';

/** requirements is the unchanged RELEASE_GATES template; cases are final report rows.
 * Result rows come only from this invocation's runner. Cases must carry the exact
 * invocation/tree identity, nonempty observed tests and no hidden implementation gaps.
 */
export function evaluateBetaReleaseGates({ requirements, results, betaCases, originalCases, readiness, runId, sourceIdentity }) {
  if (!requirements || !Array.isArray(requirements.gates) || requirements.gates.length !== 12
    || new Set(requirements.gates.map(gate => gate.id)).size !== 12
    || requirements.gates.some(gate => !definitions[gate.id] || gate.type !== definitions[gate.id].type || gate.required !== true || gate.approvalForgeryForbidden !== true)) throw new Error('BETA_RELEASE_GATE_TEMPLATE_INVALID');
  if (![results, betaCases, originalCases].every(Array.isArray)) throw new Error('BETA_RELEASE_GATE_EVIDENCE_INVALID');
  const validIdentity = typeof runId === 'string' && runId.length > 0 && typeof sourceIdentity === 'string' && /^[a-f0-9]{64}$/.test(sourceIdentity);
  const exactRows = (rows, prefix, count) => rows.length === count && new Set(rows.map(row => row.id)).size === count
    && Array.from({ length: count }, (_, index) => `${prefix}-${String(index + 1).padStart(3, '0')}`).every(id => rows.some(row => row.id === id));
  const completeCaseSets = exactRows(betaCases, 'BETA', 126) && exactRows(originalCases, 'INT', 64);
  const resultEvidence = name => {
    const rows = results.filter(row => row.name === name && row.producer === 'scripts/beta-check.mjs');
    const row = rows[0];
    const current = validIdentity && rows.length === 1 && (!row.runId || row.runId === runId) && (!row.sourceIdentity || row.sourceIdentity === sourceIdentity);
    return { kind: 'EXECUTION', reference: `results:${name}`, name, status: current && row.status === 'PASSED' ? 'PASSED' : current && row.status === 'FAILED' ? 'FAILED' : 'NOT_RUN',
      reason: !current ? 'Missing, duplicated, foreign or unattributed execution.' : row.status !== 'PASSED' ? 'Execution did not pass.' : 'Runner execution from this report.' };
  };
  const identity = resultEvidence('unchanged-tested-tree');
  const caseEvidence = (id, original = false) => {
    const rows = (original ? originalCases : betaCases).filter(row => row.id === id), row = rows[0];
    const current = validIdentity && identity.status === 'PASSED' && rows.length === 1 && identityMatches(row, runId, sourceIdentity);
    const status = original ? row?.status : row?.implementationStatus;
    const tests = row?.tests ?? [], observed = row?.observed ?? [], gaps = row?.unverifiedSubparts ?? [];
    const matched = tests.length > 0 && tests.every(test => observed.some(value => testKey(test) === testKey(value)));
    const nativeOnly = original && id === 'INT-024' && status === 'PARTIAL' && gaps.length > 0 && gaps.every(gap => gap.layer === 'NATIVE_A11Y');
    const passed = current && matched && ((status === 'PASSED' && gaps.length === 0) || nativeOnly);
    return { kind: original ? 'INT' : 'BETA', reference: `${original ? 'originalReexecution.cases' : 'beta.cases'}:${id}`, id,
      status: passed ? 'PASSED' : current && status === 'FAILED' ? 'FAILED' : current && observed.length > 0 ? 'PARTIAL' : 'NOT_RUN',
      reason: !current ? 'Missing, duplicated or foreign invocation/tree case evidence.' : !matched ? 'Required named tests were not all observed.' : nativeOnly ? 'Automatic retained checks passed; native AT remains separate in G06.' : gaps.length ? 'Implementation subparts remain unverified.' : status !== 'PASSED' ? 'Case implementation did not pass.' : 'All mapped implementation assertions observed on this tree.' };
  };
  const gates = requirements.gates.map(template => {
    const rule = definitions[template.id], evidence = [], reasons = [];
    if (rule.cases) {
      evidence.push(identity, ...rule.cases.map(id => caseEvidence(id)));
      if (!completeCaseSets) evidence.push({ kind: 'COVERAGE', reference: 'beta.cases+originalReexecution.cases', status: 'NOT_RUN', reason: 'The report must contain exactly 126 BETA and 64 INT identities.' });
      if (rule.original) evidence.push(...Array.from({ length: 64 }, (_, index) => caseEvidence(`INT-${String(index + 1).padStart(3, '0')}`, true)));
      if (rule.executions) evidence.push(...rule.executions.map(resultEvidence));
      if (rule.readiness) evidence.push({ kind: 'READINESS', reference: `readiness:${rule.readiness}`, status: readiness?.[rule.readiness] === true ? 'PASSED' : 'NOT_RUN', reason: 'Current report readiness is a necessary additional condition, never standalone evidence.' });
      if (rule.allExecutions && (results.length === 0 || results.some(row => row.status !== 'PASSED') || !Array.isArray(readiness?.missingCriticalExecutions) || readiness.missingCriticalExecutions.length > 0)) {
        evidence.push({ kind: 'EXECUTION', reference: 'results+readiness.missingCriticalExecutions', status: results.some(row => row.status === 'FAILED') ? 'FAILED' : 'NOT_RUN', reason: 'Missing, failed or skipped required execution remains.' });
      }
    }
    const codeStatus = rule.cases ? aggregate(evidence) : 'NOT_APPLICABLE';
    const externalStatus = rule.external ?? 'NOT_APPLICABLE';
    reasons.push(...evidence.filter(row => row.status !== 'PASSED').map(row => `${row.reference}: ${row.reason}`));
    if (rule.externalReason) reasons.push(rule.externalReason);
    // Context references document related report state; they cannot become an approval.
    for (const id of rule.context ?? []) {
      const row = betaCases.find(value => value.id === id);
      evidence.push({ kind: 'CONTEXT_ONLY', reference: `beta.cases:${id}`, id, status: row && identityMatches(row, runId, sourceIdentity) ? row.status : 'NOT_RUN', approval: false });
    }
    if (rule.external) evidence.push({ kind: 'EXTERNAL', reference: `releaseGates:${template.id}:external`, status: rule.external, approval: false, reason: rule.externalReason });
    const status = !['PASSED', 'NOT_APPLICABLE'].includes(codeStatus) ? codeStatus : externalStatus === 'NOT_APPLICABLE' ? codeStatus
      : externalStatus === 'NOT_RUN' ? 'PARTIAL' : 'BLOCKED_EXTERNAL';
    return { ...structuredClone(template), status, codeStatus, externalStatus, runId: validIdentity ? runId : null, sourceIdentity: validIdentity ? sourceIdentity : null, evidence, reasons };
  });
  return { schemaVersion: 'beta-release-gate-evaluation-v1', templateStatus: requirements.status, runId: validIdentity ? runId : null, sourceIdentity: validIdentity ? sourceIdentity : null,
    gates, implementationReady: readiness?.implementationReady === true && gates.every(gate => ['PASSED', 'NOT_APPLICABLE'].includes(gate.codeStatus)),
    environmentReady: false, privateBetaOpen: false, actualApprovalSource: 'NONE', missingEvidenceIsNotPass: true };
}
