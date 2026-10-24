#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const readJSON = async path => JSON.parse(await readFile(path, 'utf8'));
const sha = value => createHash('sha256').update(value).digest('hex');
const canonical = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const digest = value => sha(canonical(value));
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const short = value => value ? `${String(value).slice(0, 10)}…` : '—';
const href = (outputRoot, path) => relative(outputRoot, path).replaceAll('\\', '/').split('/').map(encodeURIComponent).join('/');

async function optionalJSON(path) {
  try { return await readJSON(path); } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function sourceRef(runRoot, uri, outputRoot) {
  if (!uri) return null;
  const path = join(runRoot, uri);
  try {
    const bytes = await readFile(path);
    return { uri, href: href(outputRoot, path), available: true, file_sha256: sha(bytes) };
  } catch (error) {
    if (error.code === 'ENOENT') return { uri, href: href(outputRoot, path), available: false, file_sha256: null };
    throw error;
  }
}

function statusDetail(reasonCode, causeLayer, recoverability, sourceRefValue, affectedConclusions = []) {
  return { reason_code: reasonCode, cause_layer: causeLayer, recoverability, source_ref: sourceRefValue ?? null, affected_conclusions: affectedConclusions };
}

function stateCoverage(contract, assessment) {
  const units = new Map((assessment?.units ?? []).map(unit => [unit.obligation_id, unit.status]));
  return (contract.states ?? []).map(state => {
    const ids = (contract.obligations ?? []).filter(item => item.state_id === state.id).map(item => item.id);
    const statuses = ids.map(id => units.get(id)).filter(Boolean);
    if (!ids.length) return { id: state.id, status: 'unavailable', obligations: 0, status_detail: statusDetail('state_has_no_obligations', 'contract', 'contract_refreeze', 'contract.json#/obligations', ['state_coverage']) };
    if (!assessment) return { id: state.id, status: 'unavailable', obligations: ids.length, status_detail: statusDetail('best_assessment_missing', 'evaluation', 'rerunnable', 'run.json#/best_assessment', ['loop_state_coverage']) };
    if (statuses.length !== ids.length) return { id: state.id, status: 'unavailable', obligations: ids.length, status_detail: statusDetail('obligation_result_missing', 'evaluation', 'rerunnable', assessment.__source_uri ?? null, ['loop_state_coverage']) };
    if (statuses.some(item => item === 'unknown')) return { id: state.id, status: 'unknown', obligations: ids.length, status_detail: statusDetail('obligation_evidence_unknown', 'evidence', 'rerunnable', assessment.__source_uri ?? null, ['loop_state_score']) };
    if (statuses.every(item => item === 'not_applicable')) return { id: state.id, status: 'not_applicable', obligations: ids.length, status_detail: null };
    return { id: state.id, status: 'scored', obligations: ids.length, status_detail: null };
  });
}

async function projectRound(runRoot, round, outputRoot) {
  const assessment = await sourceRef(runRoot, round.assessment, outputRoot);
  const verification = await sourceRef(runRoot, round.verification, outputRoot);
  const diffRef = await sourceRef(runRoot, round.diff?.uri, outputRoot);
  const hasCandidateCycle = Boolean(round.candidate && assessment?.available && verification?.available && diffRef?.available);
  const completeness = hasCandidateCycle ? 'complete' : round.decision === 'inconclusive' ? 'terminated' : 'incomplete';
  return {
    round: round.round,
    version_id: round.version_id ?? `v${round.round}`,
    key: round.key ?? null,
    issue_id: round.issue_id ?? null,
    hypothesis: round.hypothesis ?? null,
    started_at: round.started_at ?? null,
    before_artifact_sha256: round.before ?? null,
    candidate_artifact_sha256: round.candidate ?? null,
    assessment,
    verification,
    diff: diffRef ? { ...diffRef, canonical_sha256: round.diff?.sha256 ?? null } : null,
    decision: round.decision ?? null,
    reason: round.reason ?? null,
    decided_at: round.at ?? null,
    completeness,
    status_detail: completeness === 'complete' ? null : statusDetail(completeness === 'terminated' ? 'round_terminated_without_complete_candidate_cycle' : 'round_evidence_incomplete', 'trajectory', 'historical_only', 'run.json#/rounds', ['round_comparison', 'candidate_quality'])
  };
}

async function projectLineage(runRoot, run, outputRoot) {
  const uri = run.lineage?.uri ?? 'lineage.json';
  const raw = await optionalJSON(join(runRoot, uri));
  if (!raw) return { status: 'root', relationship: null, parent_run_id: null, inherited_artifact_sha256: null, artifact_source: null, parent_contract_sha256: null, source_contract_sha256: null, source: null, issues: [] };
  const source = await sourceRef(runRoot, uri, outputRoot);
  const issues = [];
  if (raw.schema_version !== 'RestoreLineage/v1') issues.push({ code: 'lineage_schema_version_invalid', message: `Expected RestoreLineage/v1, got ${raw.schema_version ?? 'missing'}.` });
  if (!['continuation', 'contract_refreeze'].includes(raw.relationship)) issues.push({ code: 'lineage_relationship_legacy_or_invalid', message: `Unsupported relationship ${raw.relationship ?? 'missing'}.` });
  if (!['best_snapshot', 'working_tree_unverified'].includes(raw.inherited?.artifact_source)) issues.push({ code: 'lineage_artifact_source_legacy_or_invalid', message: `Unsupported artifact source ${raw.inherited?.artifact_source ?? 'missing'}.` });
  if (raw.child_run_id !== run.run_id) issues.push({ code: 'lineage_child_mismatch', message: 'lineage child_run_id does not match run_id.' });
  if (run.lineage?.sha256 && digest(raw) !== run.lineage.sha256) issues.push({ code: 'lineage_digest_mismatch', message: 'lineage canonical digest does not match run.json.' });
  return {
    status: issues.length ? 'invalid' : 'valid',
    relationship: raw.relationship ?? null,
    parent_run_id: raw.parent?.run_id ?? run.lineage?.parent_run_id ?? null,
    inherited_artifact_sha256: raw.inherited?.artifact_sha256 ?? run.lineage?.inherited_artifact_sha256 ?? null,
    artifact_source: raw.inherited?.artifact_source ?? run.lineage?.artifact_source ?? null,
    parent_contract_sha256: raw.parent?.contract_sha256 ?? null,
    source_contract_sha256: raw.contract_refreeze?.source?.canonical_sha256 ?? null,
    source,
    issues
  };
}

async function readRun(runRoot, outputRoot) {
  const run = await readJSON(join(runRoot, 'run.json'));
  const contract = await readJSON(join(runRoot, 'contract.json'));
  const rendered = await optionalJSON(join(runRoot, 'report.json'));
  const assessment = run.best_assessment ? await optionalJSON(join(runRoot, run.best_assessment)) : null;
  if (assessment) Object.defineProperty(assessment, '__source_uri', { value: run.best_assessment, enumerable: false });
  const final = rendered?.e2e ?? run.e2e ?? null;
  const score = rendered?.e2e_scoring_summary?.score_100 ?? final?.total_100 ?? null;
  const suites = run.static_checks ?? [];
  const latestSuite = [...suites].reverse().find(suite => suite.artifact_sha256 === run.best) ?? suites.at(-1) ?? null;
  const decisions = { keep: 0, revert: 0, inconclusive: 0 };
  for (const round of run.rounds ?? []) if (round.decision in decisions) decisions[round.decision] += 1;
  const profile = contract.e2e_profile ?? {};
  const comparisonGroup = `${run.contract_sha256 ?? 'unknown'}:${profile.rubric_version ?? 'unknown'}:${profile.scorer_version ?? 'unknown'}`;
  const reportStatus = rendered ? (rendered.integrity?.status ?? 'present') : 'missing';
  const reportDetail = reportStatus === 'missing'
    ? statusDetail('report_json_missing', 'reporting', 'regenerable_if_sources_exist', 'report.json', ['report_integrity', 'final_e2e_projection'])
    : reportStatus === 'present'
      ? statusDetail('legacy_integrity_status_not_recorded', 'reporting', 'migration_required', 'report.json#/integrity', ['report_integrity'])
      : reportStatus === 'degraded'
        ? statusDetail('evidence_integrity_failed', 'evidence', 'historical_only', 'report.json#/integrity/issues', ['positive_quality_conclusions'])
        : null;
  const e2eStatus = final?.status ?? 'unavailable';
  const e2eDetail = !final
    ? statusDetail('final_e2e_not_recorded', 'evaluation', run.phase === 'complete' || run.phase === 'final' ? 'historical_or_rerunnable' : 'not_reached', 'run.json#/e2e', ['final_score', 'cross_run_quality_comparison'])
    : final.status === 'incomplete'
      ? statusDetail('final_e2e_incomplete', 'evaluation', 'rerunnable', rendered ? 'report.json#/e2e' : 'run.json#/e2e', ['final_score'])
      : null;
  const staticDetail = !latestSuite
    ? statusDetail('static_check_suite_missing', 'diagnostics', 'rerunnable', 'run.json#/static_checks', ['runtime_diagnostics'])
    : latestSuite.artifact_sha256 !== run.best
      ? statusDetail('best_bound_static_suite_missing', 'diagnostics', 'rerunnable', 'run.json#/static_checks', ['best_artifact_static_status'])
      : null;
  const rounds = await Promise.all((run.rounds ?? []).map(item => projectRound(runRoot, item, outputRoot)));
  const lineage = await projectLineage(runRoot, run, outputRoot);
  const sources = {
    run: await sourceRef(runRoot, 'run.json', outputRoot), contract: await sourceRef(runRoot, 'contract.json', outputRoot),
    events: await sourceRef(runRoot, 'events.jsonl', outputRoot), report: await sourceRef(runRoot, 'report.json', outputRoot),
    best_assessment: await sourceRef(runRoot, run.best_assessment, outputRoot), lineage: lineage.source
  };
  return {
    label: basename(runRoot), run_id: run.run_id, started_at: run.started_at, phase: run.phase,
    stop: run.stop ?? null, round_count: rounds.length, rounds, decisions,
    best_artifact_sha256: run.best ?? null, baseline_artifact_sha256: run.baseline ?? null,
    contract_sha256: run.contract_sha256 ?? null, comparison_group: comparisonGroup,
    rubric_version: profile.rubric_version ?? null, scorer_version: profile.scorer_version ?? null,
    generation_policy: contract.generation_policy ?? null,
    report_status: reportStatus, report_status_detail: reportDetail,
    integrity_issues: rendered?.integrity?.issues ?? [],
    report_href: rendered ? href(outputRoot, join(runRoot, 'report.html')) : null,
    e2e: final ? { status: e2eStatus, status_detail: e2eDetail, score_100: score, provisional: final.provisional ?? null, dimensions: final.dimensions ?? [], coverage_percent: rendered?.e2e_scoring_summary?.coverage_percent ?? null } : { status: 'unavailable', status_detail: e2eDetail, score_100: null, provisional: null, dimensions: [], coverage_percent: 0 },
    static_checks: latestSuite ? { suite_id: latestSuite.suite_id, stage: latestSuite.stage, artifact_sha256: latestSuite.artifact_sha256 ?? null, selection: latestSuite.artifact_sha256 === run.best ? 'best_artifact' : 'latest_available', status_detail: staticDetail, source: await sourceRef(runRoot, latestSuite.uri, outputRoot), ...latestSuite.summary } : { overall_status: 'unavailable', total: 0, pass: 0, fail: 0, unknown: 0, skipped: 0, coverage_percent: 0, artifact_sha256: null, selection: 'unavailable', status_detail: staticDetail, source: null },
    state_coverage: stateCoverage(contract, assessment),
    unknown_units: (assessment?.units ?? []).filter(unit => unit.status === 'unknown').map(unit => unit.obligation_id),
    findings: assessment?.findings ?? [], lineage, sources
  };
}

function buildProvenance(runs) {
  const nodes = new Map(), edges = [], issues = [];
  const addNode = node => { if (!nodes.has(node.id)) nodes.set(node.id, node); };
  const addEdge = edge => edges.push(edge);
  const runById = new Map(runs.map(run => [run.run_id, run]));
  for (const run of runs) {
    const runId = `run:${run.run_id}`;
    addNode({ id: runId, kind: 'run', label: run.label, status: run.report_status, source_ref: run.sources.run });
    for (const artifact of [run.baseline_artifact_sha256, run.best_artifact_sha256].filter(Boolean)) addNode({ id: `artifact:${artifact}`, kind: 'artifact', label: short(artifact), status: 'observed', sha256: artifact });
    if (run.baseline_artifact_sha256) addEdge({ from: runId, to: `artifact:${run.baseline_artifact_sha256}`, kind: 'has_baseline', status: 'valid' });
    if (run.best_artifact_sha256) addEdge({ from: runId, to: `artifact:${run.best_artifact_sha256}`, kind: 'has_best', status: 'valid' });
    const v0 = `version:${run.run_id}:v0`;
    addNode({ id: v0, kind: 'version', label: `${run.label} · v0`, status: run.baseline_artifact_sha256 ? 'recorded' : 'unavailable' });
    addEdge({ from: runId, to: v0, kind: 'contains', status: 'valid' });
    if (run.baseline_artifact_sha256) addEdge({ from: v0, to: `artifact:${run.baseline_artifact_sha256}`, kind: 'produced', status: 'valid' });
    for (const round of run.rounds) {
      const versionId = `version:${run.run_id}:${round.version_id}`;
      addNode({ id: versionId, kind: 'version', label: `${run.label} · ${round.version_id}`, status: round.completeness, decision: round.decision, issue_id: round.issue_id });
      addEdge({ from: runId, to: versionId, kind: 'contains', status: 'valid' });
      if (round.before_artifact_sha256) {
        addNode({ id: `artifact:${round.before_artifact_sha256}`, kind: 'artifact', label: short(round.before_artifact_sha256), status: 'observed', sha256: round.before_artifact_sha256 });
        addEdge({ from: `artifact:${round.before_artifact_sha256}`, to: versionId, kind: 'input', status: 'valid' });
      }
      if (round.candidate_artifact_sha256) {
        addNode({ id: `artifact:${round.candidate_artifact_sha256}`, kind: 'artifact', label: short(round.candidate_artifact_sha256), status: 'observed', sha256: round.candidate_artifact_sha256 });
        addEdge({ from: versionId, to: `artifact:${round.candidate_artifact_sha256}`, kind: 'produced', status: round.completeness });
      }
      for (const [kind, ref] of [['assessment', round.assessment], ['verification', round.verification], ['diff', round.diff]]) if (ref) {
        const nodeId = `${kind}:${run.run_id}:${round.version_id}`;
        addNode({ id: nodeId, kind, label: `${round.version_id} ${kind}`, status: ref.available ? 'available' : 'missing', source_ref: ref });
        addEdge({ from: versionId, to: nodeId, kind: kind === 'assessment' ? 'assessed_by' : kind === 'verification' ? 'verified_by' : 'diffed_by', status: ref.available ? 'valid' : 'missing' });
      }
    }
    if (run.static_checks.source) {
      const nodeId = `static:${run.run_id}:${run.static_checks.suite_id}`;
      addNode({ id: nodeId, kind: 'static_check', label: run.static_checks.suite_id, status: run.static_checks.overall_status, source_ref: run.static_checks.source });
      addEdge({ from: runId, to: nodeId, kind: 'diagnosed_by', status: run.static_checks.selection });
    }
    if (run.e2e.status !== 'unavailable') {
      const nodeId = `e2e:${run.run_id}`;
      addNode({ id: nodeId, kind: 'final_e2e', label: `${run.label} E2E`, status: run.e2e.status, source_ref: run.sources.report });
      addEdge({ from: runId, to: nodeId, kind: 'final_evaluated_by', status: run.e2e.status });
    }
  }
  for (const run of runs) {
    if (!run.lineage.parent_run_id) continue;
    const relationship = ['continuation', 'contract_refreeze'].includes(run.lineage.relationship) ? run.lineage.relationship : 'legacy_lineage';
    addEdge({ from: `run:${run.lineage.parent_run_id}`, to: `run:${run.run_id}`, kind: relationship, status: run.lineage.status, source_ref: run.lineage.source });
    if (!runById.has(run.lineage.parent_run_id)) issues.push({ code: 'lineage_parent_not_in_report', run_id: run.run_id, parent_run_id: run.lineage.parent_run_id, message: 'Parent run is outside this report input set.' });
    for (const issue of run.lineage.issues) issues.push({ ...issue, run_id: run.run_id, parent_run_id: run.lineage.parent_run_id });
  }
  const runEdges = edges.filter(edge => ['continuation', 'contract_refreeze', 'legacy_lineage'].includes(edge.kind) && runById.has(edge.from.replace(/^run:/, '')) && runById.has(edge.to.replace(/^run:/, '')));
  const children = new Set(runEdges.map(edge => edge.to));
  const roots = runs.map(run => `run:${run.run_id}`).filter(id => !children.has(id));
  const adjacency = new Map();
  for (const edge of runEdges) { if (!adjacency.has(edge.from)) adjacency.set(edge.from, []); adjacency.get(edge.from).push(edge.to); }
  const visiting = new Set(), visited = new Set();
  function visit(id) {
    if (visiting.has(id)) { issues.push({ code: 'lineage_cycle', run_id: id.replace(/^run:/, ''), message: 'Cycle detected in run lineage.' }); return; }
    if (visited.has(id)) return;
    visiting.add(id); for (const child of adjacency.get(id) ?? []) visit(child); visiting.delete(id); visited.add(id);
  }
  for (const root of roots) visit(root);
  for (const run of runs) visit(`run:${run.run_id}`);
  const values = [...nodes.values()];
  return { model: 'RestoreProvenanceDAG/v1', roots, nodes: values, edges, issues, stats: { runs: runs.length, versions: values.filter(node => node.kind === 'version').length, artifacts: values.filter(node => node.kind === 'artifact').length, evaluations: values.filter(node => ['assessment', 'verification', 'diff', 'static_check', 'final_e2e'].includes(node.kind)).length, lineage_edges: runEdges.length } };
}

function badge(value) {
  const className = ['pass', 'complete', 'scored', 'keep', 'valid', 'available', 'recorded'].includes(value) ? 'good' : ['fail', 'failed', 'revert', 'invalid'].includes(value) ? 'bad' : ['unknown', 'unavailable', 'missing', 'incomplete', 'inconclusive', 'terminated', 'degraded'].includes(value) ? 'warn' : 'info';
  return `<span class="badge ${className}">${esc(value)}</span>`;
}
function table(headers, rows) { return `<div class="table-wrap"><table><thead><tr>${headers.map(item => `<th>${esc(item)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`; }

function renderRunDag(data) {
  const runs = data.runs, byId = new Map(runs.map((run, index) => [run.run_id, { run, index }]));
  const parentEdge = new Map(data.provenance.edges.filter(edge => ['continuation', 'contract_refreeze', 'legacy_lineage'].includes(edge.kind)).map(edge => [edge.to.replace(/^run:/, ''), edge]));
  const memo = new Map();
  function depth(id, stack = new Set()) {
    if (memo.has(id)) return memo.get(id); if (stack.has(id)) return 0;
    stack.add(id); const parent = parentEdge.get(id)?.from.replace(/^run:/, ''); const value = parent && byId.has(parent) ? depth(parent, stack) + 1 : 0;
    stack.delete(id); memo.set(id, value); return value;
  }
  const width = Math.max(900, ...runs.map(run => depth(run.run_id) * 250 + 260)), height = Math.max(160, runs.length * 72 + 28);
  const position = new Map(runs.map((run, index) => [run.run_id, { x: 18 + depth(run.run_id) * 250, y: 14 + index * 72 }]));
  const edges = data.provenance.edges.filter(edge => ['continuation', 'contract_refreeze', 'legacy_lineage'].includes(edge.kind)).map(edge => {
    const from = position.get(edge.from.replace(/^run:/, '')), to = position.get(edge.to.replace(/^run:/, '')); if (!from || !to) return '';
    const x1 = from.x + 216, y1 = from.y + 25, x2 = to.x, y2 = to.y + 25, mid = (x1 + x2) / 2;
    return `<path class="dag-edge ${esc(edge.status)}" data-edge-kind="${esc(edge.kind)}" data-edge-status="${esc(edge.status)}" d="M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}"><title>${esc(edge.kind)} · ${esc(edge.status)}</title></path>`;
  }).join('');
  const nodes = runs.map(run => {
    const { x, y } = position.get(run.run_id), version = run.label.match(/v\d+/)?.[0] ?? run.label.slice(-18);
    const body = `<g data-node-id="run:${esc(run.run_id)}" data-lineage-status="${esc(run.lineage.status)}"><rect class="dag-node-box ${esc(run.lineage.status)}" x="${x}" y="${y}" width="216" height="50" rx="9"></rect><text class="dag-title" x="${x + 10}" y="${y + 20}">${esc(version)}</text><text class="dag-meta" x="${x + 10}" y="${y + 38}">${esc(run.phase)} · ${esc(run.report_status)} · ${run.round_count} rounds</text></g>`;
    return run.report_href ? `<a href="${esc(run.report_href)}">${body}</a>` : body;
  }).join('');
  return `<div class="dag-scroll"><svg class="dag" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Restore run provenance DAG"><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z"></path></marker></defs>${edges}${nodes}</svg></div>`;
}

function render(data) {
  const latest = data.runs.at(-1), finalCount = data.runs.filter(run => run.e2e.status !== 'unavailable').length, groups = new Map();
  for (const run of data.runs) groups.set(run.comparison_group, (groups.get(run.comparison_group) ?? 0) + 1);
  const stateIds = [...new Set(data.runs.flatMap(run => run.state_coverage.map(state => state.id)))], dimensions = ['layout', 'style', 'content', 'interaction', 'robustness'];
  const runRows = data.runs.map(run => [`<strong>${esc(run.label)}</strong><br><span class="mono">${esc(short(run.run_id))}</span>`, badge(run.phase), esc(run.stop?.reason ?? '—'), String(run.round_count), `${badge('keep')} ${run.decisions.keep} · ${badge('revert')} ${run.decisions.revert} · ${badge('inconclusive')} ${run.decisions.inconclusive}`, `<span class="mono">${esc(short(run.best_artifact_sha256))}</span>`, badge(run.report_status), run.report_href ? `<a href="${esc(run.report_href)}">单次报告</a>` : badge('missing')]);
  const lineageRows = data.runs.map(run => [esc(run.label), badge(run.lineage.status), esc(run.lineage.relationship ?? 'root'), `<span class="mono">${esc(short(run.lineage.parent_run_id))}</span>`, esc(run.lineage.artifact_source ?? '—'), `<span class="mono">${esc(short(run.lineage.inherited_artifact_sha256))}</span>`, esc(run.lineage.issues.map(issue => issue.code).join(', ') || '—')]);
  const roundRows = data.runs.flatMap(run => run.rounds.map(round => [esc(run.label), esc(round.version_id), esc(round.issue_id ?? '—'), `<span class="mono">${esc(short(round.before_artifact_sha256))}</span>`, `<span class="mono">${esc(short(round.candidate_artifact_sha256))}</span>`, badge(round.completeness), badge(round.decision ?? 'unavailable'), esc(round.reason ?? '—'), round.assessment?.href ? `<a href="${esc(round.assessment.href)}">assessment</a>` : '—', round.verification?.href ? `<a href="${esc(round.verification.href)}">verification</a>` : '—', round.diff?.href ? `<a href="${esc(round.diff.href)}">diff</a>` : '—']));
  const scoreRows = data.runs.map(run => { const byId = new Map(run.e2e.dimensions.map(item => [item.id, item.score ?? item.status ?? '—'])); return [esc(run.label), badge(run.e2e.status), run.e2e.score_100 == null ? '—' : Number(run.e2e.score_100).toFixed(1), run.e2e.coverage_percent == null ? '—' : `${Number(run.e2e.coverage_percent).toFixed(0)}%`, ...dimensions.map(id => esc(byId.get(id) ?? '—')), `<span class="mono">${esc(short(run.comparison_group))}</span>`]; });
  const staticRows = data.runs.map(run => [esc(run.label), esc(run.static_checks.suite_id ?? '—'), badge(run.static_checks.selection), badge(run.static_checks.overall_status), `${run.static_checks.pass}/${run.static_checks.total}`, String(run.static_checks.fail), String(run.static_checks.unknown), String(run.static_checks.skipped), `${Number(run.static_checks.coverage_percent ?? 0).toFixed(1)}%`]);
  const stateRows = stateIds.map(id => [esc(id), ...data.runs.map(run => badge(run.state_coverage.find(state => state.id === id)?.status ?? 'unavailable'))]);
  const unknownRows = data.runs.filter(run => run.unknown_units.length || run.findings.length).map(run => [esc(run.label), esc(run.unknown_units.join(', ') || '—'), esc(run.findings.map(item => `${item.severity ?? 'finding'}: ${item.summary ?? item.reason ?? item.id}`).join('；') || '—')]);
  const integrityRows = data.runs.filter(run => run.report_status !== 'valid').map(run => [esc(run.label), badge(run.report_status), esc(run.integrity_issues.map(item => `${item.version_id ?? 'report'} / ${item.evidence_id ?? 'unknown'}: ${item.error ?? 'integrity issue'}`).join('；') || run.report_status_detail?.reason_code || '未提供详情。')]);
  const statusRows = data.runs.flatMap(run => [[run.report_status_detail, 'report', run.report_status], [run.e2e.status_detail, 'final_e2e', run.e2e.status], [run.static_checks.status_detail, 'static_checks', run.static_checks.overall_status]].filter(([detail]) => detail).map(([detail, layer, status]) => [esc(run.label), layer, badge(status), esc(detail.reason_code), esc(detail.cause_layer), esc(detail.recoverability)]));
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(data.title)}</title>
<style>:root{--bg:#f4f7fb;--panel:#fff;--ink:#14233a;--muted:#66758b;--line:#dce4ef;--accent:#137ea4;--good:#087b59;--bad:#b82f48;--warn:#a86410;--radius:16px;--shadow:0 14px 36px #13233c12;font-family:Inter,system-ui,"Segoe UI","Microsoft YaHei",sans-serif}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);line-height:1.55}.page{max-width:1500px;margin:auto;padding:28px}.hero{padding:30px;border-radius:22px;color:#fff;background:radial-gradient(circle at 85% 10%,#57d5df44,transparent 30%),linear-gradient(125deg,#102541,#153b59 55%,#35265f);box-shadow:var(--shadow)}h1{margin:0;font-size:clamp(34px,5vw,62px);line-height:1;letter-spacing:-.05em}.hero p{max-width:980px;color:#d7e5f4}.metrics{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-top:16px}.metric,.panel{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow)}.metric{padding:16px}.metric b{display:block;font-size:28px}.metric span,.note{color:var(--muted);font-size:12px}.section{margin-top:26px}.section h2{margin:0 0 4px}.panel{padding:18px}.table-wrap,.dag-scroll{overflow:auto}table{width:100%;border-collapse:collapse;font-size:12px}th,td{padding:10px;border-bottom:1px solid #e9eef5;text-align:left;vertical-align:top}th{position:sticky;top:0;background:#f8fafc;color:#52627a}.badge{display:inline-flex;padding:3px 7px;border-radius:999px;font-size:10px;font-weight:800;background:#e8f1ff;color:#2868c7}.badge.good{background:#e7f7f1;color:var(--good)}.badge.bad{background:#ffe8ec;color:var(--bad)}.badge.warn{background:#fff1dd;color:var(--warn)}.mono{font-family:Consolas,monospace;font-size:11px}a{color:var(--accent)}.callout{margin-top:14px;padding:14px 16px;border-left:4px solid var(--warn);border-radius:10px;background:#fff8ed}.legend{display:flex;gap:8px;flex-wrap:wrap}.dag{background:#f8fafc;border:1px solid var(--line);border-radius:12px}.dag-edge{fill:none;stroke:#7a8ba4;stroke-width:1.5;marker-end:url(#arrow)}.dag-edge.invalid,.dag-edge.degraded{stroke:var(--bad);stroke-dasharray:5 4}.dag-node-box{fill:#fff;stroke:#b9c7d8;stroke-width:1.5}.dag-node-box.invalid{stroke:var(--bad);stroke-width:2}.dag-title{font-size:12px;font-weight:800;fill:#1b2b43}.dag-meta{font-size:9px;fill:#66758b}#arrow path{fill:#7a8ba4}@media(max-width:900px){.page{padding:14px}.metrics{grid-template-columns:repeat(2,1fr)}}@media print{body{background:#fff}.panel,.metric,.hero{box-shadow:none}}</style></head><body><main class="page">
<section class="hero"><p class="mono">RESTORE CHALLENGE REPORT · ${esc(data.generated_at)}</p><h1>${esc(data.title)}</h1><p>统一汇总 ${data.runs.length} 个 run。Final E2E、Loop Assessment 与 StaticCheckSuite 分栏呈现；provenance DAG 保留 run、round、candidate、评估、验证、diff 与决策链接。</p></section>
<section class="metrics"><div class="metric"><span>RUNS</span><b>${data.runs.length}</b><span>含历史与当前 run</span></div><div class="metric"><span>VERSIONS</span><b>${data.provenance.stats.versions}</b><span>v0 与所有修复候选</span></div><div class="metric"><span>FINAL E2E</span><b>${finalCount}</b><span>其余不是零分，而是不可用</span></div><div class="metric"><span>LINEAGE EDGES</span><b>${data.provenance.stats.lineage_edges}</b><span>continuation / refreeze</span></div><div class="metric"><span>LATEST</span><b>${esc(latest?.label.match(/v\d+/)?.[0] ?? '—')}</b><span>${esc(latest?.phase ?? '—')} · ${esc(latest?.e2e.status ?? '—')}</span></div></section>
<section class="section"><h2>结论与边界</h2><div class="panel"><div class="callout"><strong>当前报告是可验证的 provenance 投影，不是新的评分源。</strong><div class="note">单次 run 的 contract、run、events、observations 和 report.json 仍为事实源；DAG 节点只保存哈希、状态和链接，避免复制大证据与增加 Agent 上下文。</div></div><p class="note">生成政策：${esc(latest?.generation_policy?.mode ?? 'unknown')}；case metadata visibility：${esc(latest?.generation_policy?.case_metadata_visibility ?? 'unknown')}；source reuse：${esc(latest?.generation_policy?.source_reuse ?? 'unknown')}。</p></div></section>
<section class="section"><h2>Provenance DAG</h2><p class="note">实线为可验证父子关系；红色虚线表示 legacy/invalid linkage。节点可链接到单次报告。JSON 同时保存 round、artifact、assessment、verification、diff、static-check 和 Final E2E 节点。</p><div class="panel">${renderRunDag(data)}${data.provenance.issues.length ? `<div class="callout"><strong>${data.provenance.issues.length} 个血缘问题</strong><div class="note">${esc(data.provenance.issues.map(issue => `${issue.run_id ?? 'graph'}: ${issue.code}`).join('；'))}</div></div>` : ''}</div></section>
<section class="section"><h2>跨 Run 血缘</h2><div class="panel">${table(['Run','Lineage status','Relationship','Parent','Artifact source','Inherited artifact','Issues'],lineageRows)}</div></section>
<section class="section"><h2>Round / Candidate 轨迹</h2><p class="note">每行对应一次生成 → 评估 → diff → 验证 → 决策。terminated 表示该轮明确中止，不伪造 candidate 结果。</p><div class="panel">${roundRows.length ? table(['Run','Version','Issue','Before','Candidate','Completeness','Decision','Reason','Assessment','Verification','Diff'],roundRows) : '<p>没有记录修复轮次。</p>'}</div></section>
<section class="section"><h2>版本轨迹</h2><p class="note">完整保留 keep / revert / inconclusive；candidate 被回退不等于没有发生。</p><div class="panel">${table(['Run','Phase','Stop','Rounds','Decisions','Best artifact','Report integrity','Evidence'],runRows)}</div></section>
<section class="section"><h2>缺失原因与可恢复性</h2><p class="note">missing、unavailable、incomplete 不再只显示标签；每项给出原因层和恢复策略。</p><div class="panel">${statusRows.length ? table(['Run','Layer','Status','Reason code','Cause layer','Recoverability'],statusRows) : '<p>没有缺失状态。</p>'}</div></section>
<section class="section"><h2>报告完整性</h2><p class="note">missing 只表示没有规范化单次 report.json；degraded 表示报告可读但依赖证据不再满足哈希绑定，相关正向结论被撤销。</p><div class="panel">${integrityRows.length ? table(['Run','Status','Issue'],integrityRows) : '<p>全部单次报告完整性有效。</p>'}</div></section>
<section class="section"><h2>最终 E2E 评分矩阵</h2><p class="note">只显示已记录的正式 E2E；—/unavailable 不解释为 0。comparison group 不同的行不可直接归因于模型能力变化。</p><div class="panel">${table(['Run','Status','Total/100','Coverage','Layout','Style','Content','Interaction','Robustness','同合同组'],scoreRows)}</div></section>
<section class="section"><h2>自动检查矩阵</h2><p class="note">优先显示绑定 run.best 的最新 StaticCheckSuite；若历史 run 没有 best 绑定套件，才回退到 latest_available 并显式标注。它证明可运行性与已执行诊断，不替代视觉/交互 Judge。</p><div class="panel">${table(['Run','Suite','Selection','Status','Pass/Total','Fail','Unknown','Skipped','Coverage'],staticRows)}</div></section>
<section class="section"><h2>Go 后状态覆盖</h2><p class="note">scored 表示最佳评估中该状态的全部适用 obligation 已评分；unknown 表示至少一项未核验；unavailable 表示没有可读最佳评估或义务记录。</p><div class="panel">${table(['State',...data.runs.map(run => run.label.match(/v\d+/)?.[0] ?? run.label)],stateRows)}</div></section>
<section class="section"><h2>剩余未知与 Finding</h2><div class="panel">${unknownRows.length ? table(['Run','Unknown units','Findings'],unknownRows) : '<p>没有已记录的未知项。</p>'}</div></section>
<section class="section"><h2>方法与可比性</h2><div class="panel"><div class="legend">${[...groups.entries()].map(([key,count])=>`<span class="badge info">${esc(short(key))} · ${count} runs</span>`).join('')}</div><ul><li>相同合同、Rubric 和 scorer 才进入同一横向组。</li><li>Source-assisted 结果不得与 clean-room benchmark 直接比较。</li><li>静态检查、Loop 评分与 Final E2E 是三类不同证据，不相互替代。</li><li>浏览器或 harness 故障必须单独记录，不能自动归因于候选实现。</li></ul><p class="mono">JSON SHA-256: __JSON_SHA__</p></div></section></main></body></html>`;
}

export async function buildChallengeReport(outputDir, runDirs, options = {}) {
  const outputRoot = resolve(outputDir); await mkdir(outputRoot, { recursive: true });
  const runs = []; for (const directory of runDirs) runs.push(await readRun(resolve(directory), outputRoot));
  const provenance = buildProvenance(runs);
  const data = { schema_version: 'RestoreChallengeReport/v2', title: options.title ?? 'Restore Challenge · Unified Evaluation Report', generated_at: new Date().toISOString(), comparison_rule: 'contract_sha256 + rubric_version + scorer_version', provenance, runs };
  const jsonText = `${JSON.stringify(data, null, 2)}\n`, jsonHash = sha(jsonText), htmlText = render(data).replace('__JSON_SHA__', jsonHash);
  const jsonPath = join(outputRoot, 'challenge-report.json'), htmlPath = join(outputRoot, 'challenge-report.html');
  await writeFile(jsonPath, jsonText); await writeFile(htmlPath, htmlText);
  return { json: jsonPath, html: htmlPath, json_sha256: jsonHash, html_sha256: sha(htmlText) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [outputDir, ...runDirs] = process.argv.slice(2);
  if (!outputDir || !runDirs.length) throw new Error('Usage: node scripts/restore/challenge-report.mjs OUTPUT_DIR RUN_DIR...');
  console.log(JSON.stringify(await buildChallengeReport(outputDir, runDirs), null, 2));
}
