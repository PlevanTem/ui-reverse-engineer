# Agent trajectory interface v1 / v2

This file owns collection, storage, transport, and automatic-run semantics. The [evaluation guide](../../evals/trajectory/README.md) owns judgment and calibration. Restore's [controller interface](../restore/interfaces.md) continues to own website runs.

Module ownership, dependencies and local ESM reuse are mapped in the [architecture guide](../../docs/architecture.md). Shared HTTP/OTLP helpers live in `scripts/trajectory/langfuse.mjs`; `langfuse-pilot.mjs` is the Firewood-only adapter with compatibility re-exports. Generic auto/transport code does not depend on that case adapter. There is no separately published SDK or new Langfuse SDK dependency.

## Capture boundary

`collector.mjs` reads exported Codex JSONL records, not reconstructed stories. Starting from an explicit root thread, it follows actual `thread_spawn.parent_thread_id` links recursively. Internal approval/guardian sessions and unrelated threads are excluded. All matching transcript segments are considered; the task window controls included records.

Native `item_completed` records provide inner command/file/image/subagent operations, timing, exit codes and available output, including tools nested inside `functions.exec`. Outer API tool calls remain a separate orchestration layer. These are distinct observations, not additive tool-count denominators. Missing feedback, parse gaps, unknown native item types, host truncation and missing model context remain coverage gaps. Host versions are recorded; a transcript adapter is not a stable public SDK contract.

Public reasoning **summaries**, plans, decisions and final messages are collectible. Raw/private reasoning, analysis-channel message bodies, ciphertext and system/developer instruction bodies are not exported. Private context is represented by a digest/boundary. No hidden thought is inferred from later success. A Skill read means observed access, not proven influence or originality; historical Skill versions remain unknown when not captured at read time.

The session's `context_inherited` hint only reflects available history metadata. A false value means inheritance was not observed, not proof that parent context was absent. Independently verify context boundaries before calling a reviewer blind or independent.

`from` is explicit or inferred from the latest native `task_started` preceding run initialization; fallback is initialization time and is labelled accordingly. `process_end` uses the frozen controller stop time. Events after it stay in `final_acceptance`, but are excluded from process Judge inputs. This excludes future acceptance feedback, not just its numerical result. A missing loop boundary cannot silently become a completed evaluation.

Automatic capture ends at the controller's first durable `complete` ledger record plus at most 30 seconds, capped by the observed root turn end or the next turn start. This bounded closeout window prevents delayed recovery from collecting later unrelated chats. A final parent message outside that window is a coverage limit, not silently claimed as collected.

## Data contracts

| Contract | Purpose | Authority |
| --- | --- | --- |
| `AgentTrajectoryEvent/v1` | Identity, parent/thread/turn, kind/track, timing, input/output, status, observed model/effort, source line and raw-record digest | [JSON Schema](agent-event.schema.json) |
| `AgentTrajectorySession/v1` | Session identity, events and explicit coverage; source file locator/digest stays local | `collector.mjs` |
| `TrajectoryJudgePayload/v1` | Dimension, frozen policy, selected process events, audit facts, allowed evidence IDs and omissions | `buildPayload()` in `judge.mjs` |
| `ExternalCodexJudgment/v1` | External execution provenance, rubric/payload binding, per-metric status/score/reason/evidence/missing | [Judge result Schema](judge-result.schema.json), `judgeTrace()` |
| `TrajectoryDelivery/v1` | Destination/project/payload digest, batches, reconciliation and links | `transport.mjs` |
| `AutomaticTrajectoryBinding/v1` | One run, root session, capture, task window and worker limits | `auto.mjs` |
| Automatic settings | Explicit per-workspace opt-in; connection file reference, never credentials | [JSON Schema](auto-settings.schema.json) |

`record_sha256` hashes the actual source JSONL line. Media SHA-256 hashes decoded raw bytes. Transport content hashes cover the exact serialized normalized text. These are different hash domains. Images become media references; this version does **not** upload their binary bytes. Source paths/files remain local. Secret keys, authorization values and home-directory identifiers are redacted before projection. Review new credential formats before collecting unfamiliar providers.

