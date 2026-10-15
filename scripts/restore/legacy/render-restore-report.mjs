#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join as joinPath, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const templatePath = fileURLToPath(new URL('../../../assets/restore/legacy/restore-loop-report.html', import.meta.url));
const usage = 'Usage: node evals/pipeline/render-restore-report.mjs <report.json> <report.html> [--approval <approval.json>]';
const [inputPath, outputPath, option, approvalPath] = process.argv.slice(2);

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!inputPath || !outputPath || (option && option !== '--approval') || (option && !approvalPath)) {
    process.stderr.write(`${usage}\n`);
    process.exitCode = 2;
  } else {
    await main();
  }
}

async function main() {
  try {
    await renderRestoreReport(inputPath, outputPath, approvalPath);
  } catch (error) {
    process.stderr.write(`Report generation failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}

export async function renderRestoreReport(inputPath, outputPath, approvalPath) {
    const report = JSON.parse(await readFile(inputPath, 'utf8'));
    validate(report);
    const digest = createHash('sha256').update(stableJson(report)).digest('hex');
    const docChecks = await checkProcessDocs(report, inputPath);
    const artifactChecks = await checkRunArtifacts(report, inputPath);
    const eligible = eligibleForPositiveDecision(report, docChecks, artifactChecks);
    const template = await readFile(templatePath, 'utf8');
    const templateDigest = createHash('sha256').update(template).digest('hex');
    const approval = approvalPath ? JSON.parse(await readFile(approvalPath, 'utf8')) : null;
    if (approval) validateApproval(approval, report, digest, templateDigest, eligible);
    const context = {
      run_id: report.run.run_id,
      case_id: report.run.case_id,
      report_sha256: digest,
      template_sha256: templateDigest,
      eligible_for_positive_decision: eligible,
      judge_calibrated: report.quality.judge.status === 'calibrated'
    };
    const title = `${report.run.case_id} · Restore 审批报告`;
    const replacements = {
      TITLE: escapeHtml(title),
      BODY: renderBody(report, approval, digest, templateDigest, eligible, docChecks, artifactChecks),
      CONTEXT_JSON: JSON.stringify(context).replaceAll('<', '\\u003c')
    };
    const html = template.replace(/\{\{(TITLE|BODY|CONTEXT_JSON)\}\}/g, (_, key) => replacements[key]);
    await mkdir(dirname(resolve(outputPath)), { recursive: true });
    await writeFile(outputPath, html, 'utf8');
    process.stdout.write(`Wrote ${outputPath}\nReport SHA-256: ${digest}\nApproval: ${approval ? approval.decision : 'pending'}\n`);
}

function validate(report) {
  if (!report || report.schema_version !== 'restore-loop-report/v0.1') throw new Error('schema_version must be restore-loop-report/v0.1');
  for (const key of ['report_id', 'run', 'input', 'output', 'quality', 'iterations', 'process_docs']) {
    if (report[key] == null) throw new Error(`Missing required field: ${key}`);
  }
  for (const key of ['run_id', 'case_id', 'fixture_version', 'manifest_sha256', 'stop_reason']) {
    if (!nonempty(report.run[key])) throw new Error(`Missing run.${key}`);
  }
  for (const key of ['task', 'requested_url', 'observed_url']) {
    if (!nonempty(report.input[key])) throw new Error(`Missing input.${key}`);
  }
  for (const key of ['project_path', 'start_command', 'candidate_ref']) {
    if (!nonempty(report.output[key])) throw new Error(`Missing output.${key}`);
  }
  for (const key of ['pages', 'states', 'viewports', 'reference_evidence']) requireArray(report.input[key], `input.${key}`);
  for (const key of ['implemented_pages', 'implemented_states']) requireArray(report.output[key], `output.${key}`);
  for (const key of ['redlines', 'metrics']) requireArray(report.quality[key], `quality.${key}`);
  if (!report.quality.judge || !['unmeasured', 'calibrated', 'manual_reviewed', 'failed_calibration'].includes(report.quality.judge.status)) throw new Error('quality.judge.status is required');
  requireArray(report.iterations, 'iterations');
  requireArray(report.process_docs, 'process_docs');
  requireArray(report.quality.comparisons ?? [], 'quality.comparisons');
  requireArray(report.quality.rubric_scores ?? [], 'quality.rubric_scores');
  requireArray(report.residuals ?? [], 'residuals');
  requireArray(report.evidence_index ?? [], 'evidence_index');
  unique(report.quality.redlines.map(x => x.id), 'quality.redlines.id');
  unique(report.quality.metrics.map(x => x.id), 'quality.metrics.id');
  unique((report.quality.rubric_scores ?? []).map(x => x.id), 'quality.rubric_scores.id');
  unique((report.quality.comparisons ?? []).map(x => `${x.state_id}/${x.viewport}`), 'quality.comparisons state/viewport');
  unique(report.iterations.map(x => x.round), 'iterations.round');
  unique(report.process_docs.map(x => x.stage), 'process_docs.stage');
  if (!report.demo && ['T0','T1','T2','T3','T4'].some(stage => !report.process_docs.some(x => x.stage === stage))) throw new Error('process_docs must cover T0–T4');
  for (const doc of report.process_docs) {
    if (!['T0','T1','T2','T3','T4'].includes(doc.stage) || !nonempty(doc.title) || !nonempty(doc.uri) || !['complete','partial','blocked'].includes(doc.status)) throw new Error(`Invalid process document: ${doc.stage ?? 'missing stage'}`);
  }
  unique((report.evidence_index ?? []).map(x => x.id), 'evidence_index.id');
  if (!report.iterations.some(x => x.round === 0 && x.decision === 'baseline')) throw new Error('iterations must include round 0 baseline');
  for (const line of report.quality.redlines) {
    if (!nonempty(line.id) || !['pass', 'fail', 'unknown', 'not_applicable'].includes(line.status)) throw new Error(`Invalid redline: ${line.id ?? 'missing id'}`);
  }
  for (const metric of report.quality.metrics) {
    if (!nonempty(metric.id) || !nonempty(metric.label) || !nonempty(metric.category)) throw new Error(`Invalid metric: ${metric.id ?? 'missing id'}`);
    for (const key of ['baseline', 'final', 'delta']) {
      if (metric[key] != null && (typeof metric[key] !== 'number' || !Number.isFinite(metric[key]))) throw new Error(`Metric ${metric.id}.${key} must be a finite number or null`);
    }
    const comparable = metric.baseline != null && metric.final != null;
    if (comparable && (metric.delta == null || Math.abs(metric.delta - (metric.final - metric.baseline)) > 1e-9)) throw new Error(`Metric ${metric.id}.delta must equal final - baseline`);
    if (!comparable && metric.delta != null) throw new Error(`Metric ${metric.id}.delta must be null when baseline or final is unmeasured`);
  }
  if ((report.quality.rubric_scores ?? []).length) {
    const scores = report.quality.rubric_scores;
    if (scores.some(x => !Number.isInteger(x.score) || x.score < 0 || x.score > 4 || !Number.isFinite(x.weight) || x.weight <= 0 || !nonempty(x.evaluator) || !nonempty(x.reason) || !Array.isArray(x.evidence))) throw new Error('Invalid rubric score');
    const weight = scores.reduce((sum,x) => sum + x.weight,0);
    if (Math.abs(weight-100)>1e-9) throw new Error('Rubric weights must sum to 100');
    const expected = scores.reduce((sum,x) => sum + x.weight*x.score/4,0);
    if (report.quality.rubric_total_100 == null || Math.abs(report.quality.rubric_total_100-expected)>1e-9) throw new Error('rubric_total_100 must equal weighted dimension scores');
  }
  for (const item of report.iterations) {
    if (!Number.isInteger(item.round) || item.round < 0 || !['baseline', 'keep', 'revert', 'inconclusive'].includes(item.decision)) throw new Error(`Invalid iteration: ${item.round}`);
  }
  const rounds = report.iterations.map(x => x.round).sort((a,b) => a-b);
  if (rounds.some((round,index) => round !== index)) throw new Error('Iteration rounds must be contiguous from 0');
  if (!report.demo && /DEMO-NOT-A-REAL-HASH/.test(JSON.stringify(report))) throw new Error('Demo placeholder hash cannot be used in a real report');
}

function validateApproval(approval, report, digest, templateDigest, eligible) {
  if (approval.schema_version !== 'restore-loop-approval/v0.1') throw new Error('Invalid approval schema_version');
  if (approval.report_sha256 !== digest || approval.template_sha256 !== templateDigest || approval.run_id !== report.run.run_id || approval.case_id !== report.run.case_id) throw new Error('Approval does not match this report or template');
  if (!['go', 'conditional_go', 'no_go'].includes(approval.decision)) throw new Error('Invalid approval decision');
  for (const key of ['record_id', 'reviewer', 'decided_at', 'rationale']) if (!nonempty(approval[key])) throw new Error(`Missing approval.${key}`);
  if (typeof approval.manual_reviewed !== 'boolean') throw new Error('approval.manual_reviewed must be boolean');
  if ((approval.decision === 'go' || approval.decision === 'conditional_go') && !eligible) throw new Error('Positive decision is blocked by report gates');
  if ((approval.decision === 'go' || approval.decision === 'conditional_go') && report.quality.judge.status !== 'calibrated' && approval.manual_reviewed !== true) throw new Error('Positive decision requires a recorded manual visual review when Judge is uncalibrated');
  if (approval.decision === 'conditional_go' && (!Array.isArray(approval.conditions) || approval.conditions.length === 0)) throw new Error('Conditional Go requires conditions');
}

async function checkProcessDocs(report, inputPath) {
  const base = resolve(dirname(inputPath));
  return Promise.all(report.process_docs.map(async doc => {
    if (isAbsolute(doc.uri) || /^[a-z][a-z\d+.-]*:/i.test(doc.uri)) return { stage: doc.stage, integrity: 'invalid_path' };
    const file = resolve(base, doc.uri);
    if (file !== base && !file.startsWith(base + sep)) return { stage: doc.stage, integrity: 'invalid_path' };
    try {
      const digest = createHash('sha256').update(await readFile(file)).digest('hex');
      return { stage: doc.stage, integrity: digest === doc.sha256 ? 'verified' : 'hash_mismatch' };
    } catch {
      return { stage: doc.stage, integrity: 'missing' };
    }
  }));
}

async function checkRunArtifacts(report, inputPath) {
  if (report.demo) return { fixture: 'demo', manifest: 'demo', artifact: 'demo', evidence: 'demo' };
  const base = resolve(dirname(inputPath));
  const fileCheck = async (uri, expected) => {
    const file = safeRunPath(base, uri);
    if (!file || !isSha256(expected)) return 'invalid';
    try { return createHash('sha256').update(await readFile(file)).digest('hex') === expected ? 'verified' : 'hash_mismatch'; }
    catch { return 'missing'; }
  };
  const fixture = await fileCheck('fixture.json', report.run.fixture_sha256);
  const manifest = await fileCheck('manifest.json', report.run.manifest_sha256);
  const artifactPath = safeRunPath(base, report.output.project_path);
  let artifact = 'invalid';
  if (artifactPath && isSha256(report.output.artifact_sha256)) {
    const actual = await hashTree(artifactPath);
    artifact = actual ? actual === report.output.artifact_sha256 ? 'verified' : 'hash_mismatch' : 'missing';
  }
  const entries = [...report.input.reference_evidence, ...(report.evidence_index ?? [])];
  const results = await Promise.all(entries.map(x => fileCheck(x.uri, x.sha256)));
  return { fixture, manifest, artifact, evidence: results.length > 0 && results.every(x => x === 'verified') ? 'verified' : `failed ${results.filter(x => x !== 'verified').length}/${results.length}` };
}

function safeRunPath(base, uri) {
  if (typeof uri !== 'string' || !uri || isAbsolute(uri) || /^[a-z][a-z\d+.-]*:/i.test(uri)) return null;
  const file = resolve(base, uri);
  return file.startsWith(base + sep) ? file : null;
}

async function hashTree(root) {
  try { if (!(await stat(root)).isDirectory()) return ''; } catch { return ''; }
  const files = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = joinPath(dir, entry.name);
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

function eligibleForPositiveDecision(report, docChecks, artifactChecks) {
  const judge = report.quality.judge ?? {};
  const evidenceIds = new Set((report.evidence_index ?? []).map(x => x.id));
  return !report.demo
    && report.process_docs.length === 5
    && report.process_docs.every(x => x.status === 'complete' && isSha256(x.sha256))
    && docChecks.every(x => x.integrity === 'verified')
    && Object.values(artifactChecks).every(x => x === 'verified')
    && isSha256(report.run.fixture_sha256)
    && isSha256(report.run.manifest_sha256)
    && isSha256(report.output.artifact_sha256)
    && report.input.reference_evidence.some(x => isSha256(x.sha256))
    && report.quality.redlines.length > 0
    && report.quality.redlines.every(x => x.status === 'pass' || x.status === 'not_applicable')
    && report.quality.redlines.filter(x => x.status === 'pass').every(x => evidenceIds.has(x.evidence))
    && report.quality.metrics.length > 0
    && report.quality.metrics.every(x => x.applicability === 'not_applicable' || x.final != null)
    && report.quality.metrics.filter(x => x.applicability !== 'not_applicable').every(x => evidenceIds.has(x.evidence))
    && report.iterations.every(x => (x.evidence ?? []).length > 0 && x.evidence.every(id => evidenceIds.has(id)))
    && (judge.status !== 'calibrated' || (Number.isFinite(judge.kappa) && judge.sample_size > 0));
}

function renderBody(r, approval, digest, templateDigest, eligible, docChecks, artifactChecks) {
  const verdict = approval?.decision ?? 'pending';
  const redlinePass = r.quality.redlines.filter(x => x.status === 'pass').length;
  const finalMetrics = r.quality.metrics.filter(x => x.final != null).length;
  const evidenceIds = new Set((r.evidence_index ?? []).map(x => x.id));
  const evidenceRef = id => evidenceIds.has(id) ? `<a href="#${domId(id)}">${e(id)}</a>` : e(id ?? '未提供');
  const evidenceById = new Map((r.evidence_index ?? []).map(x => [x.id,x]));
  const nav = [
    ['overview','审阅摘要'], ['process','文档流转'], ['input','输入与参考'], ['output','输出项目'],
    ['quality','质量与指标'], ['iterations','迭代过程'], ['residuals','残差与证据'], ['approval','统一审批']
  ];
  const hero = `<div class="hero"><div class="hero-main"><div class="eyebrow">Restore · review packet / ${e(r.report_id)}</div><h1>${e(r.run.case_id)} 还原审批报告</h1><p class="subtitle">${e(r.input.task)}</p><div class="meta-row">${chip(`Run ${r.run.run_id}`)}${chip(`Fixture ${r.run.fixture_version}`)}${chip(`Skill ${r.run.skill_version ?? '未提供'}`)}${chip(`停止：${r.run.stop_reason}`)}</div></div><div class="hero-status"><div><div class="eyebrow">审批状态</div><div class="status-large">${decisionLabel(verdict)}</div><p class="micro">${r.demo ? '演示模板 · 非真实评测' : eligible ? '门禁资料齐备，可进行审批' : '存在未通过、未测或待判项'}</p></div>${badge(verdict, decisionLabel(verdict))}</div></div>`;
  const overview = section('overview','审阅摘要','先看门禁、覆盖和停止原因',
    `<div class="note ${r.demo ? 'warning' : ''}">${r.demo ? '本页全部数值与证据路径仅演示报告结构，不构成真实评测或审批。' : `本报告绑定 Run ${e(r.run.run_id)}，所有审批记录必须与下方 SHA-256 一致。`}</div>` +
    `<div class="subsection"><div class="kv-grid">${kv('Run ID',r.run.run_id)}${kv('Case ID',r.run.case_id)}${kv('报告生成时间',r.run.completed_at ?? '未提供')}${kv('运行环境',r.run.environment ?? '未提供')}${kv('模型 / Effort',`${r.run.model ?? '未提供'} / ${r.run.effort ?? '未提供'}`)}${kv('结束原因',r.run.stop_reason)}${kv('Fixture / Manifest 完整性',`${artifactChecks.fixture} / ${artifactChecks.manifest}`)}${kv('项目 / 证据完整性',`${artifactChecks.artifact} / ${artifactChecks.evidence}`)}${kv('Manifest SHA-256',r.run.manifest_sha256)}${kv('报告 SHA-256',digest)}${kv('模板 SHA-256',templateDigest)}</div></div>`);
  const process = section('process','文档流转','T0–T4 阶段记录与原始证据索引；审批为独立 T5 记录',
    table(['阶段','文档','声明状态','文件完整性','摘要 / 更新时间'],r.process_docs.map(x => [e(x.stage),`${e(x.title)}<br>${href(x.uri)}`,badge(x.status,x.status === 'complete' ? '完成' : x.status === 'partial' ? '部分完成' : '受阻'),badge(docChecks.find(c => c.stage === x.stage)?.integrity ?? 'missing',docChecks.find(c => c.stage === x.stage)?.integrity === 'verified' ? '哈希匹配' : '待核实'),e(`${x.summary ?? '—'} · ${x.updated_at ?? '—'}`)])));
  const input = section('input','输入与参考','任务边界、参考证据与未知项',
    `<div class="kv-grid">${kv('原始任务',r.input.task)}${kv('请求 URL',r.input.requested_url)}${kv('实际落地 URL',r.input.observed_url)}${kv('目标页面',join(r.input.pages))}${kv('目标状态',join(r.input.states))}${kv('视口',join(r.input.viewports))}${kv('设计约束',join(r.input.design_constraints ?? []))}${kv('验收条件',join(r.input.acceptance_criteria ?? []))}${kv('排除范围',join(r.input.out_of_scope ?? []))}${kv('已证实技术栈',join(r.input.technology_stack ?? []))}</div>` +
    subheading('参考证据') + table(['ID','类型 / 名称','位置','哈希 / 覆盖'],r.input.reference_evidence.map(x => [e(x.id),e(`${x.kind ?? '—'} / ${x.label ?? '—'}`),href(x.uri),e(`${x.sha256 ?? '未提供'} · ${x.coverage ?? '未知'}`)])) +
    subheading('关键资源') + table(['资源','来源','状态','用途'],(r.input.resources ?? []).map(x => [e(x.name),e(x.source),e(x.status),e(x.used_as)])) +
    subheading('输入未知项') + list(r.input.unknowns ?? []));
  const output = section('output','输出项目','可运行入口、覆盖与重要偏差',
    `<div class="kv-grid">${kv('项目路径',r.output.project_path)}${kv('启动命令',r.output.start_command)}${kv('最终候选',r.output.candidate_ref)}${kv('产物 SHA-256',r.output.artifact_sha256 ?? '未提供')}${kv('已实现页面',join(r.output.implemented_pages))}${kv('已实现状态',join(r.output.implemented_states))}${kv('实现技术选择',join(r.output.technology_choices ?? []))}</div>` + subheading('重要替代与差异') + list(r.output.deviations ?? []));
  const quality = section('quality','质量与指标','红线优先；诊断指标不替代 E2E 结论',
    subheading('红线') + table(['ID','要求','状态','证据'],r.quality.redlines.map(x => [e(x.id),e(x.label),badge(x.status,statusLabel(x.status)),evidenceRef(x.evidence)])) +
    subheading('分层诊断指标') + table(['维度 / 指标','基线','最终','变化','覆盖 / 方法 / 置信'],r.quality.metrics.map(x => [e(`${x.category ?? '—'} / ${x.label ?? x.id}`),value(x.baseline,x.unit),value(x.final,x.unit),value(x.delta,x.unit),`${e(`${x.coverage ?? '未提供'} · ${x.method ?? '未提供'} · ${x.confidence ?? '未提供'}`)} · ${evidenceRef(x.evidence)}`])) +
    subheading('E2E Rubric 分维自评') + ((r.quality.rubric_scores ?? []).length ? `<div class="note warning">${e(`加权 ${r.quality.rubric_total_100}/100。此分数由实现者依据冻结截图和行为证据作方向性自评，未盲化、未做人评一致性校准，不能用作跨方案版本 Go。`)}</div>` + table(['维度 / 权重','分数','评分者 / 置信','依据 / 证据'],r.quality.rubric_scores.map(x => [e(`${x.label} / ${x.weight}%`),e(`${x.score}/4`),e(`${x.evaluator} · ${x.confidence}`),`${e(x.reason)} · ${x.evidence.map(evidenceRef).join('、')}`])) : '<div class="empty">尚未进行 0–4 E2E Rubric 评分。</div>') +
    subheading('同状态视觉对照') + ((r.quality.comparisons ?? []).length ? `<div class="comparison-list">${r.quality.comparisons.map(x => `<div class="comparison"><div class="comparison-title"><strong>${e(x.state_id)}</strong><span>${e(x.viewport)} · MAE ${x.mae_0_255 == null ? '未测' : e(x.mae_0_255.toFixed(3))}/255</span></div><div class="comparison-images">${[['参考',x.reference_evidence],['还原',x.candidate_evidence],['差异',x.diff_evidence]].filter(([,id])=>id).map(([label,id])=>{const item=evidenceById.get(id);return `<figure><figcaption>${e(label)} · ${evidenceRef(id)}</figcaption>${item && safeImageUri(item.uri) ? `<a href="${e(item.uri)}" target="_blank" rel="noopener"><img src="${e(item.uri)}" alt="${e(x.state_id)} ${e(label)}"></a>` : '<div class="empty">图像不可用</div>'}</figure>`}).join('')}</div><p class="micro">${e(x.note ?? '')}</p></div>`).join('')}</div>` : '<div class="empty">尚无配对截图。</div>') +
    subheading('评委可信度') + `<div class="kv-grid">${kv('状态',r.quality.judge?.status ?? '未提供')}${kv('κ',r.quality.judge?.kappa ?? '未测')}${kv('校准样本量',r.quality.judge?.sample_size ?? '未测')}${kv('偏差测试',r.quality.judge?.bias_result ?? '未提供')}</div>` +
    subheading('重点发现') + table(['严重度','发现','状态 / 证据','下一步'],(r.quality.findings ?? []).map(x => [badge(x.severity,x.severity),e(x.title),`${e(x.state ?? '—')} / ${evidenceRef(x.evidence)}`,e(x.next_action ?? '—')])));
  const iterations = section('iterations','迭代过程','基线、候选、回归与保留决定',
    `<div class="timeline">${r.iterations.slice().sort((a,b) => a.round-b.round).map(x => `<div class="timeline-item"><div class="timeline-title">第 ${e(x.round)} 轮 ${badge(x.decision,statusLabel(x.decision))} <span class="tiny">${e(x.at ?? '')}</span></div><p><strong>假设：</strong>${e(x.hypothesis ?? '未记录')}　<strong>目标：</strong>${e(x.target ?? '未记录')}</p><p><strong>候选：</strong>${e(x.change_ref ?? '未记录')}　<strong>前 → 后：</strong>${e(x.before ?? '未测')} → ${e(x.after ?? '未测')}</p><p><strong>回归：</strong>${e(join(x.regressions ?? [],'无'))}　<strong>证据：</strong>${(x.evidence ?? []).length ? x.evidence.map(evidenceRef).join('、') : '未提供'}</p></div>`).join('')}</div>`);
  const residuals = section('residuals','残差与证据索引','未解决、未知与可复核位置',
    subheading('剩余问题') + table(['ID','严重度 / 状态','说明','后续动作'],(r.residuals ?? []).map(x => [e(x.id),`${badge(x.severity,x.severity)} ${badge(x.status,statusLabel(x.status))}`,e(x.description),e(x.next_action ?? '—')])) +
    subheading('证据索引') + table(['ID','类型 / 名称','位置','哈希 / 完整性'],(r.evidence_index ?? []).map(x => [`<span id="${domId(x.id)}">${e(x.id)}</span>`,e(`${x.kind ?? '—'} / ${x.label ?? '—'}`),href(x.uri),e(`${x.sha256 ?? '未提供'} · ${x.coverage ?? '未知'}`)])));
  const approvalSection = section('approval','统一审批','审批决定绑定本次报告摘要',approval
    ? `<div class="note"><strong>${decisionLabel(approval.decision)}</strong> · ${e(approval.reviewer)} · ${e(approval.decided_at)}</div><div class="subsection kv-grid">${kv('记录 ID',approval.record_id)}${kv('决定理由',approval.rationale)}${kv('附带条件',join(approval.conditions ?? [],'无'))}${kv('报告 SHA-256',approval.report_sha256)}${kv('模板 SHA-256',approval.template_sha256)}</div>`
    : `<div class="note ${eligible ? '' : 'warning'}">${eligible ? '材料完整性门禁通过。评委未校准时，正向审批须由审阅者在本页完成视觉复核并确认。' : '当前存在红线待判、指标缺测、过程文档不完整或演示数据；Go 与有条件 Go 被禁用。'} 导出审批 JSON 后须归档；此页面不会向服务器提交。</div><form class="approval-form no-print" id="approval-form"><label>审批结论<select name="decision" required><option value="" selected disabled>请选择</option><option value="no_go">No-Go</option><option value="conditional_go" ${eligible ? '' : 'disabled'}>有条件 Go</option><option value="go" ${eligible ? '' : 'disabled'}>Go</option></select></label><label>审阅者<input name="reviewer" required autocomplete="name" placeholder="姓名 / 工号"></label><label class="full manual-review"><input name="manual_reviewed" type="checkbox"> 我已对照参考、还原图、交互证据和残差完成人工复核（未校准评委的正向审批必选）</label><label class="full">决定理由<textarea name="rationale" required placeholder="写明依据、范围和关键证据"></textarea></label><label class="full">条件（有条件 Go 必填；每行一项）<textarea name="conditions" placeholder="后续动作、负责人及复核条件"></textarea></label><div class="approval-actions"><button class="primary-button" type="submit">导出审批记录 JSON</button><span class="approval-message" id="approval-message">报告 SHA-256：${e(digest)}</span></div></form>`);
  return `<div class="layout"><aside class="side-nav"><div class="nav-caption">报告目录</div>${nav.map(([id,label]) => `<a href="#${id}">${label}</a>`).join('')}</aside><main class="main">${r.demo ? '<div class="demo-banner">演示页面 · 不是一次真实网站还原，也不是有效审批记录</div>' : ''}${hero}<div class="metric-grid">${metricCard('目标状态',r.input.states.length,`${r.input.pages.length} 个页面 · ${r.input.viewports.length} 个视口`)}${metricCard('红线通过',`${redlinePass}/${r.quality.redlines.length}`,'未知与失败单独列示')}${metricCard('指标已测',`${finalMetrics}/${r.quality.metrics.length}`,'缺测不计作 0')}${metricCard('迭代轮次',Math.max(0,r.iterations.length-1),'含回退与待判')}</div>${overview}${process}${input}${output}${quality}${iterations}${residuals}${approvalSection}<div class="footer">Restore Loop Report v0.1 · ${e(r.report_id)} · SHA-256 ${e(digest)}</div></main></div>`;
}

function section(id,title,meta,content) { return `<section class="panel" id="${id}"><div class="section-head"><h2>${e(title)}</h2><span>${e(meta)}</span></div>${content}</section>`; }
function subheading(title) { return `<div class="subsection"><h3>${e(title)}</h3></div>`; }
function kv(key,val) { return `<div class="kv"><div class="key">${e(key)}</div><div class="val">${e(val)}</div></div>`; }
function chip(text) { return `<span class="chip">${e(text)}</span>`; }
function metricCard(label,val,detail) { return `<div class="metric-card"><div class="label">${e(label)}</div><div class="value">${e(val)}</div><div class="detail">${e(detail)}</div></div>`; }
function badge(kind,text) { const key = String(kind ?? 'pending').replace(/[^a-z_]/g,''); return `<span class="badge ${key}">${e(text)}</span>`; }
function table(head,rows) { return rows.length ? `<div class="table-wrap"><table><thead><tr>${head.map(x => `<th>${e(x)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '<div class="empty">无记录。若本项为必需内容，应在审批前补齐。</div>'; }
function list(items) { return items.length ? `<ul>${items.map(x => `<li>${e(x)}</li>`).join('')}</ul>` : '<div class="empty">无记录</div>'; }
function href(uri) { const str = String(uri ?? ''); if (/^https?:\/\//i.test(str) || (/^(?!\/|\\|\.\.|#)[^:]+$/.test(str) && !str.split(/[\\/]/).includes('..'))) return `<a href="${e(str)}" target="_blank" rel="noopener noreferrer">${e(str)}</a>`; return e(str || '未提供'); }
function safeImageUri(uri) { const str=String(uri ?? ''); return /^(?!\/|\\|\.\.|#)[^:]+$/i.test(str) && !str.split(/[\\/]/).includes('..') && /\.(?:png|jpe?g|webp)$/i.test(str); }
function domId(value) { return `evidence-${String(value ?? '').replace(/[^a-zA-Z0-9_-]/g,'-')}`; }
function value(val,unit) { return val == null ? '<span class="muted">未测</span>' : e(`${Number(val.toFixed(4))}${unit ? ` ${unit}` : ''}`); }
function join(items,fallback='无') { return Array.isArray(items) && items.length ? items.map(String).join('、') : fallback; }
function e(value) { return escapeHtml(value); }
function escapeHtml(value) { return String(value ?? '未提供').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])); }
function nonempty(value) { return typeof value === 'string' && value.trim() !== ''; }
function isSha256(value) { return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value); }
function requireArray(value,label) { if (!Array.isArray(value)) throw new Error(`${label} must be an array`); }
function unique(values,label) { if (values.some(x => x == null) || new Set(values).size !== values.length) throw new Error(`${label} values must be unique and non-null`); }
function stableJson(value) { if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`; if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`; return JSON.stringify(value); }
function statusLabel(value) { return ({pass:'通过',fail:'失败',unknown:'待判',not_applicable:'不适用',keep:'保留',revert:'回退',inconclusive:'待判',baseline:'基线',pending:'待审批',unmeasured:'未校准'})[value] ?? String(value ?? '未知'); }
function decisionLabel(value) { return ({go:'Go',conditional_go:'有条件 Go',no_go:'No-Go',pending:'待审批'})[value] ?? String(value ?? '待审批'); }
