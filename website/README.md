# Presentation website

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
- Presentation generation state is controlled by `generatedCaseIds` in `content.js`: only Tiny Skies is generated. Cards and filters use 已生成/待生成; evaluation status remains in case details. ASCII motion has pause/play, reduced-motion default, visibility gating and offscreen pause.
- Video/poster are official GitHub Release URLs, loaded remotely without mirroring binary files. Internet/account access may affect them; source links and an error fallback remain available. No autoplay.
- No full run artifact, implementation source, personal input or secret is copied into this site. Case evidence contains public catalogue descriptions and reference links.

## Manual verification

Check desktop and phone widths; capability tabs including keyboard; case search/type/status filters, reset and ready empty state; every case detail; task deep links and copy feedback; menu; missing case fallback; remote video separately. Website checks do not establish Restore E2E success.
