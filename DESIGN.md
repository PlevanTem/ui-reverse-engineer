# UI Reverse Engineer — Website Design System

Version: 1.1 · 2026-10-28 · Status: implemented; publishing managed by `.github/workflows/pages.yml`.

## Purpose and authority

This file controls the presentation website's visual language, components and interaction design. `website/design-system.html` is its executable specimen; `website/tokens.css` contains the matching implementation values. Runtime SOPs, case schemas and evaluation rules retain their existing authorities; this document only links to them.

Primary visitor tasks: understand the deliverable, inspect Tiny Skies, assess capability evidence, browse reference cases, and start a task. The intended commercial value is making reconstruction scope and results reviewable. Cost, time and quality improvements are hypotheses until measured.

## Visual Theme & Atmosphere

Technical Mono / Monochrome / Code Brutalism. Editorial scale, generous whitespace, compact metadata, square controls, thin rules and purposeful ASCII. A technical research notebook with a visible hierarchy. Do not simulate a command shell or hide navigation behind commands.

Reference perspectives: task-oriented information architecture; Storybook's explicit UI states; Robert Nystrom's input/state/feedback model. These are design perspectives, not affiliations or endorsements.

## Color Palette & Roles

| Token | Value | Role |
| --- | --- | --- |
| `--paper` | `#f5f5f0` | Main background |
| `--ink` | `#20211f` | Primary type, dark panels |
| `--muted` | `#63655f` | Supporting readable text |
| `--line` | `#c9cbc2` | Decorative rules |
| `--control-line` | `#76796e` | Form control boundaries |
| `--wash` | `#eaece3` | Selected controls and specimens |
| `--white` | `#ffffff` | Media fallback |

UI uses monochrome only. Reference images/video retain original color. Status must always have a readable label; emoji are evidence maturity markers, never standalone verdicts. `fail / provisional` stays visible next to the featured showcase.

## Typography Rules

Use local system fonts: `Consolas, 'SFMono-Regular', 'Liberation Mono', monospace` for Latin/metadata; `'Microsoft YaHei', 'PingFang SC', sans-serif` as Chinese fallbacks. No external font dependency.

| Role | Desktop | Mobile |
| --- | --- | --- |
| Hero English | clamp(48px, 6.5vw, 100px), line-height 0.98 | 48px minimum |
| Section title | clamp(30px, 4vw, 56px), line-height 1.15 | 30px |
| Lead Chinese | 22px, line-height 1.65 | 20px |
| Body | 16px, line-height 1.85 | 16px |
| Metadata | 11–12px, line-height 1.5 | 11–12px |

English headings can use uppercase and -0.06em tracking. Chinese prose has normal tracking. Do not shrink explanatory text to make tables fit.

## Layout Principles

Content max-width 1320px; horizontal gutters 40px desktop, 24px tablet, 20px mobile. Section padding 104px desktop / 64px mobile. Spacing scale: 4, 8, 12, 16, 24, 32, 48, 64, 104px.

Desktop hero: 3:2 split, words left and ASCII globe right. Main case: large media frame with narrow factual ledger. Case library: three-column ruled grid, two columns below 1000px, one below 680px. No decorative cards inside cards. Tables scroll inside their own container, never widen the page.

## Component Stylings

- Navigation: 76px minimum height, top rule/bottom rule, text wordmark, current page underlined; mobile disclosure menu.
- Button/link button: square, 1px ink border, minimum 44px height, 14px type, 12px 20px padding. Filled primary / outlined secondary / text tertiary. Hover inverts or fills; disabled is explicitly labeled.
- Focus: 2px ink outline, 4px offset; inverse focus on dark panels.
- Metadata tag: compact bordered label, no pill radius. Case status is separate from showcase availability and E2E verdict.
- Tabs: native buttons with `role=tab`, selected state, linked panel, Arrow/Home/End support. Use one row wrapping on small screens.
- Details: native disclosure, full-width label and plus/minus indicator.
- Case card: flat border grid; ID/status → title → description → tags → detail link. Do not invent imagery for unavailable case outputs.
- Media: native video controls, `preload=none`, supplied release poster, external source fallback. No autoplay, grayscale filter, manufactured synchronous comparison, or fake playback UI.
- Empty state: clear reason and reset action; a draft case is not a failed run.
- Copy: clipboard with selectable-text fallback and live status feedback.

## Page composition

