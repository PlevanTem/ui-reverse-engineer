# UI Reverse Engineer

[中文](README.md) | English

**Turn interface references into actionable requirements, reusable design rules, or runnable site reconstructions.** Provide a website, screenshot, recording, source code, or an existing page. The Skill distinguishes evidence from inference instead of presenting guesses as facts.

## When to use it

- **You have a reference and want to reproduce it:** use `--restore` to reconstruct its available assets, visual details, motion, and interactions as a runnable project.
- **You want to infer the product request behind a finished interface:** use `--query` to produce requirements JSON.
- **You want to reuse a brand's visual language:** use `--design-md` to create a `DESIGN.md` and index entry.
- **You want to restyle an existing page while keeping its content and behavior:** use `--transfer` with a local HTML target.
- **You want both inferred requirements and a page draft:** the default is `--query --restore`.

## What you get

| Mode | Question it answers | Main output |
| --- | --- | --- |
| `--query` | What request could have produced this interface? | `query_instruction.json` |
| `--design-md` | How can this visual system be reused? | `design_assets/{brand}/DESIGN.md`, `design_assets/index.csv` |
| `--transfer` | How can I apply a new style and keep the existing content and interactions? | `{target}_transferred.html` |
| `--restore` | How can I reproduce the reference's assets, appearance, and behavior? | `design_brief.md` and a runnable `restored/` project |

Case outputs go to `reverse_output/{case_name}_{YYYYMMDD}/`; design assets go to `design_assets/`. See [`SKILL.md`](SKILL.md) for the complete specification.

To review multiple Restore runs under one standard, run `node scripts/restore/challenge-report.mjs OUTPUT_DIR RUN_DIR...`. It produces `challenge-report.json` and `challenge-report.html` using the deterministic `RestoreChallengeReport/v2` provenance projection. The DAG preserves nodes, hashes, and edges for runs, versions, candidate artifacts, assessments, verifications, diffs, static checks, and Final E2E; large evidence stays in its source run and is reached through relative links, which keeps generation and agent-context costs low. Final E2E, Loop Assessment, and the StaticCheckSuite bound to `run.best` remain separate, and direct comparison is allowed only inside the same contract, rubric, and scorer group. Missing results carry structured reasons and recoverability and are never converted to zero.

