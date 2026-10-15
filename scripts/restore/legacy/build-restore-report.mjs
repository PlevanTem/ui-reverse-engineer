#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { renderRestoreReport } from './render-restore-report.mjs';

const runDir = process.argv[2] && resolve(process.argv[2]);
if (!runDir || process.argv.length !== 3) {
  process.stderr.write('Usage: node evals/pipeline/build-restore-report.mjs <run-directory>\n');
  process.exitCode = 2;
} else {
  try {
    const report = await readJson(join(runDir, 'report-source.json'));
    const index = await readJson(join(runDir, 'docs/index.json'));
    if (!Array.isArray(index) || index.length !== 5) throw new Error('docs/index.json must list T0–T4 exactly once');
    const stages = ['T0', 'T1', 'T2', 'T3', 'T4'];
    if (stages.some(stage => index.filter(x => x.stage === stage).length !== 1)) throw new Error('docs/index.json must list T0–T4 exactly once');
    report.process_docs = await Promise.all(stages.map(async stage => {
      const item = index.find(x => x.stage === stage);
      if (!['complete', 'partial', 'blocked'].includes(item.status)) throw new Error(`Invalid ${stage} status`);
      const path = safeLocalPath(runDir, item.uri);
      return { stage, title: item.title, uri: item.uri, status: item.status,
        summary: item.summary ?? '', updated_at: item.updated_at ?? '', sha256: sha(await readFile(path)) };
    }));
    report.run ??= {};
    report.run.manifest_sha256 = sha(await readFile(join(runDir, 'manifest.json')));
    report.run.fixture_sha256 = sha(await readFile(join(runDir, 'fixture.json')));
    report.output ??= {};
    report.output.artifact_sha256 = await hashTree(join(runDir, 'restored'));
    for (const evidence of [...(report.input?.reference_evidence ?? []), ...(report.evidence_index ?? [])]) {
      if (!evidence.uri || /^https?:\/\//i.test(evidence.uri)) continue;
      try { evidence.sha256 = sha(await readFile(safeLocalPath(runDir, evidence.uri))); }
      catch { evidence.sha256 = ''; }
    }
    const reportPath = join(runDir, 'report.json');
    const htmlPath = join(runDir, 'report.html');
    await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
    await renderRestoreReport(reportPath, htmlPath);
    process.stdout.write(`Assembled ${reportPath}\n`);
  } catch (error) {
    process.stderr.write(`Restore report build failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}

async function readJson(path) { return JSON.parse(await readFile(path, 'utf8')); }
function sha(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function safeLocalPath(base, uri) {
  if (typeof uri !== 'string' || !uri || isAbsolute(uri) || /^[a-z][a-z\d+.-]*:/i.test(uri)) throw new Error(`Unsafe local path: ${uri}`);
  const path = resolve(base, uri);
  if (path === base || !path.startsWith(base + sep)) throw new Error(`Path outside run directory: ${uri}`);
  return path;
}
async function hashTree(root) {
  try { if (!(await stat(root)).isDirectory()) return ''; } catch { return ''; }
  const files = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) files.push(path);
    }
  }
  await walk(root);
  if (!files.length) return '';
  const hash = createHash('sha256');
  for (const file of files.sort()) {
    hash.update(relative(root, file).replaceAll('\\', '/'));
    hash.update('\0');
    hash.update(await readFile(file));
    hash.update('\0');
  }
  return hash.digest('hex');
}
