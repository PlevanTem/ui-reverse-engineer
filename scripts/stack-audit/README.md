# Stack Audit

Small, local scripts for collecting and reviewing evidence about a public website's technology stack. They do not auto-confirm technologies. A human must map every candidate or runtime signal to a page region and evidence before validation reports `complete: true`.

## Requirements

- Node.js 20 or later.
- Playwright available in the host tooling environment. Set `RESTORE_PLAYWRIGHT_MODULE` to its entry module when it is not resolvable from this repository.
- No browser download, package installation, proxy, authentication bypass, or guessed source-map URL is performed by these scripts.

## Workflow

1. Collect a page state and only the interactions needed to expose relevant behavior:

   ```powershell
   node scripts/stack-audit/collect.mjs https://example.com reverse_output/stack-audit/example
   node scripts/stack-audit/collect.mjs https://example.com reverse_output/stack-audit/example reverse_output/stack-audit/steps.json
   ```

   Optional `steps.json` is an array of `click`, `hover`, `key`, `scroll`, or bounded `wait` actions. Example:

   ```json
   [
     { "action": "click", "selector": "button.start", "settle_ms": 1000 },
     { "action": "scroll", "y": 900 }
   ]
   ```

   Output includes `audit.json`, screenshots, observed request metadata and same-host JavaScript/CSS responses up to 8 MB each. Sensitive query parameter values are redacted. Source files are captured only when the browser actually loaded them from the target hostname.

2. Scan captured source for implementation candidates:

   ```powershell
   node scripts/stack-audit/source-scan.mjs reverse_output/stack-audit/example/audit.json reverse_output/stack-audit/example/source-scan.json
   ```

   A string match is a candidate only. It may come from dead code, a shared bundle or an unrelated page module.

3. Review every `audit.signals` and source-scan finding. Write `reverse_output/stack-audit/example/review.json`:

   ```json
   {
     "schema_version": "StackAuditReview/v0.1",
     "page_identity": {
       "status": "confirmed",
       "landmarks": ["campaign title", "main illustration scene"],
       "evidence_ids": ["screenshot:0"],
       "rationale": "Both landmarks match the requested campaign page."
     },
     "decisions": [
       {
         "signal_id": "canvas:0",
         "status": "confirmed",
         "region": "main 3D scene",
         "evidence_ids": ["canvas:0", "screenshot:0"],
         "rationale": "This canvas covers the active scene after clicking Start."
       }
     ],
     "claims": [
       {
         "technology": "Three.js",
         "region": "main 3D scene",
         "evidence_ids": ["source:0", "request:2", "screenshot:1"],
         "rationale": "The loaded first-party source creates THREE.WebGLRenderer for the canvas that displays the observed model scene.",
         "references": [{ "url": "https://github.com/example/project", "note": "Public source repository identifies the deployment URL." }]
       }
     ]
   }
   ```

   Confirm the target page with at least two visible landmarks. Signal decisions use `confirmed`, `excluded`, `candidate`, or `unknown`. `confirmed` requires a region and evidence IDs; all decisions require a rationale. Unresolved candidates keep the audit incomplete.

4. Run the evidence gate:

   ```powershell
   node scripts/stack-audit/validate.mjs reverse_output/stack-audit/example/audit.json reverse_output/stack-audit/example/source-scan.json reverse_output/stack-audit/example/review.json reverse_output/stack-audit/example/validation.json
   ```

   The gate fails on missing decisions, unresolved signals, invalid evidence references, or claims without region/evidence/rationale. It does not edit `cases.yaml`; copy only reviewed claims and their evidence summary into a draft case.

## Limits

- A browser context hook records canvas context requests while preserving the original `getContext` behavior. It can miss workers, contexts created before injection, and APIs used through browser internals.
- The scanner checks captured same-host source only. It does not fetch hidden URLs or source maps that the page did not load.
- Request initiators are best-effort CDP metadata and may be absent for browser/cache/service-worker paths.
- Captured resource URLs, snippets and screenshots can contain page data. Keep the output local and remove it when it is no longer needed.