The Langfuse trace is `chain → recursive agent → tool/event → optional content chunks`. Full normalized text is retained; large input/output gets linked transport chunks instead of silent truncation. Agent spans are capture envelopes, not model/API latency. Observed per-response usage is deduplicated by response identity; cumulative counters are not summed. Missing usage, exact model request context and monetary cost stay unknown. No synthetic `generation` spans are fabricated.

## v2 attributed views and evidence units

Raw `AgentTrajectoryEvent/v1` records remain the evidence ledger. [AgentTrajectoryView/v2](view.schema.json) derives logical messages without changing their sources. Paired API/native messages in the same agent/turn retain both source records; repeated real utterances are preserved. User dialogue, public policy/bootstrap and parent-agent declarations are separate. Root/agent inputs and message events use role/content arrays; these are **derived host-event conversation views**, not the original model API input. No generation span is invented for display.

Prior root-thread public user messages are captured separately before the task cutoff, with original line/digest/time. They are instruction-context candidates: applicability and supersession require semantic review. Hidden system/developer bodies, private reasoning and encrypted content remain unavailable. Parent-message encryption can also occur inside ordinary sender tool arguments; opaque protected tokens are replaced by digest references, never treated as public prompt text. Historical sender and recipient bodies may both be unavailable. A header or fork flag does not close that gap.

`buildEvidencePayload()` supplies full public instruction candidates and any genuinely available sender task text. F has an action catalog; T has each principal process statement plus preceding native results and prior review candidates. Short results are kept exactly; long tool records carry explicit JSON-field, line or serialized-range excerpts and source hashes. The current 350,000-character ceiling blocks over-budget inputs; it is not a model-token or billing guarantee. This is bounded candidate retrieval, **not an assertion of complete causal coverage**. Inputs expose record counts, excerpt counts and unselected process events. Prior E2E scores or later final-acceptance records are excluded.

[Judge v2](judge-result-v2.schema.json) adds individual checks under the same three metrics. F2 cites the original requirement and observed action; T1 covers every supplied claim. `evidence_refs` are candidate contemporaneous proof; `context_refs` may explain later diagnostic facts without making them earlier evidence. Critical unknown checks suppress the metric's numeric score. The local validator checks IDs, temporal ordering and claim coverage; Codex remains the semantic judge. Native v2 Code evaluators use separate names/rules and `restore.process.v2.*` scores. `metric_coverage` means scored/applicable metric count, not quality or accuracy; unknown remains nonnumeric.

The rubric source is the v1 anchors plus the [v2 override file](../../evals/trajectory/rubrics-v2.json), avoiding duplicated anchor rules. F3 is limited to actual user goal/scope changes and stops; reviewer authorization is assessed in F2. A successful transport or structure check does not validate the Judge's semantics.

External Judge executions use a separate trace at their actual execution times, linked to the historical source trace. The provided-evidence prompt forbids tools; CLI output is checked for unexpected tool use. This is context isolation by prompt/read-only workspace, not an OS proof of independence. CLI-native defaults bypass incompatible local model aliases/MCP startup configuration while reusing existing login; exact model identity stays null if CLI does not expose it.

## Automatic Restore integration

Create ignored `reverse_output/trajectory/auto-settings.json` after explicitly authorizing the destination:

```json
{"enabled":true,"config_path":"reverse_output/langfuse/.env.local","watch_ms":14400000,"poll_ms":5000}
```

Connection variables in the referenced ignored `.env.local` file are `LANGFUSE_BASE_URL`, `LANGFUSE_PUBLIC_KEY`, and `LANGFUSE_SECRET_KEY`. `auto-settings.json` contains the configuration path, not these keys. No keys belong in checked-in configuration. Existing process environment is not copied into bindings or cloud payloads.

The Restore CLI invokes `afterRestoreCommand()` automatically. On `init`/`init-vnext` it binds `CODEX_THREAD_ID`/`CODEX_SESSION_ID` and starts a hidden, detached, bounded **per-run process**, without a global daemon. Subsequent commands recover/check the same binding. `continue`/`refreeze` bind the child run. Unrelated workspaces are skipped; missing session identity never selects the latest unrelated transcript. An owner mismatch cannot rebind a run.

