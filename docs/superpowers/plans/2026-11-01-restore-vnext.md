# Restore vNext implementation plan

Goal: implement the accepted vNext architecture incrementally in a separate worktree, exercise Firewood, and distinguish measured quality/cost from estimates and missing evidence.

Architecture: retain restore/v0.2 and existing fact ownership. An opt-in, versioned RestoreOptimization/v1 contract extension contains preparation, design regions, behavior and audio specifications. Legacy contracts remain readable. Projection filters the entire extension; it never creates a second truth source. Existing bounded loops and final E2E remain distinct.

Spec: the accepted 2026-11-01 UI restore major upgrade proposal (25 items), plus the flexible asset directory policy. Copies of these inputs and source hashes are recorded in the run workspace; they are design inputs, not proof of execution.

Execution: inline via executing-plans; meaningful behavioral changes use RED → GREEN. No push, merge or publication requested.

## Constraints and rulings

- Current source has uncommitted Restore improvements. Copy only relevant baseline files into the managed worktree and preserve the source. Record baseline commit and overlay hashes; excluded website drafts and user captures are not part of this change.
- Do not add a service, generic DSL, platform or compulsory engine. Resources remain in existing roots with semantic category mappings. Original caches and evidence are not relocated.
- Preserve source_assisted / fixture_only and evaluator-only metadata boundaries. No invented measurements, independent judge identity, E2E scores, audio or exact historical cost.
- The user approved implementation of the version proposal and asked us to define acceptance. Reuse established metrics; added coverage/geometry/cost observations supplement, not replace, existing VLM/E2E quality measures.
- New data is opt-in and versioned. Legacy generation input stays v1; optimized projection is v2. This avoids silently changing existing frozen contracts.

## Tasks

- [x] 1. Baseline and evaluation protocol: run current regressions, checkpoint relevant baseline, define paired comparison eligibility and unknown suppression.
- [x] 2. Specifications and freeze: tests then validation for evidence-linked coverage, region specs, resource layout, transitions, audio cues and blocking unknowns; integrate opt-in init, prepare checks and generation projection.
- [x] 3. Geometry and representation routing: tests then normalized region matching/diagnostics; no pixel-diff-only pass, preserve same-state requirements and missing elements.
- [x] 4. Anonymous verification: tests then media-only anonymous requests, controller-private binding/order map, separate calls and legacy adapter compatibility.
- [x] 5. Firewood pilot: inspect actual reference, save evidence and dependencies, exercise preparation/projection and an actual runnable candidate. Compare only eligible same-task measurements; historical candidate is descriptive unless conditions can be matched. Missing independent evaluator or audio evidence remains incomplete.
- [x] 6. Documentation, schemas and final review: synchronized README, interface/SOP references, eval cases, changelog; unit/schema/browser checks, one fresh review, status cleanup and actual limitations.

## Review focus

1. Specs smuggling source or evaluator context into fixture-only generation.
2. Readiness falsely passing when a required state/resource/cue is unknown or a capture is stale.
3. Anonymous evidence leaking best/candidate via filenames, hashes, report contents or provenance metadata.
4. Changed coordinate systems or unmatched states creating false geometry improvements.
5. Missing cost/coverage becoming zero, estimated visual quality becoming a measured score, or historical contracts entering formal paired comparisons.

## Verification

Run node --test scripts/restore/tests/*.test.mjs, including installed Playwright integration where available. Validate new JSON schemas and generation projection. Replay legacy fixtures. Exercise real browser geometry and the Firewood reference/candidate. Run the existing Case Manager build/test when dependencies are available. A passing synthetic suite does not imply a passing website E2E.

Completion interpretation: tasks describe this first implementation and diagnostic, not all proposed tool integrations or successful Firewood E2E. The case trial completed with failure/incomplete acceptance; its artifacts remain ignored and separate from source. Formal before/after efficiency is unknown.
