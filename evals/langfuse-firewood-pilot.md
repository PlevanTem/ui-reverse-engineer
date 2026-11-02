# Firewood Langfuse integration pilot

This optional development pilot imports a completed Firewood Restore ledger, runs local code evaluators, prepares OTLP spans, and checks observation/Score readback from an explicitly configured Langfuse project. It does not capture the full Codex host trajectory, create model calls, deploy a service, or alter the original Restore run. Raw case data and credentials stay under ignored `reverse_output/`.

## Scope and labels

- Historical trace: one envelope plus the actual `events.jsonl` records. Each record is a point event at its recorded time, with `historical_import` and `restore_ledger_only`. The envelope is not active Agent work duration. Old candidate hashes remain attached to their own events.
- Current evaluation trace: real start/end times of artifact/evidence integrity, runtime byte-source classification, and regrading of the existing independent E2E judgment. These are local code evaluators, not Langfuse-hosted LLM judges or new visual acceptance.
- `full_runtime_reuse` measures complete observed source byte preservation for the core runtime. It is not an overall originality percentage.
- The historical E2E remains provisional and uses a separate score namespace. Missing model calls, subagent contexts, historical file-read audit, token counts and costs remain unknown. No four-dimension process total is emitted.

## Prepare and inspect

From the worktree root, create a fresh output directory:

```powershell
node scripts/trajectory/langfuse-pilot.mjs prepare `
  reverse_output/firewood-vnext/run-20261101-iteration `
  reverse_output/langfuse-firewood-pilot/run-20261101-02
```

The case-specific source comparison requires the preserved observed bundle and observer in the sibling `inspect-20261101-live/`. Missing files stop preparation rather than fabricating a source verdict. Another website requires its own provenance adapter; this is not a generic source audit service.

Inspect `manifest.json`, `observations.json`, `local-evaluation.json`, `otlp.json` and `scores.json` before any send. `prepare` is local and performs no network requests. It refuses to overwrite an existing manifest. Field changes require a new prepared directory, not mutation of an accepted batch.

## Connection and explicit send

Supply project-scoped credentials in the process environment or an ignored local file such as `reverse_output/langfuse/.env.local`:

```dotenv
LANGFUSE_BASE_URL=https://your-langfuse-deployment
LANGFUSE_PUBLIC_KEY=your-project-public-key
LANGFUSE_SECRET_KEY=your-project-secret-key
```

The parser reads only the four supported Langfuse names, does not execute the file or expand shell expressions, and lets nonempty process values override file values. Never commit this file. Langfuse project keys identify the destination; the pilot requires the project lookup to return exactly one project and verifies the observations v2 read path before sending.

```powershell
node scripts/trajectory/langfuse-pilot.mjs send `
  reverse_output/langfuse-firewood-pilot/run-20261101-02 `
  --config reverse_output/langfuse/.env.local
```

An explicit `send` is the only network-writing command. It verifies prepared file digests and their projection, posts one complete OTLP batch, polls observations v2, then posts eight versioned Scores only after observations reconcile. It reads Scores v3 and checks each subject, type and value before writing `delivery.json.status=confirmed`. API receipt alone is not confirmation.

The target must support the documented v4 OTLP/observations path. This pilot uses the public HTTP protocol directly for bounded historical import; no SDK package or new service is installed. Original task state and site code are unchanged.

## Outputs and recovery

- `delivery.json`: destination/project, acceptance/uncertainty and final confirmation; no Authorization or key values.
- `manifest.json` is an immutable pre-send snapshot, not the delivery status owner. Use `delivery.json` for actual confirmation.
- `observations-readback.json` and `observations-reconciliation.json`: actual exported rows and field-level gaps.
- `scores-readback.json` and `scores-reconciliation.json`: actual Score objects and binding/value checks.
- Existing accepted spans are not resent as updates. On an uncertain/partial attempt, `send` performs readback only; missing observations stop Score sending. Investigate partial ingestion/configuration before preparing a distinct replacement. HTTP errors are not blindly retried.
- Scores use stable IDs, so ambiguous score-send retry reuses the same score identity. Changed rubric or evidence requires a new prepared evaluation, not rewriting a prior score history.

There is no claim of exactly-once transport. The prepared batch and receipts support manual reconciliation. A mock API test proves the client workflow only; a real Langfuse roundtrip must be reported separately.

## Checks

```powershell
node scripts/trajectory/langfuse-pilot.test.mjs
```

The tests exercise dates/precision, partial historical scope, candidate binding, source classification, literal config parsing, malformed OTLP identifiers/parents, I/O and metadata readback, Score subject matching, partial acceptance, secret redaction and a mocked roundtrip/resume without duplicate accepted writes. They do not install dependencies, contact Langfuse or prove full Agent telemetry.

Official interface references: [OTLP/v4 migration](https://langfuse.com/integrations/native/opentelemetry/migration-to-v4), [public reads](https://langfuse.com/docs/api-and-data-platform/features/public-api), [Scores](https://langfuse.com/docs/evaluation/evaluation-methods/scores-via-sdk).
