import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildChallengeReport } from '../challenge-report.mjs';

async function json(path, value) {
  await writeFile(path, JSON.stringify(value, null, 2));
}

async function fixture(root, name, { phase, contractHash, e2e = null, report = true }) {
  const runRoot = join(root, name);
  await mkdir(runRoot, { recursive: true });
  const run = {
    schema_version: 'restore/v0.2', run_id: name, started_at: '2026-10-21T00:00:00.000Z',
    tier: 'complex', phase, rounds: [{
      round: 1, version_id: 'v1', key: `${name}-round-1`, issue_id: 'flight',
      before: 'b'.repeat(64), candidate: 'c'.repeat(64),
      assessment: 'observations/assessment.json', verification: 'observations/verification.json',
      diff: { uri: 'observations/diff.json', sha256: 'd'.repeat(64) },
      decision: 'keep', reason: 'Candidate improved the frozen flight obligation.'
    }],
    static_checks: [
      { suite_id: 'best-suite', stage: 'initial', artifact_sha256: 'a'.repeat(64), summary: { total: 2, pass: 1, fail: 0, unknown: 1, skipped: 0, coverage_percent: 50, overall_status: 'incomplete' } },
      { suite_id: 'reverted-candidate-suite', stage: 'candidate', artifact_sha256: 'c'.repeat(64), summary: { total: 2, pass: 0, fail: 2, unknown: 0, skipped: 0, coverage_percent: 100, overall_status: 'fail' } }
    ],
    best: 'a'.repeat(64), baseline: 'b'.repeat(64), stop: phase === 'complete' ? { reason: 'plateau' } : null,
    e2e, contract_sha256: contractHash, best_assessment: null
  };
  await json(join(runRoot, 'run.json'), run);
  await json(join(runRoot, 'contract.json'), {
    schema_version: 'restore/v0.2', requested_url: 'https://example.test/',
    generation_policy: { mode: 'source_assisted', case_metadata_visibility: 'id_only', source_reuse: 'allowed' },
    e2e_profile: { rubric_version: 'site-restore-v1.2-draft', scorer_version: 'e2e/v0.4' },
    states: [{ id: 'go' }, { id: 'flight' }],
    obligations: [{ id: 'go-unit', state_id: 'go' }, { id: 'flight-unit', state_id: 'flight' }]
  });
  await mkdir(join(runRoot, 'observations'), { recursive: true });
  await json(join(runRoot, 'observations', 'assessment.json'), { schema_version: 'LoopAssessment/v0.2' });
  await json(join(runRoot, 'observations', 'verification.json'), { schema_version: 'LoopVerification/v0.2' });
  await json(join(runRoot, 'observations', 'diff.json'), { schema_version: 'ArtifactDiff/v1' });
  if (report) await json(join(runRoot, 'report.json'), {
    schema_version: 'RestoreReport/v0.2', run_id: name, integrity: { status: 'valid', issues: [] },
    e2e, e2e_scoring_summary: e2e ? { score_100: 60, coverage_percent: 100, score_type: 'complete' } : null
  });
  return runRoot;
}

test('challenge report preserves missing and unknown evaluation state', async () => {
  const root = await mkdtemp(join(tmpdir(), 'restore-challenge-'));
  const a = await fixture(root, 'v1', { phase: 'complete', contractHash: 'c'.repeat(64), e2e: { status: 'fail', total_100: 60, dimensions: [{ id: 'layout', score: 2 }] } });
  const b = await fixture(root, 'v2', { phase: 'loop', contractHash: 'd'.repeat(64), report: false });
  const childRun = JSON.parse(await readFile(join(b, 'run.json'), 'utf8'));
  const lineage = {
    schema_version: 'RestoreLineage/v1', relationship: 'continuation', created_at: '2026-10-21T00:10:00.000Z',
    child_run_id: childRun.run_id,
    parent: {
      run_id: 'v1', started_at: '2026-10-21T00:00:00.000Z', run_json_sha256: '1'.repeat(64),
      events_jsonl_sha256: '2'.repeat(64), contract_sha256: 'c'.repeat(64),
      best_artifact_sha256: 'a'.repeat(64), report: { href: '../v1/report.html' }
    },
    inherited: {
      contract_sha256: 'c'.repeat(64), reference_evidence_sha256: '3'.repeat(64),
      artifact_sha256: 'a'.repeat(64), artifact_source: 'best_snapshot',
      generation_policy: { mode: 'source_assisted', case_metadata_visibility: 'id_only', source_reuse: 'allowed' }
    }
  };
  await json(join(b, 'lineage.json'), lineage);
  childRun.lineage = { uri: 'lineage.json', relationship: 'continuation', parent_run_id: 'v1' };
  await json(join(b, 'run.json'), childRun);
  const out = join(root, 'out');
  const result = await buildChallengeReport(out, [a, b], { title: 'Fixture report' });
  const data = JSON.parse(await readFile(result.json, 'utf8'));
  const html = await readFile(result.html, 'utf8');
  assert.equal(data.schema_version, 'RestoreChallengeReport/v2');
  assert.equal(data.runs.length, 2);
  assert.equal(data.runs[0].e2e.status, 'fail');
  assert.equal(data.runs[1].e2e.status, 'unavailable');
  assert.equal(data.runs[1].report_status, 'missing');
  assert.equal(data.runs[1].report_status_detail.reason_code, 'report_json_missing');
  assert.equal(data.runs[1].e2e.status_detail.reason_code, 'final_e2e_not_recorded');
  assert.equal(data.runs[0].static_checks.suite_id, 'best-suite');
  assert.equal(data.runs[0].static_checks.selection, 'best_artifact');
  assert.notEqual(data.runs[0].comparison_group, data.runs[1].comparison_group);
  assert.equal(data.runs[0].round_count, 1);
  assert.equal(data.runs[0].rounds[0].candidate_artifact_sha256, 'c'.repeat(64));
  assert.equal(data.runs[1].lineage.parent_run_id, 'v1');
  assert.equal(data.provenance.edges.some(edge => edge.kind === 'continuation' && edge.from === 'run:v1' && edge.to === 'run:v2'), true);
  assert.equal(data.provenance.nodes.some(node => node.kind === 'version' && node.id === 'version:v1:v1'), true);
  assert.equal(data.provenance.roots.includes('run:v1'), true);
  assert.match(html, /Fixture report/);
  assert.match(html, /unavailable/);
  assert.match(html, /同合同/);
  assert.match(html, /Provenance DAG/);
  assert.match(html, /Candidate improved the frozen flight obligation/);
});