1. `index.html`: hero → Tiny Skies → four workflows → method comparison → capability matrix → process → case preview → start/FAQ. No standalone data-statistics section.
2. `cases.html`: searchable catalogue with all/generated/pending views and type/generation filters. Card upper-right shows 已生成 or 待生成. Only Tiny Skies is currently marked generated, as specified by the maintainer; this does not change evaluation readiness.
3. `case.html?id=...`: catalogue facts, evidence/limitations, availability; Tiny Skies adds real release video, source strategy and current showcase result. No invented per-version findings.
4. `guide.html`: task selector, copyable prompt, local installation route, requirements and documentation links.
5. `design-system.html`: palette, type, controls, states, grid, ASCII specimen and audit contract. Accessible from footer.

## Content and evidence contract

`evals/cases.yaml` owns catalogue metadata. `website/build.mjs` exports an allowlisted, read-only presentation dataset plus source SHA-256. `website/content.js` owns editorial workflow/capability/showcase descriptions with source links. Never use showcase availability to overwrite a case's `draft/ready/retired` state. Aggregate ready counts exclusively from catalogue status. Do not equate zero ready cases with zero frozen historical runs.

Tiny Skies release describes source-assisted reconstruction; scene/art generated in code without mirroring original art; published showcase result `fail / provisional`; unverified long-chain gameplay, uncalibrated Judge; media release does not include complete run outputs. This is a dated README-derived summary, not a live E2E result or a claimed v28 run verdict.

Section 04 compares project mechanisms: UI Reverse Engineer, Screenshot to Code (abi), and Open Lovable (Firecrawl). `website/comparison.js` owns the dated source-linked matrix. Labels: ✅ explicitly documented support/mechanism; ◐ conditional or partially overlapping support; — not described in the reviewed official sources, not proof of absence. This is mechanism coverage, not empirical ranking or an assertion of exclusive capabilities. Explain the product distinction via state/action capture, bounded keep/revert and artifact/evidence tracing. Highlight this project's column using monochrome wash and top rule. Each cell links its source. All three category tabs use the same comparison component on home and specimen pages. On phones, scroll the comparison table within a labeled keyboard-focusable region. Method comparison describes workflows, not experimentally proven superiority. Do not invent improvement percentages, customers, testimonials, full run scores or state coverage.

Case schema: [case-schema.json](evals/case-schema.json). SOP: [restore.md](references/restore.md). Evaluation: [evals/restore.md](evals/restore.md). Dataset conventions: [evals/README.md](evals/README.md).

## Depth & Elevation

Zero shadows, zero gradients, zero corner radius. Depth comes from whitespace, rules, contrast and typography. Avoid terminal chrome, browser mockup frames and ornamental dashboards.

## Motion & Effects

ASCII globe is a generated decorative text specimen, not a reconstruction result. Slowly rotate longitude and texture with a maximum update rate near 12fps. Pause offscreen and when the tab is hidden; expose a pause/play control. `prefers-reduced-motion` defaults to a static specimen, with explicit user opt-in to play. UI transitions 140ms ease-out, disabled for reduced-motion users. No scroll hijacking, parallax or typed body copy.

## Responsive Behavior and accessibility

Breakpoints: 1000px and 680px. Hero/feature/process stack; case grid collapses. Skip link, semantic landmarks, single h1 per page, descriptive source links, labeled form fields, native video controls, live results/copy status. Decorative ASCII is `aria-hidden`. No automatic external navigation or playback. Remote media requires network; local UI uses system fonts and local assets.

## Do's and Don'ts / audit

- Keep one strong action per section; move technical details into disclosures.
- Keep media in original color and verdict text visible.
- Prefer concrete deliverables and explicit input strategies.
- Never fabricate screens, run lineage, scores, timestamps or benchmark readiness.
- Verify desktop/mobile layout, real filters, tabs/keyboard, copy feedback, detail deep links, empty states and source links. Record media verification separately from UI checks.
- Keep bilingual repository README links synchronized. Record material site changes in CHANGE_LOG.md. Building this website does not change Restore's evaluation status.

## Agent Prompt Guide

Create an editorial monochrome site on #f5f5f0 with #20211f text, system monospace Latin typography, readable Chinese fallback, large tight headings, 1px rules and square controls. Use a restrained ASCII globe as decoration. Show actual Tiny Skies media in original color and show source-assisted / fail / provisional alongside it. Drive case counts from YAML. Maintain the distinction between reference case, available showcase and evaluation-ready fixture. Implement accessible native interactions and link evidence. Read this document before modifying presentation components.