The single-run report template wraps verification hashes on narrow screens. See [report presentation checks](evals/README.md#检查); these checks do not establish game or page E2E success.

## How to start

### Project website and design system

[Project website](https://plevantem.github.io/ui-reverse-engineer/) · [Design system](https://plevantem.github.io/ui-reverse-engineer/design-system.html)

The local presentation site includes a landing page, case catalogue, Tiny Skies details, getting-started guide and component specimens. Audit visual and component decisions in [DESIGN.md](DESIGN.md), then follow [website/README.md](website/README.md) to build and preview. Case metadata is generated from `evals/cases.yaml`; draft status and public showcase availability remain distinct. The site is built and deployed by the GitHub Pages workflow.

Section 04 compares capabilities and mechanisms with Screenshot to Code and Open Lovable. Cells link official sources; undocumented does not mean unsupported, and the matrix is not a controlled performance ranking.

After installation, describe the task in plain language and provide the reference:

```text
Infer requirements from this product screenshot. Output JSON only; do not generate a page.
```

```text
Analyze this website's visual system and create a reusable DESIGN.md.
```

```text
Apply the style of this screenshot to ./index.html, preserving its copy and interactions.
```

```text
Reconstruct this website, including available assets, responsive layout, scroll motion, and key interactions. Deliver a runnable project and comparison results.
```

You can also specify `--query`, `--design-md`, `--transfer`, or `--restore` directly, and combine modes. With no mode specified, the default is `--query --restore`.

## Quick install

Run the matching command from your project root. The commands install from this repository after the skill directory is published on its GitHub default branch. This repository is private, so your account must have access.

**Codex**
```bash
npx --yes skills add https://github.com/PlevanTem/ui-reverse-engineer/tree/main/ui-reverse-engineer --skill ui-reverse-engineer --agent codex
```

**Claude Code**
```bash
npx --yes skills add https://github.com/PlevanTem/ui-reverse-engineer/tree/main/ui-reverse-engineer --skill ui-reverse-engineer --agent claude-code
```

**Grok Build**
```bash
npx --yes skills add https://github.com/PlevanTem/ui-reverse-engineer/tree/main/ui-reverse-engineer --skill ui-reverse-engineer --agent grok
```

**Gemini CLI**
```bash
npx --yes skills add https://github.com/PlevanTem/ui-reverse-engineer/tree/main/ui-reverse-engineer --skill ui-reverse-engineer --agent gemini-cli
```

**WorkBuddy**

WorkBuddy currently imports a local Skill package; `vercel-labs/skills` does not have a WorkBuddy install target. In WorkBuddy, choose **Add Skill / Upload Skill** and select the `ui-reverse-engineer` Skill package.

> The `npx` commands require this Skill directory to be published on the GitHub default branch. This repository is private, so your account must have access. If you already have the skill locally, run `npx --yes skills add <local-skill-path> --skill ui-reverse-engineer --agent <identifier>` from the target project root, replacing the path and identifier with your values.

## Restore browser-capture environment

The repository capture scripts use Playwright for frozen screenshots, interaction sequences, runtime resources, and console checks. The default Python entry point is `scripts/restore/capture.py`; a host browser with equivalent evidence capabilities is also usable. The Node and Python entry points freeze page time while each screenshot is serialized, so an expensive PNG capture cannot advance a game or animation state. This requires the Playwright/Chromium version pinned in `requirements-dev.txt`, or a host with equivalent Clock and CDP lifecycle support. Install the local dependencies only when those scripts are needed and the dependencies are absent:

```powershell
python -m pip install -r requirements-dev.txt
python -m playwright install chromium
```

Verify that the driver and browser can start:

```powershell
python -c "from playwright.sync_api import sync_playwright; p=sync_playwright().start(); b=p.chromium.launch(headless=True); print(b.version); b.close(); p.stop()"
```

`scripts/restore/capture.mjs` is an optional Node implementation. Install its dependency only when using that collector:

```powershell
npm install --save-dev playwright
npx playwright install chromium
```

Playwright supplies automated browser control. It does not add browser MCP access, video understanding, or permission to access a page. When login, anti-bot, or network restrictions apply, record the observable evidence and failure reason and leave unavailable states unverified.

## Inputs and limits

| Input | What it supports | Limit |
| --- | --- | --- |
| Website URL | Inspect structure, layout, visual states, responsive behavior, and key interactions; actively inspect publicly loaded source and runtime assets | Requires an available browser/page-reading capability; cross-origin, login, or tool limits may block some source checks and should be recorded |
| Screenshot / Figma | Extract layout, colors, typography, spacing, and component style | Invisible behavior must be labeled as inference |
| Video / recording | Reconstruct action sequences, state changes, and motion from key frames | Requires video/visual input support; fast transitions may only support inference |
| Source URL / HTML, CSS, JS | Infer information architecture, tokens, and state logic from implementation | Source inspection does not verify the live appearance |
| Local HTML | Target page for `--transfer` | `--transfer` requires a local HTML target |
| `DESIGN.md` | Style source for `--transfer` | Uses design tokens defined in the file |

A website URL is enough to start source discovery for technology-stack analysis; users do not need to provide a separate code-hosting link. Restore evaluations and clean-room runs use only frozen fixtures by default: they do not search extra public material or read case source evidence. Source reuse is permitted only when the user task and frozen policy explicitly select `source_assisted`. The inspectable scope depends on the browser and page-reading capabilities available in the client. Installing the Skill does not install browser MCP or add video understanding or local-file access that the client lacks. `--transfer` presents a migration plan before changing the page; `--restore` creates the brief and completes the reconstruction unless the user explicitly asks to review the brief first.

## Showcase

Cases in the showcase and test case library are provided solely for learning, research, and technical evaluation; rights to the referenced designs, trademarks, and assets remain with their respective rights holders, and inclusion does not grant permission for commercial use.

### Tiny Skies: reconstruction from v1 to v28

Reconstructing the [original Tiny Skies website](https://tinyskies.vercel.app/) through a **generate → independently evaluate → fix the gaps** loop. The 88-second landscape film opens with the original versus v28, then shows the evolving versions, the Agent's Observe/Plan/Fix decisions, and the automatically compiled evaluation report.

[![Tiny Skies English landscape demo: original comparison, v1–v28 iterations, and evaluation report](https://github.com/PlevanTem/ui-reverse-engineer/releases/download/tiny-skies-v28-showcase/poster-landscape-en.jpg)](https://github.com/PlevanTem/ui-reverse-engineer/releases/download/tiny-skies-v28-showcase/tiny-skies-social-landscape-en.mp4)

[Watch/download the English landscape video (88 seconds, 1080p)](https://github.com/PlevanTem/ui-reverse-engineer/releases/download/tiny-skies-v28-showcase/tiny-skies-social-landscape-en.mp4) · [中文版](https://github.com/PlevanTem/ui-reverse-engineer/releases/download/tiny-skies-v28-showcase/tiny-skies-social-landscape.mp4) · [Showcase media and checksums](https://github.com/PlevanTem/ui-reverse-engineer/releases/tag/tiny-skies-v28-showcase)

- **Implementation scope:** this is a source-assisted reconstruction, not a clean-room benchmark. Public code may inform frontend styling and interaction implementation; the 3D scene and art assets are rebuilt in code, without mirroring the original art assets or using a 3D-generation MCP.
- **Reviewing the result:** the closing frame shows the latest independent evaluation summary. The full local report supports review of state evidence, key iteration traces, and unresolved issues. The film is not a complete test recording; the media Release does not include the full case outputs.
- **Result limits:** the evaluation remains `fail / provisional`, with interaction differences and unverified long-chain gameplay; the Judge is not calibrated. Visible improvement is neither a complete E2E pass nor evidence that model RL training has been performed.

## Project structure

```text
ui-reverse-engineer/
├── AGENTS.md                 # Project rules, maintenance practices, and checks
├── SKILL.md                  # Agent runtime entry point and four workflows
├── README.md                 # Chinese usage guide and project structure
├── README.en.md              # English usage guide
├── CHANGE_LOG.md             # Significant iterations, large revisions, and push records
├── requirements-dev.txt       # Restore Python browser-capture dependency
├── references/               # On-demand templates and detailed guides
│   ├── design-md-template.md # Reusable DESIGN.md template
│   ├── transfer-guide.md     # Style transfer guide
│   ├── technology-stack-analysis.md # Website stack analysis SOP
│   ├── restore.md            # Single Restore execution SOP
│   ├── restore-brief-template.md # Reconstruction brief template
│   └── restore/              # Exact interfaces, schemas, and local visual criteria
├── scripts/restore/          # v0.2 controller, capture adapters, diagnostics, report, and approval
├── assets/restore/           # v0.2 HTML report template
└── evals/                    # --restore page E2E reconstruction quality evaluation
    ├── README.md             # Evaluation layout, workflow, and automation boundary
    ├── cases.yaml            # Eleven draft page-reconstruction cases; freeze fixtures before evaluation
    ├── case-schema.json      # Schema v1.2; separate UI/task types and three difficulty levels
    ├── case-manager/         # Local case library; auto-loads cases.yaml and uses high-level stack modules
    ├── restore.md            # Single Restore final E2E evaluation plan
    ├── templates/            # Cross-case version-evaluation report template
    ├── fixtures/              # Authorized, frozen input materials
    ├── pipeline/              # Independent five-dimension E2E scorer
    └── results/               # Per-run summaries keyed by run_id
```

See [`evals/README.md`](evals/README.md) for the evaluation entry point, single authoritative plan, and report template. User-generated case outputs and private materials are not repository templates; only add fixtures with clear permission, no personal data, and manageable size.

## FAQ

### How is Skill reconstruction different from saving a page with Ctrl+S?

Ctrl+S saves a snapshot of the page currently loaded in the browser. The exact HTML, assets, and state depend on the browser's save mode; dynamic data, cross-origin assets, and interactions may not work offline. `--restore` uses evidence from the reference page—screenshots, states, interactions, and assets—to build a separate, runnable local copy that can be changed, while recording iterations and differences. Ctrl+S is useful for archiving; reconstruction is useful for reproducing and continuing development.

<details>
<summary>What is an obligation in Restore mode?</summary>

An obligation turns “make the page look similar” into an observable, comparable, traceable acceptance target. It specifies which aspects of the reference must be reproduced and what evidence can show whether a change improved them.

For example, an obligation for the desktop home page might require the dark background, centered headline, and relative positions of four colored label groups to be close to the reference screenshot. This identifies the state and region to inspect, helps prioritize repairs, and allows the next comparison to check both improvement and regressions. Mark insufficient evidence as `unknown` rather than scoring from memory.

This is a test oracle problem: define what counts as a correct result and how the evidence will establish it.

</details>

<details>
<summary>When are obligations used in the Restore workflow?</summary>

1. **Freeze before generation:** The [Restore workflow](references/restore.md#1-冻结任务) records pages, viewports, states, key regions, interaction steps, and reference evidence. Obligations are written to the run's `contract.json`.
2. **Define judgment criteria:** [Loop Criteria](references/restore/criteria.md) ties each obligation to a state and region, expected behavior, importance, evidence, and method. It classifies them as C1 composition, C2 appearance, or C3 motion.
3. **Measure and repair:** An evaluator records a score from 0–4 or `unknown` when evidence is insufficient. After a repair, compare again for improvements and regressions in other required obligations. Distinguish independent evaluation from implementer self-checks; see the [Restore interfaces](references/restore/interfaces.md#冻结与输出).
4. **Evaluate E2E separately:** Obligations guide iteration. Final acceptance separately evaluates layout, style, content, interaction, and robustness alongside redlines; obligation scores cannot be converted directly into the final E2E score. See [final evaluation](evals/restore.md).

</details>

## Further reading

- [Full Skill specification](SKILL.md): modes, usage, and outputs.
- [Website technology stack analysis SOP](references/technology-stack-analysis.md): technology and asset investigation.
- [Stack audit scripts](scripts/stack-audit/README.md): local collection and human verification.
- [Restore execution flow](references/restore.md): freezing, generation, iteration, and stopping.
- [Loop Criteria](references/restore/criteria.md): local visual assessment and candidate decisions.
- [Restore interfaces](references/restore/interfaces.md): commands, capture, evidence, and reports.
- [Restore final E2E](evals/restore.md): final acceptance, scoring, and redlines.
- [Interactive scene reconstruction](references/restore/interactive-scenes.md): persistent interactions, 3D, and motion.
- [Reconstruction brief template](references/restore-brief-template.md): scope, implementation, and evidence.
- [DESIGN.md template](references/design-md-template.md): design asset structure.
- [Style transfer guide](references/transfer-guide.md): transferring a reference style.

The Chinese README is the default entry point. See [README.md](README.md).


