# Restore vNext acceptance and comparison

Status: implementation protocol, 2026-11-01. Existing final rubric remains authoritative in restore.md. This file defines upgrade acceptance and measurement, not another visual scoring system.

## Units and evidence

The primary experimental unit is a complete restore attempt from the same frozen task, environment, allowed resources, source policy and budget. Reference/candidate observations additionally match page × state × viewport × region and input sequence. Record Skill source checkpoint, generator/model settings when exposed, tool availability, timestamps, failures, artifact and evidence hashes.

Labels: measured, estimated, unknown and not_applicable are distinct. An estimate records its assumptions and evidence range and never enters the measured-score aggregate. Incomparable or missing data suppress improvement percentages, not become zero. One Firewood pair is a case study, not a project-wide effect estimate.

## Acceptance and observations

| Measure | Source / calculation | Acceptance or interpretation |
| --- | --- | --- |
| Runtime and contract integrity | existing unit, schema, browser, binding and legacy replay tests | no new regression; required checks run or explicitly incomplete |
| Final fidelity | independent existing five-dimensional 0–4 E2E plus redlines | retain existing target and coverage rules; no conversion from Loop or self-review |
| Visual iteration | C1/C2/C3, anonymous pairwise, ArtifactDiff, required gates and findings | improvement plus no critical regression; same/uncertain stays inconclusive |
| Completeness | required elements/states/resources with matched evidence / frozen required set | report numerator and denominator, unknown count and uncovered scope; all required core-path omissions resolved before complete |
| Geometry | corresponding boxes in equal coordinate systems; center and size deviations relative to reference | initially 5% critical / 10% secondary as diagnostic proposals, per-case calibrated with an explicit small-element pixel allowance; never override missing elements or visual judgement |
| Behavior | real entrance → progression → completion/failure → retry/reset and observed persistence | same semantic path, transition conditions and invariants; candidate telemetry alone insufficient |
| Audio | actual output recording/listening plus events, repeat/reset/mute and timing anchors | required cues need actual evidence; no screenshot/VLM-only audio pass |
| Total time | preparation + implementation + checks/repair + finalization, with wall and valid active time | compare only equal scopes; include overhead of the new preparation; evaluate at matched accepted quality |
| Model use / cost | recorded source-attributed usage; actual pricing only when verified | unavailable stays null; partial remains partial; do not infer costs from account quota |
| Iteration efficiency | verified improvements / attempted rounds; refreeze count; post-freeze omissions; time to first valid candidate | report components alongside final quality; more rounds is not a benefit |

## Comparison and estimates

Use one common frozen task for baseline and upgraded arms, including evaluator/rubric versions. Baseline code may ignore optional optimization fields while receiving the same allowed information and resources. A difference in semantic contract, environment, source assistance, evaluator or budget must be listed and normally makes a formal pair ineligible.

For measured cost, time_saved_percent = (baseline_total - upgraded_total) / baseline_total × 100 only when both totals are positive, complete and comparable. For final quality use point deltas by dimension and total only when both complete independent results exist. Do not call 3/4 “75% restoration accuracy.” Report coverage and redlines alongside scores.

Historical Firewood attempts are diagnostic references until all matching conditions are demonstrated. If the baseline is unavailable, report current absolute observations and an explicitly estimated change, with low confidence and reasons; leave numeric improvement null. To estimate project-level effects, repeat matched attempts across content, motion, Canvas/3D, gameplay and audio cases; use paired distributions/intervals and failure rates, not a single selected success. No preset success percentage is promised.

## Firewood pilot stages

1. Inspect current public page identity, loading readiness, gestures, visual stages, audio and resources.
2. Freeze evidence, core states, region/asset mappings, unknowns, permitted source-assisted mode and dependency chain.
3. Exercise preparation failures before generation; generate the durable implementation input and brief.
4. Run a candidate, capture matching states and program checks, preserve real failures.
5. Independent visual/dynamic and audio review if available; otherwise withhold that acceptance. A parent self-review is implementer evidence only.
6. Publish a local report with input/quality/cost coverage and comparison eligibility. Do not overwrite old runs or claim complete validation from a build.

## Formal-run preflight

Before a formal paired trial, validate its complete FinalEvalRequest and the case-specific RedlineProfile/v1 against the selected rubric, and test the exact start command. A nonempty placeholder is not a reproducible launch instruction. Preparation/spec checks are not a replacement for final-evaluation qualification. Missing final profiles disqualify a formal comparison; retain diagnostic evidence and create an explicitly prepared new run instead of editing a frozen contract.

Establish v0 with the same independent measurement method used after repair. An implementer-only/unknown initial baseline followed by fuller independent findings can trigger a conservative new-major rollback even when a local visual preference improves. Do not rewrite its history or count it as a successful controlled iteration. Keep the raw controller decision separate from the supplemental independent before/after comparison.

Engineering release gates: legacy replay and new invariants pass, schemas match emitted data, CLI actually starts, and reports render. Case-quality gates: complete independent coverage, required redlines and frozen targets. Efficiency gates: comparable complete-attempt costs at matched accepted quality. Passing the first gate does not imply the other two.

## Harbor runtime acceptance

Static acceptance requires schema 1.4 task lint, fixed image digests, ATIF-v1.8 official validation and model round-trip, separate verifier declarations, exact 3/6/9 tier rounds, existing stop reasons, and fail-closed reward/eligibility behavior. Synthetic fixtures count only as engineering evidence.

Runtime acceptance additionally requires one new authorized `ready` case to demonstrate the real browser environment, one trial `session_id` across linked trajectory files, exact copied-context provenance, filesystem persistence, artifact transfer to the separate verifier, early stopping, final reward selection, and verifier-only regrade. Keep Harbor job/trial/task IDs, lock, ATIF hashes, artifacts and verifier receipts together. Until all are observed, runtime status is `not_run`; green lint or validator results cannot upgrade it.

For matched efficiency experiments, compare equal task contracts, source policy, model/tool configuration and cumulative budgets. Measure premature stops, continuation success, no-progress steps, accepted quality and total cost. More automatic steps alone are not higher efficiency. Heldout evaluations remain outside producer adaptation.