New bindings default to `view_version=2`; existing bindings/prepared v1 deliveries remain v1. A new output directory/capture is required for an upgrade. v2 persists `views.json`, context candidates and `payload-inspect.json`, builds every requested dimension's package before any Judge call, then registers the matching versioned evaluators. `judge_dimensions` on a binding can explicitly limit a diagnostic re-evaluation to F/T; absent that field, all four dimensions run. Resume reuses stored payloads/results and does not replace old input with a newly generated interpretation.

The process watches only `run.json`. At completed E2E it collects once, delivers/reconciles the capture, runs the external Judges, delivers their outputs and checks cloud-generated scores. Watch expiry permits partial capture, with no completed semantic judgment. A failed network or Judge operation persists `failed`/`incomplete`, rather than pretending website completion proves telemetry completion. Host filesystem/network/child-process permissions are still required; sandbox failures are not bypassed.

```powershell
# Explicitly bind an existing run; optional existing capture directory supports recovery.
node scripts/trajectory/cli.mjs arm RUN [CAPTURE_DIR]
node scripts/trajectory/cli.mjs status CAPTURE_DIR
node scripts/trajectory/cli.mjs resume CAPTURE_DIR
node scripts/trajectory/cli.mjs inspect CAPTURE_DIR [F|T|D|I]
```

## Public task specifications before delegation

When opaque host logs cannot preserve delegation text, write its public specification **before** spawning the reviewer:

```powershell
node scripts/trajectory/cli.mjs delegate-spec CAPTURE_DIR request.json
```

`request.json` contains `task_name` and the intended public `prompt`. The command writes an immutable [PublicDelegationSpec/v1](delegation-spec.schema.json), stamps its own time and SHA-256, and returns a handoff message directing the child to read that file. Use that message for the actual spawn. Do not put private system instructions, reasoning, credentials or ciphertext in the spec. The collector links eligible initial-task specs by target/time and records observed child reads; a prepared spec or file-read match is still not proof of the exact private recipient context. Follow-up messages whose bodies are encrypted retain their own gap; an initial task spec must not be substituted for every later instruction.

The recorded prompt hash covers the original local text. Any exported redacted text has its own digest and redaction flag. Historical missing prompts are not backfilled from a spec written after the event.

Startup is not success: check `automatic-status.json` and `automatic-result.json`. Completion requires both observation reconciliations plus score subject/type/value/source checks. The observer does not change website artifacts or the parent run. Native Desktop hooks are a separate trust/activation mechanism; this path uses the Restore CLI and does not alter or bypass hook trust.

## Storage and recovery

Default output is ignored `reverse_output/trajectories/RUN_ID/`: `binding.json`, `automatic-status.json`, `automatic.log`, `capture-config.json`, `sessions.json`, `projection.json`, `facts.json`, `judges/D|I|F|T/native-default/{payload,prompt,attempt,execution,raw-result,result}`, `judges-trace.json`, `platform/registry.json`, `capture-delivery/`, `judge-delivery/`, `automatic-result.json`.

Capture and Judge deliveries bind immutable payload/destination hashes. Completed spans are batched once. A receipt is written **before** sending; an uncertain write is reconciled, never blindly resent. Accepted batches and completed Judge attempts are reused. A Judge start marker survives timeout/crash, so recovery cannot silently spend another judgment. Preserve failed attempts and choose a new explicit attempt/capture when retry is justified. Never retry to improve a reward.

`worker.lock` prevents duplicate workers. If a process dies while holding it, check its recorded PID and state before removing only that stale lock; do not delete receipts, results or source evidence. A machine restart requires an explicit `resume` or next Restore CLI command; this is not an always-on OS service.

A failed external Judge is persisted and best-effort uploaded to a separate error-attempt trace. Its name and marker do not match semantic scoring rules; a failed process never becomes a numeric reward. If that upload also fails, the incomplete failure receipt remains local.

Retain lineage-linked runtime evidence. Cleanup follows [Restore closeout](../restore.md#完成检查); neither telemetry directories nor source transcripts are cache. Credentials and all case/session outputs stay ignored and uncommitted.
