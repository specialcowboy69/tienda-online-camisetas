# SEO foundation — gate A, 19 October 2026

Scope: local implementation only. **NO-GO remains unchanged.** No push, PR,
merge, deployment, GSC submission, Rich Results result or Google indexing claim.

## Local code and mocked evidence

Foundation commits through `85c9576` implement publication filtering, shared
public product resolution, clean canonical metadata, operational noindex,
sitemap/robots, Organization and BreadcrumbList. This gate adds
`scripts/verify-seo.mjs` and its standalone Node tests. The gate commit is the
commit introducing this document (`git log -1 --format=%H -- scripts/verify-seo.mjs`).

- RED: `node --test scripts/verify-seo.test.mjs`: six behavioral tests failed
  against empty implementations (after the initial absent-module failure).
- GREEN: same command: nine passed (including separate RED/GREEN regressions for Windows case-insensitive protected output paths and the equivalent root canonical serialization emitted by Next). Covers URL/method/output safety,
  redirects, metadata extraction, duplicate/wrong canonical, invalid JSON-LD,
  absent noindex, sitemap 503, and an end-to-end synthetic successful catalog.
- `npm.cmd test`: 57 files, 814 tests passed, including mocked PDP/public
  catalog/metadata/structured data and sitemap unavailable behavior.
- Remaining required checks and HTTP observations are recorded below.

## Running the safe smoke

From this checkout, after building and starting Next on loopback:

```powershell
node scripts/verify-seo.mjs --base-url http://127.0.0.1:3217 --output .superpowers/sdd/2026-10-19-camisetas-seo-foundation/seo-http-local.json
```

Output must be a new `.json` file in an existing directory inside this checkout;
existing files and protected output paths are rejected before network access.
The script accepts only loopback or the exact HTTPS production origin, rejects
credentials and arbitrary query values, uses GET without cookies or request
bodies, and refuses all redirects. Its fixed route allowlist excludes APIs,
checkout and cart. It discovers at most 20 PDP requests from catalog HTML and
uses only the synthetic `utm_source=seo-smoke` query. It never submits forms,
validates email, quotes shipping, pays, creates orders or activates services.

Exit 0 means requested assertions passed; exit 1 means assertions or execution
failed. Always read `limitations` too: empty catalog leaves HTTP PDP coverage
unverified; catalogs above 20 leave unsampled PDPs unverified. The harness is a
bounded rendered-HTML smoke, not a full HTML validator or browser interaction
suite. It parses JSON-LD syntax; entity semantics are covered by mocked tests.

Production support is for a separately approved post-deployment verification;
this run never called production. After such approval, rerun against the actual
origin and verify CDN robots contains the expected Sitemap. CDN changes require
separate permission.

## Pending integration and external evidence

- This local A branch still depends on parent legal/panel work being integrated
  and concurrent legal edits being reconciled. No claim of merge readiness.
  Perform the full current AGENTS integration audit immediately before any PR
  or integration recommendation; historical branch state is not current proof.
- B tasks 5–6 and variant URL/initial selected price/image checks remain pending
  the parent gate. No ProductGroup, Product/Offer or variant selection added.
- Independent review of this gate remains for the coordinating agent. No
  reviewers/subagents were dispatched by this task; self-review only.
- HTTP PDP with safe populated catalog, production smoke, Rich Results, GSC,
  indexing outcomes and deployment evidence remain pending.
- Stripe Tax, live payments, manufacturing, analytics and operational alerts
  are not activated. All launch blockers and NO-GO remain.

## Required checks and actual local HTTP

`npm.cmd run lint`, `npx.cmd tsc --noEmit --incremental false`, and
`npm.cmd run build` all exited 0 in this worktree, using its installed
node_modules and Next 15.5.26. Build compiled successfully and generated 9/9
static pages. Final harness-only corrections were followed by all nine Node
tests and lint passing; application source/build inputs did not change.

No provider credential names were present in the inherited environment and the
only `.env*` file was `.env.example`. No credentials were copied. Next was
started with `node node_modules/next/dist/bin/next start --hostname 127.0.0.1
--port 3217`, using this fresh build, then stopped after verification.

Final CLI result: **exit 1**, not a fully passing HTTP gate. Twelve GETs:

| Routes | HTTP | Assertion evidence |
| --- | --- | --- |
| `/`, `/products`, `/privacy`, `/cookies` | 200 | Unique titles and single clean canonical; commercial H1 checks passed |
| `/admin`, `/success`, `/cancel` | 200 | noindex present |
| `/products/seo-smoke-nonexistent` | 404 | noindex present |
| `/` and `/products` with synthetic tracking query | 200 | Canonical remains clean |
| `/robots.txt` | 200 | Exact expected Sitemap directive present |
| `/sitemap.xml` | 503 | Unavailable catalog detected; public sitemap comparison blocked |

There were zero product links because no safe local Firestore catalog was
configured. HTTP PDP content and populated sitemap consistency remain blocked;
existing mocked PDP/catalog/sitemap tests provide local code evidence only.
The initial HTTP run also exposed Next's root canonical serialization without
a final slash; the harness now accepts those two equivalent root forms only.
No application metadata was changed to accommodate the harness.

Raw local report is kept outside commits at
`.superpowers/sdd/2026-10-19-camisetas-seo-foundation/seo-http-local-final.json`.
Test/build logs are in the same process directory, not staged. No customer
bodies, actual order IDs or credentials are included in the report.
