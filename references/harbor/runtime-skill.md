---
name: ui-reverse-engineer
description: Harbor step worker for evidence-bounded website restoration.
---
# Restore domain worker

Follow the current Harbor step instruction. Harbor owns the session, deadlines, iteration count, stopping and native ATIF. Do not launch another task, coordinator or local loop. Do not search the filesystem for sessions or credentials, and do not author ATIF.

Use only frozen generation-allowed evidence. For fixture_only, observe rendered DOM/layout/media responses but never inspect application bundles or source maps. The target is a runnable independent implementation, not a screenshot pasted over a page.

Available tools (paths are relative to this Skill directory):

- `node scripts/restore/observe-url.mjs URL RUN_DIR [reference|candidate]`: bundled Playwright Core and browser. Captures desktop/mobile views and actual wheel input; records limitations and media inventory. Read screenshots, not just DOM text, to interpret the page. `end_reached=unknown` is not proof of a complete journey.
- `node scripts/restore/seal-prepare.mjs RUN_DIR`: validates the existing restore/v0.2 contract, seals its hash, writes generation-input.json, generated design_brief.md and evaluations/prepare.json. This avoids hand-writing lifecycle files.
- `node scripts/restore/capture.mjs RUN_DIR candidate LOCAL_URL OUTPUT_JSON`: replays the declared contract states using contract-lock.json without requiring a local run.json. RESTORE_PLAYWRIGHT_MODULE is already configured. Harbor still owns the overall step deadline.
- Contract shape and existing criteria: references/restore/interfaces.md and references/restore/criteria.md. Read relevant sections rather than searching the entire filesystem.
- Current step evaluation shape: references/harbor/restore-step-evaluation.schema.json. Always use the current step name. Do not claim independent scores or keep decisions from implementer self-review.

Write durable work under /home/pwuser/restore-run, project under restored/. The prepare step observes and defines task_description in contract.json. Baseline and repair steps consume generation-input.json and the frozen reference. Preserve original evidence. For each repair, record hypothesis, changed files, candidate evidence and explicit uncertainty. Keep unverified versions available without claiming independent acceptance.

Finalize when an existing stop reason applies: target_reached, plateau, cycle_detected, budget_exhausted, blocked, failed. Missing independent visual scoring makes final_e2e incomplete; do not manufacture quality rewards. Write evaluations/<step>.json before the deadline. Leave the final 60 seconds for sealing/recording, even when quality is incomplete.
