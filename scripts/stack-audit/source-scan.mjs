#!/usr/bin/env node
// Search only first-party source files captured by collect.mjs. Matches are candidates, never confirmations.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';

const [auditArg, outputArg] = process.argv.slice(2);
if (!auditArg || !outputArg || auditArg === '--help') {
  console.log('Usage: node scripts/stack-audit/source-scan.mjs AUDIT_JSON OUTPUT_JSON');
  process.exit(auditArg === '--help' ? 0 : 2);
}
const auditPath = resolve(auditArg);
const root = resolve(auditPath, '..');
const audit = JSON.parse(await readFile(auditPath, 'utf8'));
if (audit.schema_version !== 'StackAudit/v0.1' || !Array.isArray(audit.sources)) throw new Error('Expected StackAudit/v0.1 with source records');

const signatures = [
  ['Three.js', /\bTHREE\.WebGLRenderer\b|\bWebGLRenderer\s*\(|from\s*['"]three(?:\/[^'"]*)?['"]|require\s*\(\s*['"]three['"]\s*\)/gi],
  ['Babylon.js', /\bBABYLON\.(?:Engine|WebGPUEngine)\b|from\s*['"]@babylonjs\/core/gi],
  ['PlayCanvas', /\bpc\.Application\b|from\s*['"]playcanvas['"]/gi],
  ['PixiJS', /\bPIXI\.Application\b|from\s*['"]pixi\.js['"]/gi],
  ['CSS3DRenderer', /\bCSS3DRenderer\b/gi],
  ['React', /(?:from\s*['"]react['"]|ReactDOM\.createRoot|createRoot\s*\()/gi],
  ['Vue.js', /(?:from\s*['"]vue['"]|createApp\s*\()/gi],
  ['GSAP', /\bgsap\.(?:to|from|timeline)\s*\(|from\s*['"]gsap['"]/gi],
  ['GLSL shader', /(?:\.glsl|vertexShader|fragmentShader|shaderSource\s*\()/gi],
];
function redactSnippet(value) {
  return value
    .replace(/(api[_-]?key|access[_-]?token|client[_-]?secret|password|authorization)\s*[:=]\s*(['"])[^'"]+\2/gi, '$1: [redacted]')
    .replace(/\b(AIza[0-9A-Za-z_-]{20,})\b/g, '[redacted-key]')
    .replace(/\s+/g, ' ').trim();
}
const findings = [];
for (const source of audit.sources) {
  const bytes = await readFile(join(root, source.uri));
  const actualHash = createHash('sha256').update(bytes).digest('hex');
  if (actualHash !== source.sha256) throw new Error(`Captured source changed: ${source.id}`);
  const text = bytes.toString('utf8');
  for (const [technology, pattern] of signatures) {
    pattern.lastIndex = 0;
    let match;
    let occurrences = 0;
    const samples = [];
    while ((match = pattern.exec(text)) && occurrences < 5000) {
      occurrences++;
      const before = text.slice(0, match.index);
      const line = before.split('\n').length;
      const start = Math.max(0, match.index - 100);
      const end = Math.min(text.length, match.index + match[0].length + 160);
      if (samples.length < 3) samples.push({ line, match: match[0], snippet: redactSnippet(text.slice(start, end)) });
    }
    if (occurrences) findings.push({
      id: `code:${String(findings.length).padStart(3, '0')}`,
      technology, status: 'candidate', source_id: source.id, source_url: source.url,
      occurrences, occurrences_capped: occurrences === 5000, samples, evidence_ids: [source.id, source.evidence_id],
    });
  }
}
const result = { schema_version: 'StackAuditSourceScan/v0.1', source_audit: audit.target_url, scanned_sources: audit.sources.map(s => s.id), findings };
await writeFile(resolve(outputArg), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ output: resolve(outputArg), scanned_sources: result.scanned_sources.length, candidate_matches: findings.length }));
