# Pipeline implementation boundary

The v0.2 restore runtime lives in [`../../scripts/restore/`](../../scripts/restore/) and its [interface contract](../../references/restore/interfaces.md). This directory retains the v0.1 command aliases and houses the independent six-dimension `score-final.mjs` evaluator. Old v0.1 run artifacts are not converted into v0.2 assessments.

Status: one source-assisted `UIR-0006` pilot has completed the path from frozen fixture and baseline through one targeted repair, browser capture, deterministic checks, screenshot diagnostics, T0–T4 documents, and an HTML review packet. These collection and repair steps were orchestrated manually. The reusable scripts below initialize a run, compare paired screenshots, assemble a report with hashes, render its HTML, and serve a static project. They do not autonomously invoke a model, control the repair loop, calibrate a Judge, or make an approval decision.

## Restore Loop report renderer

See the [report contract](../specs/restore-loop-report-v0.1.md), [report schema](../templates/restore-loop-report.schema.json), [approval schema](../templates/restore-loop-approval.schema.json), [HTML template](../templates/restore-loop-report.html), and [demo input](../templates/examples/restore-loop-report.sample.json). From the repository root:

```powershell
node evals/pipeline/init-restore-run.mjs evals/results/<run_id>/<case_id> <UIR-0000> <url>
python evals/pipeline/compare-screens.py <reference.png> <candidate.png> --json <score.json> --diff <diff.png>
node evals/pipeline/build-restore-report.mjs evals/results/<run_id>/<case_id>
node evals/pipeline/render-restore-report.mjs <report.json> <report.html>
node evals/pipeline/render-restore-report.mjs <report.json> <approved.html> --approval <approval.json>
```

`init-restore-run` creates a run directory with a fixture, manifest, editable report source, and T0–T4 document skeleton. Freeze the fixture and reference evidence before the baseline, then fill the documents and `report-source.json` from the actual observations. `build-restore-report` hashes those documents, fixture, manifest, evidence files, and restored project, then writes `report.json` and `report.html`. The offline HTML shows paired reference/candidate/diff images and exports a local approval JSON. It does not submit to a server or authenticate the reviewer. An uncalibrated Judge requires the reviewer to attest to manual visual review before a positive decision. Archive the JSON through the intended process and re-render with `--approval` to show the decision. The renderer refuses an approval bound to a different report or template hash. The bundled sample is DEMO and cannot receive a positive decision.

The real pilot packet is at `evals/results/RESTORE-VALIDATION-20261013/UIR-0006/report.html` on this machine. It is intentionally ignored by Git with other generated case data. Its `assemble-run.mjs` is a case-specific ledger builder, not a generic scoring adapter. The pilot reused the observed site's CSS, fonts, images, and DOM mapping; do not use it as evidence that the Skill can produce the same result without source assistance.

## Planned stages

1. `ingest`: validate run manifest, case IDs, arm IDs, project directories, startup entries, and SHA-256 hashes.
2. `render`: start each site project in an isolated environment (or open its static entry), capture fixed-viewport browser screenshots, and collect resource/console/runtime signals.
3. `check`: enforce file/load gates and run only the frozen interactions listed in each case.
4. `score`: prepare blinded judge payloads from the reference, evidence annotations, rendered screenshot, and rubric; store raw judge outputs and human adjudications separately.
5. `aggregate`: compute weighted scores, red-line rates, per-case paired differences, stratified bootstrap intervals, and the report template.

Model invocation for the experimental arms is an adapter boundary. It must not assume an API, credential, or client capability that has not been verified. An artifact-ingest run remains useful if arm generation must be performed manually.

## Expected interfaces (provisional)

- Input: `cases.yaml`, versioned spec/rubric, run manifest, one runnable `restored/` project with an entry URL or startup command per `(case_id, arm_id, replicate)`.
- Intermediate: screenshot and deterministic-check JSON keyed by the same tuple.
- Judge output: schema-validated dimension scores with evidence references, confidence, and red-line IDs.
- Output: `manifest.yaml`, `scores.jsonl`, checks, screenshots or local references, and `report.md` under `results/<run_id>/`.

These interfaces must be converted into failing contract tests before implementation, per the project evaluation workflow.
