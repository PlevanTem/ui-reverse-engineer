# Restore task continuity — approved scope

2026-11-01. Website loop plus evidence-linked Skill proposals. No automatic Skill edits, service, scheduler, heldout-feedback loop or changes to run completion semantics.

1. Add task-level policy/checkpoint and derive next action from existing run facts. Acceptance reuses the independent final grader and verifies bound files. Persist shared wall/round/run/continuation limits.
2. Add explicitly session-bound lifecycle adapter. Stop requests another bounded pass; compaction/session recovery projects only this development task. Interrupt pauses. Unbound sessions do nothing. Stale locks fail visibly; never auto-remove an unknown owner's lock.
3. Add evidence-bound learning plans and crash-recoverable linked-run publication. Reuse continue/refreeze without inheriting scores or changing parent records. Skill proposals are records only.
4. Add a concrete project hook definition, with no armed task by default. Host trust and actual callback → continuation → progress are a separate activation gate. Do not bypass trust or alter global notification settings.
5. Sync SOP, interfaces, entrypoint, both READMEs, acceptance and changelog. Run the complete local regression suite and CLI protocol tests; report native activation as unverified until observed.

Tests first: objective ≠ run completion/build; exact pending stage; incomplete E2E; bad hashes/bindings/pass labels; shared limits; duplicate callbacks/handoffs; unrelated sessions; interrupt; repeated no-progress; proposal-only output; real stdin/CLI protocol. Integration fixtures are synthetic development tasks, never quality claims for Firewood.

Implementation result: steps 1–5 completed at the code/protocol level. Restore 103/103 (19 continuity tests), Case Manager build plus 4/4, Skill validation and 20 schema meta-checks / 3 actual task instances passed. Firewood routing-only check selected repair_evaluation, preserved the original run and wrote a proposal. Native host activation remains unverified; the project definition needs host trust and callback → continuation → progress evidence. No task is armed by this implementation or its tests.

Design reference: [Derrick Choi's long-horizon Codex experiment](https://developers.openai.com/blog/run-long-horizon-tasks-with-codex), for externalized plans, checkpoints and repeated validation; this is a design reference, not a local reliability result. [Official hook contract](https://learn.chatgpt.com/docs/hooks) owns native event/trust behavior.
