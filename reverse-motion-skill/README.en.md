# Reverse Motion Skill

English · [简体中文](README.md)

Turn interactions and motion from websites, recordings, or videos into an **implementable, traceable, and testable specification** for reference reconstruction and motion transfer.

> [!IMPORTANT]
> This is an AI agent workflow and evidence-gathering guide, **not an implemented automatic capture tool**. Results depend on source access, the execution environment, available tools, and the scope actually examined. No real-world end-to-end case has been validated yet.

## The problem

A static screenshot cannot fully describe triggers, state changes, timing, or motion paths. Within the authorized scope, this skill guides an agent to combine runtime information, actual interactions, and visual measurements to recover design behavior and its evidence instead of guessing from a single frame.

Explore the main user journey, visible clues, and prominent motion first. Report what was examined, inaccessible, or not checked separately. Mark unverified details as `unknown`.

## How it works

1. **Set the scope**: Record sources, viewports, accessible paths, and evidence boundaries.
2. **Choose by state**: Attempt to trigger motion that has not started. If it has finished, capture it after resetting and replaying when possible; otherwise record the evidence gap.
3. **Cross-check evidence**: Combine declarative animations, accessible animation libraries, interaction probes, and visual measurements as available. One effect may require several paths.
4. **Produce the specification**: Align evidence and describe triggers, states, timing, space, dynamics, and coordination; list unknowns and checks still to perform.

See the [workflow diagram](references/workflow.md), [capture guide](references/capture.md), and [specification and acceptance guide](references/spec.md). The skill instructions and reference guides are currently written in Chinese.

## Output

The default deliverable is `motion-spec.md`. Each interaction or effect has four fields:

| Field | Contents |
| --- | --- |
| Name | Stable ID and component, scene, or action |
| Purpose | Observed function; mark uncertain intent as inferred or unknown |
| Implementation | Trigger, states, timing, motion, coordination, edge cases, and transferable implementation suggestions |
| Evidence | Evidence type, source, reproduction steps or timestamps, and capture limitations |

The document also includes coverage, unknowns, and acceptance checks. Where useful and feasible, evidence is saved in an adjacent `motion-evidence/` directory. A specification does not establish that a reconstruction has been implemented or passed acceptance.

## Install and use

### Install with npx

Requires Node.js 22.20 or later and network access. Run this from the target project and choose a supported agent when prompted:

```bash
npx skills add PlevanTem/reverse-motion-skill
```

Installation is project-scoped by default; add `-g` for user-wide installation. See the [skills CLI](https://github.com/vercel-labs/skills) for more options.

### Install for Claude Code

Run from the target project:

```bash
npx skills add PlevanTem/reverse-motion-skill --skill reverse-motion-skill --agent claude-code --copy --yes
```

This installs to `.claude/skills/reverse-motion-skill/` in the current project. Add `--global` for user-wide installation; omit `--copy` and `--yes` to choose the installation method interactively. Then invoke the skill in a Claude Code session:

```text
/reverse-motion-skill Analyze the interactions and motion in this reference: <URL or video file path>.
Prioritize the main user journey and produce an implementable, testable specification with any unknowns.
```

To install without npx, copy the complete repository contents into the project's `.claude/skills/reverse-motion-skill/` or the user-wide `~/.claude/skills/reverse-motion-skill/`. Preserve the relative locations of `SKILL.md` and `references/`.

### Install for Codex

Select Codex in the installer, or copy the complete repository contents into `~/.codex/skills/reverse-motion-skill/`, then invoke `$reverse-motion-skill` in Codex. Skill discovery and invocation depend on the host. Browser interaction and video frame extraction require tools available in the execution environment. Producing a specification alone does not require changing the target page.

## Scope and limits

- **Websites**: Use authorized runtime, rule, interaction, and visual evidence. Cross-origin or isolated contexts and animations that never trigger or have finished may be inaccessible.
- **Videos / recordings**: Measure timestamps and visible motion; actual triggers, internal states, and a unique easing curve may remain unknown.
- **Single screenshots**: Only visible static states can be assessed; the full motion cannot be verified.
- **Output quality**: Visual estimates have sampling error. Report evidence gaps rather than promising complete or exact reconstruction.

## Files

```text
SKILL.md                 Skill entry point and decision rules
references/workflow.md   Mermaid workflow diagram
references/capture.md    Layered capture and state handling
references/spec.md       Specification format and acceptance
```
