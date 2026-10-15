#!/usr/bin/env node
// Enforce human disposition and evidence mapping before an audit can be marked complete.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const [auditArg, scanArg, reviewArg, outputArg] = process.argv.slice(2);
if (!auditArg || !scanArg || !reviewArg || !outputArg || auditArg === '--help') {
  console.log('Usage: node scripts/stack-audit/validate.mjs AUDIT_JSON SOURCE_SCAN_JSON REVIEW_JSON OUTPUT_JSON');
  console.log('Review format: {"schema_version":"StackAuditReview/v0.1","decisions":[...],"claims":[...]}');
  process.exit(auditArg === '--help' ? 0 : 2);
}
const [audit, scan, review] = await Promise.all([auditArg, scanArg, reviewArg].map(async p => JSON.parse(await readFile(resolve(p), 'utf8'))));
if (audit.schema_version !== 'StackAudit/v0.1' || scan.schema_version !== 'StackAuditSourceScan/v0.1' || review.schema_version !== 'StackAuditReview/v0.1') throw new Error('Unsupported StackAudit schema version');
const evidenceIds = new Set(audit.evidence.map(e => e.id));
for (const state of audit.states) {
  for (const canvas of state.canvas) evidenceIds.add(canvas.evidence_id);
}
for (const signal of audit.signals) for (const id of signal.evidence_ids) evidenceIds.add(id);
for (const source of audit.sources) evidenceIds.add(source.id);

const signals = [...audit.signals, ...scan.findings.map(f => ({ id: f.id, type: 'source-match', label: `${f.technology} source match at ${f.source_url}:${f.samples?.[0]?.line ?? '?'}`, evidence_ids: f.evidence_ids }))];
const decisionsList = review.decisions || [];
const decisions = new Map(decisionsList.map(d => [d.signal_id, d]));
const errors = [];
if (!audit.states?.length) errors.push({ issue: 'audit has no inspected page state' });
if (audit.initial_status !== null && audit.initial_status >= 400) errors.push({ issue: `initial page response was HTTP ${audit.initial_status}` });
const identity = review.page_identity;
if (!identity || identity.status !== 'confirmed' || !Array.isArray(identity.landmarks) || identity.landmarks.filter(x => typeof x === 'string' && x.trim()).length < 2 || !Array.isArray(identity.evidence_ids) || identity.evidence_ids.length === 0 || !identity.rationale?.trim()) errors.push({ issue: 'confirm target page identity with two landmarks, evidence, and rationale' });
for (const id of identity?.evidence_ids || []) if (!evidenceIds.has(id)) errors.push({ issue: `unknown page identity evidence id: ${id}` });
if (decisions.size !== decisionsList.length) errors.push({ issue: 'duplicate signal decisions' });
for (const signal of signals) {
  const d = decisions.get(signal.id);
  if (!d) { errors.push({ signal_id: signal.id, issue: 'missing disposition' }); continue; }
  if (!['confirmed', 'excluded', 'candidate', 'unknown'].includes(d.status)) errors.push({ signal_id: signal.id, issue: 'invalid status' });
  if (!d.rationale?.trim()) errors.push({ signal_id: signal.id, issue: 'rationale required' });
  if (d.status === 'confirmed' && (!d.region?.trim() || !Array.isArray(d.evidence_ids) || d.evidence_ids.length === 0)) errors.push({ signal_id: signal.id, issue: 'confirmed items need a page region and evidence' });
  if (d.status === 'confirmed' && Array.isArray(d.evidence_ids) && !d.evidence_ids.some(id => signal.evidence_ids.includes(id))) errors.push({ signal_id: signal.id, issue: 'confirmed disposition must cite evidence for this signal' });
  for (const id of d.evidence_ids || []) if (!evidenceIds.has(id)) errors.push({ signal_id: signal.id, issue: `unknown evidence id: ${id}` });
}
for (const d of review.decisions || []) if (!signals.some(s => s.id === d.signal_id)) errors.push({ signal_id: d.signal_id, issue: 'decision has no matching signal' });
for (const claim of review.claims || []) {
  if (!claim.technology?.trim() || !claim.region?.trim() || !claim.rationale?.trim() || !Array.isArray(claim.evidence_ids) || claim.evidence_ids.length === 0) errors.push({ claim: claim.technology || null, issue: 'claims need technology, region, rationale, and evidence' });
  for (const id of claim.evidence_ids || []) if (!evidenceIds.has(id)) errors.push({ claim: claim.technology, issue: `unknown evidence id: ${id}` });
  for (const reference of claim.references || []) {
    try { if (new URL(reference.url).protocol !== 'https:' || !reference.note?.trim()) throw new Error(); }
    catch { errors.push({ claim: claim.technology, issue: 'external references need an https URL and note' }); }
  }
}
const unresolved = signals.filter(s => !['confirmed', 'excluded'].includes(decisions.get(s.id)?.status)).map(s => s.id);
const result = { schema_version: 'StackAuditValidation/v0.1', target_url: audit.target_url, complete: errors.length === 0 && unresolved.length === 0, errors, unresolved, signal_count: signals.length, claim_count: (review.claims || []).length };
await writeFile(resolve(outputArg), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ output: resolve(outputArg), complete: result.complete, errors: errors.length, unresolved: unresolved.length, signals: signals.length }));
if (!result.complete) process.exitCode = 1;
