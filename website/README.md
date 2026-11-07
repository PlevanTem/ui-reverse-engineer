# Presentation website

## Q&A: Does Restore collect trajectory data automatically?

Yes. Use [the Harbor Restore entry point](../references/harbor/automation.md). It prepares the task and runtime Skill, launches Harbor, then exports a Trial Package even after Agent failure or timeout. Native ATIF-v1.7/v1.8 is validated without relabeling. A recorded episode is not automatically an SFT/RL candidate; missing ATIF or incomplete execution remains explicit.

## Q&A: Can a user provide only a website URL?

Yes: `node scripts/harbor/restore.mjs --url URL`. During prepare, the Agent follows the [URL task prompt](../references/restore/url-task-prompt.md), observes the website, and writes the scene and restoration task to contract.task_description. Intent inferred from the page is labeled inferred. States, obligations, resources and unknowns retain their existing contract fields. The brief and Data Factory task metadata are generated projections. `--case` is reserved for manually prepared ready fixtures; drafts do not silently become live-URL tasks.

## Q&A: Has the whole URL-to-data flow actually run?

Yes. The POLA URL trial completed task inference, a generated brief, baseline and repair steps, native ATIF export, a Data Factory Snapshot and verifier-only regrade. Independent visual quality remains incomplete; this episode is auditable, with SFT/Preference/RL candidates closed. The [runtime acceptance record](../references/harbor/automation.md) is the single source for evidence, versions and remaining limits.

Local static website for the project. Design authority: [../DESIGN.md](../DESIGN.md). Component specimen: `design-system.html`.

## Build and preview

The builder reuses the existing YAML dependency from `evals/case-manager`. If absent, install that directory's dependencies using its lockfile first. No other frontend dependency is required.

```powershell
node website/build.mjs
node scripts/restore/serve-static.mjs website/dist 4189
```

Open `http://127.0.0.1:4189/`. Pages: `index.html`, `cases.html`, `case.html?id=UIR-0008`, `guide.html`, `design-system.html`.

Serve the generated `dist/`, not the source directory: `cases-data.js` and the downloadable design document are generated/copied during build. Rebuild after editing `evals/cases.yaml` or website sources. `dist/` is ignored. GitHub Actions builds and publishes it using `.github/workflows/pages.yml`; all site links are relative to support the repository Pages subpath.

## Audit and data

- Visual tokens: `tokens.css`; shared components: `styles.css`; presentation: `app.js`.
- Dataset: `evals/cases.yaml` → explicit allowlist in `build.mjs` → generated read-only data with source SHA-256.
- Editorial capability/workflow descriptions: `content.js`, with repository evidence links. Tiny Skies description references the README's dated showcase, not a new evaluation.
- Section 04 project mechanism matrix: `comparison.js`, with official source links and review date. A dash means not found in the reviewed sources, never confirmed absence. The matrix is not a same-budget performance benchmark.
- Catalogue status, showcase availability and final E2E remain distinct. Zero ready entries is not zero frozen historical runs.
- Presentation generation state is controlled by `generatedCaseIds` in `content.js`: Mosby’s Files, General Intuition, Tiny Skies, and the local Firewood run are generated. Mosby’s Files uses one hash-checked candidate screenshot as a case-cover preview; it does not imply a passing evaluation. Cards and filters use 已生成/待生成; evaluation status remains in case details. ASCII motion has pause/play, reduced-motion default, visibility gating and offscreen pause.
- Video/poster are official GitHub Release URLs, loaded remotely without mirroring binary files. Internet/account access may affect them; source links and an error fallback remain available. No autoplay.
- No full run artifact, implementation source, personal input or secret is copied into this site. Case evidence contains public catalogue descriptions and reference links.

## Manual verification

Check desktop and phone widths; capability tabs including keyboard; case search/type/status filters, reset and ready empty state; every case detail; task deep links and copy feedback; menu; missing case fallback; remote video separately. Website checks do not establish Restore E2E success.

- UIR-0005 is generated locally and appears before pending cases. Its case card and detail page show `assets/mosby-files-preview.png` (SHA-256 `6b326f79dcddaf6a40e484e535100542775fc60ba1b85e93daa881a6a47ac0fe`), a candidate screenshot from the evaluation record. Its latest independent post-run review is fail / provisional; the final total is uncomputed, redline findings remain unknown, and Judge calibration is unmeasured. The case remains draft. The source material, run artifacts and report are not published.
- UIR-0011 is generated locally and appears in generated filters. Its latest fixture-only run has incomplete final E2E; an earlier completed independent evaluation is fail / provisional at 60/100. Artifacts and full reports are not published.

Firewood publishes one hash-checked iteration13 baseline screenshot from `output/` as its card and detail visual. It is local restoration evidence, not the original site, a runnable output or a final-E2E pass claim; the normal build includes this image while keeping complete artifacts and reports private.

- UIR-0007 is generated locally. Its 2026-10-15 historical report records 75/100 and a human-adjudicated pass after the original judge failed the obstruction redline; calibration and coverage limits remain. The site publishes one recorded local reconstruction screenshot (`candidate1c-desktop-hero-t0`, SHA-256 `d3cd20b…03afac`) as the card and detail visual; it is not the original site and does not expose the output or full report.

- Case cards use one 16:10 cover frame across the homepage and library. General Intuition uses a recorded local reconstruction screenshot; Tiny Skies links its existing Release poster and video; Firewood uses a hash-checked local image only in the opt-in preview. Cases without public images use a labeled typographic placeholder. Detail pages preserve the distinction between public video, published evidence screenshots and local-only outputs.
