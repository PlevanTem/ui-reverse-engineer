# Website verification — 2026-10-28

## Motion / generation status / Pages revision

Verified in Chromium: ASCII text changes over time, pause freezes it, reduced-motion defaults to static. Hero CTA reads 观看示例. Removed standalone DATA section. Catalogue cards show one 已生成 (UIR-0008) and ten 待生成; generated/pending tabs filter correctly. Evaluation status is unchanged. 390px layout passed. Added main-triggered GitHub Pages workflow and relative URL support; deployment status is recorded separately after remote execution.

## Section 04 revision

Replaced maturity-only list with 18 source-linked project mechanisms across three tabs. Compared current official README/Evaluation for abi/screenshot-to-code and README/home/URL API for firecrawl/open-lovable. No exhaustive absence claims or controlled outcome ranking. Unknown cells explicitly name the reviewed-sources limitation.

Real Chromium: each tab has four columns, six data rows and 18 source links; keyboard Home switch passed. At 390px, document width=390, table width=840, scroll region width=349. No page errors observed. Design system reuses the same renderer. Local screenshots: landing-capability-matrix-desktop.png / mobile.png. Build and syntax checks passed.

Scope: local presentation website, not Restore quality evaluation. No publishing, commit or push performed.

## Design traceability

- Root `DESIGN.md` was created before website implementation; tokens implemented in `tokens.css` and reused across all pages.
- `design-system.html` renders live palette, typography, controls, disclosure, capability tabs, case cards and decorative ASCII.
- Source content: current local README and `evals/cases.yaml`. Tiny Skies is labeled source-assisted and README-derived `fail / provisional`; no new E2E score is asserted.
- Build exports 11 catalogue entries / 0 ready; source SHA-256 is visible in the catalogue and design-system page. This count is not a census of historical frozen runs.

## Browser checks

Real Chromium driven with Playwright CLI against localhost:

- 1440px and 390px: home, catalogue, Tiny Skies, guide, design specimens and missing-case fallback have one h1 and no whole-document horizontal overflow.
- Visual screenshot review caught missing mobile hero gutters despite a passing document-overflow check. Fixed 20px mobile gutters; measured hero x=20, width=350 at 390px.
- Search Tiny Skies → 1 result; reset → 11; interactive type → 5; ready status → 0; ready view → empty state; public showcase → 1.
- All 11 case detail URLs render; missing ID displays return link.
- Capability tab updates its panel; task deep link selects Restore; Home key selects first task; mobile menu updates expanded state.
- Prompt copy asynchronously reports `已复制 ✓`. Initial immediate assertion raced the clipboard promise; waiting for live feedback passed. No application change was needed.
- Representative internal links return HTTP 200, including local DESIGN.md. No page JavaScript errors observed during representative final navigation.
- Initial browser favicon 404 fixed by adding local SVG favicon and rebuilding.
- Official remote Tiny Skies poster loaded at 1920×1080; video loaded data at 1920×1080, duration 88 seconds. Full playback/end-to-end decoding not re-tested. This does not verify game interaction or E2E.

Screenshots are local ignored QA artifacts under `output/playwright/landing-*.png`; not copied into site content.

## Static checks and limits

- `node website/build.mjs`, app/content/build syntax checks and `git diff --check` passed.
- `skills-ref` is unavailable. Existing Restore runtime tests were not rerun because this change only adds the presentation website and documentation.
- External repository links and arbitrary original sites were not exhaustively checked. Remote media requires network/account access. Installation commands were not executed.
- Only Chinese UI is implemented; English repository README has a synchronized website entry. No empty language selector is presented.
- Preview server serves generated `website/dist`; see website README for startup. Static output is ignored. No runtime service/database introduced.
