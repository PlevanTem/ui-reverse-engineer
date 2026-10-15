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

## How to start

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

## Inputs and limits

| Input | What it supports | Limit |
| --- | --- | --- |
| Website URL | Inspect structure, layout, visual states, responsive behavior, and key interactions; actively inspect publicly loaded source and runtime assets | Requires an available browser/page-reading capability; cross-origin, login, or tool limits may block some source checks and should be recorded |
| Screenshot / Figma | Extract layout, colors, typography, spacing, and component style | Invisible behavior must be labeled as inference |
| Video / recording | Reconstruct action sequences, state changes, and motion from key frames | Requires video/visual input support; fast transitions may only support inference |
| Source URL / HTML, CSS, JS | Infer information architecture, tokens, and state logic from implementation | Source inspection does not verify the live appearance |
| Local HTML | Target page for `--transfer` | `--transfer` requires a local HTML target |
| `DESIGN.md` | Style source for `--transfer` | Uses design tokens defined in the file |

A website URL is enough to start source discovery; users do not need to provide a separate code-hosting link. The inspectable scope depends on the browser and page-reading capabilities available in the client. Installing the Skill does not install browser MCP or add video understanding or local-file access that the client lacks. `--transfer` presents a migration plan before changing the page; `--restore` creates the brief and completes the reconstruction unless the user explicitly asks to review the brief first.

## Showcase

There are no verifiable target/result examples yet, so this table is a placeholder. Add the reference, output, and verification method together.

| Scenario | Reverse-engineering target / reference | Result | Verification |
| --- | --- | --- | --- |
| Page reconstruction | To be added | To be added | To be added |
| Design asset extraction | To be added | To be added | To be added |
| Restyling an existing page | To be added | To be added | To be added |

## Project structure

```text
ui-reverse-engineer/
├── AGENTS.md                 # Project rules, maintenance practices, and checks
├── SKILL.md                  # Agent runtime entry point and four workflows
├── README.md                 # Chinese usage guide and project structure
├── README.en.md              # English usage guide
├── CHANGE_LOG.md             # Significant iterations, large revisions, and push records
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

## Further reading

- [Full Skill specification](SKILL.md)
- [Website technology stack analysis SOP](references/technology-stack-analysis.md): cross-check source/runtime and visual evidence; Canvas/3D pages must pass the API, renderer, model-resource, and page-mapping gate, with Three.js attribution and version-drift reviews
- [Stack audit scripts](scripts/stack-audit/README.md): local collection, first-party source candidate scanning, and a human evidence gate; no automatic stack confirmation
- [Restore execution flow](references/restore.md): freeze references, build a baseline, run bounded repairs, stop, and evaluate
- [Reconstruction brief template](references/restore-brief-template.md)
- Restore uses bounded 30/60/120-minute tiers. The three [Loop criteria](references/restore/criteria.md) guide repairs only; commands, fields, and the report flow are defined in the [interfaces](references/restore/interfaces.md).
- E2E evaluates only the final delivered artifact. The report and approval flow use one final result. `PostRunE2EReview/v1` binds that result to the final artifact and frozen contract; when present, it is authoritative in the final quality view. The report records Judge provider/model, evaluation time, rubric/scorer versions, environment, and limitations. It does not record evaluator role or ID. See the [interfaces](references/restore/interfaces.md) and [schema](references/restore/post-run-e2e-review.schema.json).
- Every case uses six stable redline IDs, judged against frozen states, regions, interactions, and fact boundaries. New rubric v1.2-draft cases require `RedlineProfile/v1`; the grader checks contract consistency but does not replace visual judgment. See [Restore final E2E](evals/restore.md).
- Final E2E uses five equally weighted dimensions: `layout`, `style`, `content`, `interaction`, and `robustness`. `fidelity` is no longer scored; factual overreach is handled by the `fabrication` redline. A case passes when every applicable dimension is at least 3 and no redline fails; there is no duplicate 75-point gate.
- For `interaction` and `robustness`, evaluators may use browser browse control to operate controls, observe visible feedback, and inspect viewports. Leave console or resource states marked unchecked when they were not inspected.
- When a dimension is unknown, keep the complete total empty. The report may show a normalized score for scored dimensions with weight coverage, clearly labeled as partial rather than a complete E2E total.
- [DESIGN.md template](references/design-md-template.md)
- [Style transfer guide](references/transfer-guide.md)

The Chinese README is the default entry point. See [README.md](README.md).


