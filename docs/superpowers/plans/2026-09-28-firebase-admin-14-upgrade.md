# Firebase Admin 14 Security Upgrade Implementation Plan

> **Documento historico conservado el 12 de octubre de 2026.** No es una
> instruccion de ejecucion ni evidencia de que sus casillas sigan pendientes.
> Consultar la checklist vigente y el indice de conservacion antes de reutilizarlo.
> [Checklist vigente](../../LAUNCH_CHECKLIST.md).


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade `firebase-admin` from `12.7.0` to `14.5.0`, remove the vulnerable Firebase dependency paths reported by `npm audit`, and prove that catalog reads, Firestore writes, order creation, and webhook persistence retain their current contracts.

**Architecture:** Keep the existing modular Admin SDK boundary in `src/lib/firebase-admin.ts` and the existing Firestore adapter in `src/lib/firestore.ts`. The migration changes the dependency tree and declares Node.js 22+ as a runtime requirement; it does not redesign Firestore, catalog, checkout, Stripe, Printful, or order data. Add characterization tests around SDK initialization and the Firestore primitives used by orders/webhooks, then verify a Vercel preview with read-only and rejection-path smoke tests before merging.

**Tech Stack:** Next.js 15.5.26 App Router, React 19, TypeScript, Firebase Admin Node.js SDK 14.5.0, Cloud Firestore client 9.1.x, Node.js 22+, Vitest, ESLint, Vercel.

**Spec:** `docs/SECURITY.md`, section `Dependencias`; `docs/LAUNCH_CHECKLIST.md`, section `Dependencias y seguridad`; [Firebase Admin Node.js release notes](https://firebase.google.com/support/release-notes/admin/node); [Firebase Admin setup requirements](https://firebase.google.com/docs/admin/setup); [Vercel supported Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).

## Global Constraints

- Execute this work from a fresh branch named `codex/firebase-admin-14` based on the latest `origin/main`; do not implement it in the dirty `codex/home-and-products` checkout.
- Preserve the current Firestore collections, document identifiers, field names, data types, order statuses, transaction semantics, and public API response contracts.
- Do not touch PDP, checkout pricing, Stripe configuration, Printful configuration, Firestore security rules, catalog data, or production secrets.
- Do not run catalog sync, create a Checkout Session, submit an order to Printful, or write test documents to production during preview verification.
- Do not add `firebase-tools`, an emulator, dependency overrides, `resolutions`, or `npm audit fix --force` merely to obtain a lower audit count.
- Keep the current modular imports (`firebase-admin/app` and `firebase-admin/firestore`). Firebase Admin 14 removes the legacy namespace API, but this repository does not use that legacy API.
- Treat Node.js 22+ as part of the migration. Firebase Admin 14 officially drops Node.js 18 and 20.
- Do not add real Firebase credentials to fixtures, tests, documentation, commits, terminal output, or the PR description.
- A clean build is not enough: the preview must prove that the deployed runtime can read the real catalog and that protected endpoints still reject unauthenticated requests before external work.
- Do not stage or commit `docs/superpowers/` or other process artifacts unless the user explicitly asks to version them.
- `docs/LAUNCH_CHECKLIST.md` is currently an untracked local operations file, not part of `origin/main`. Preserve and update that local checklist after verification, but do not copy or stage it into this dependency PR unless the user separately authorizes versioning it.

## Review Focus

- `getDb()` still initializes one default Firebase app, converts escaped private-key newlines, configures `ignoreUndefinedProperties`, and reuses the Firestore client across warm Next.js runtimes.
- `FieldValue.increment()`, `FieldValue.delete()`, `FieldValue.serverTimestamp()`, and `Timestamp.now()` still reach the same order and webhook write paths after the transitive Firestore client upgrade.
- `createOrder()` still writes the draft before Stripe Checkout is created; the dependency migration must not reorder that flow.
- Stripe and Printful webhook idempotency still uses the existing `webhookEvents` transaction and status fields.
- Vercel builds and server functions run on Node.js 22 or newer. A preview using Node.js 20 is a hard blocker.
- `npm audit --omit=dev` no longer lists the old Firebase chain (`firebase-admin`, `@google-cloud/firestore`, `@google-cloud/storage`, `google-gax`, `retry-request`, `teeny-request`, or the old `uuid` path) as vulnerable. Any unrelated Next.js/PostCSS/Sharp/Nano ID findings remain separate work and must be documented honestly.
- No unexpected changes appear in `src/lib/firebase-admin.ts`, `src/lib/firestore.ts`, `src/lib/order-service.ts`, API routes, product data, or lockfile packages unrelated to the upgrade.

---

## Current Compatibility Findings

- The repository currently installs `firebase-admin@12.7.0`, `@google-cloud/firestore@7.11.6`, and `@google-cloud/storage@7.21.0`.
- The current application imports only modular entry points:
  - `cert`, `getApps`, and `initializeApp` from `firebase-admin/app`.
  - `Firestore`, `getFirestore`, `FieldValue`, and `Timestamp` from `firebase-admin/firestore`.
- Firebase Admin `14.0.0` removed the legacy namespace API and requires Node.js 22+. The current code is already modular, so no source migration is expected.
- Firebase Admin `14.4.0` moved its Firestore dependency to `9.1.0`; `14.5.0` is the current audited target and also uses Cloud Storage `8.1.0`.
- The local development runtime observed during planning is Node.js `24.15.0`, which satisfies the new requirement. The Vercel project setting still needs to be verified from the preview build/runtime.

## File Structure

| File | Responsibility |
| --- | --- |
| `package.json` | Upgrade `firebase-admin`, declare Node.js 22+, and include the new initialization test in the canonical test command. |
| `package-lock.json` | Lock the reviewed Firebase Admin 14.5.0 dependency tree. |
| `src/lib/firebase-admin.test.ts` | Characterize credential construction, newline normalization, default-app reuse, Firestore settings, and warm-runtime caching. |
| `src/lib/firestore.test.ts` | Extend coverage to the order and webhook write primitives that use `FieldValue` and `Timestamp`. |
| `README.md` | Document Node.js 22+ as the supported local and deployment runtime. |
| `docs/SECURITY.md` | Record the completed Firebase migration and separate any residual audit findings. |
| `docs/LAUNCH_CHECKLIST.md` | Local operations checklist: mark the Firebase task complete only after audit, full verification, preview smoke, and PR evidence exist; keep it outside this PR unless separately authorized. |

### Task 1: Isolate the migration and record the true baseline

**Files:**
- No application files changed in this task.

- [ ] **Step 1: Refresh Git refs without touching the existing dirty checkout**

Run from the existing checkout:

```powershell
git fetch origin
git status --short --branch
git log -1 --oneline origin/main
```

Expected: the current untracked documentation remains untouched, and `origin/main` contains the previously merged Next.js security update.

- [ ] **Step 2: Create an isolated worktree and branch**

Use `superpowers:using-git-worktrees`. Prefer this path if it is free:

```powershell
git worktree add C:\Users\USUARIO\Downloads\tienda_online_camisetas-firebase-admin -b codex/firebase-admin-14 origin/main
```

If the path or branch already exists, inspect it before choosing a different explicit path; do not delete or overwrite it.

- [ ] **Step 3: Install exactly the baseline lockfile**

Run inside the new worktree:

```powershell
npm.cmd ci
node --version
npm.cmd ls firebase-admin @google-cloud/firestore @google-cloud/storage
```

Expected before the upgrade:

- Node is `v22` or newer.
- `firebase-admin@12.7.0` is installed from the current `main` lockfile.
- Firestore is `7.11.6` and Storage is `7.21.0`.

- [ ] **Step 4: Capture the security failure that motivates the change**

Run:

```powershell
npm.cmd audit --omit=dev
```

Expected: non-zero exit; the report includes `firebase-admin` and its vulnerable transitive paths, and recommends `firebase-admin@14.5.0` as a semver-major fix. Save only the package names/counts for the PR; do not paste environment values.

- [ ] **Step 5: Prove `main` is otherwise green before migration**

Run:

```powershell
npm.cmd test
npm.cmd run lint
npx.cmd tsc --noEmit --incremental false
npm.cmd run build
```

Expected: all four commands pass. If any fail before the dependency change, stop and report the pre-existing failure rather than attributing it to Firebase Admin 14.

### Task 2: Add SDK and Firestore characterization coverage

**Files:**
- Create: `src/lib/firebase-admin.test.ts`
- Modify: `src/lib/firestore.test.ts`
- Modify: `package.json`

These are characterization tests: they are expected to pass on v12 first and then remain green on v14. The red security signal is the audit result captured in Task 1.

- [ ] **Step 1: Add the Firebase Admin initialization test to the canonical suite**

Add `src/lib/firebase-admin.test.ts` beside `src/lib/firestore.test.ts` in the `test` script. Do not replace the explicit test list with a broad glob in this security PR.

- [ ] **Step 2: Test credential normalization and single initialization**

Create `src/lib/firebase-admin.test.ts` with hoisted Vitest mocks for:

- `cert`, `getApps`, and `initializeApp` from `firebase-admin/app`.
- `getFirestore` from `firebase-admin/firestore`.
- `requiredEnv` from `./env`.

Reset modules and delete the test-only `globalThis.firestoreDb` property before each test. Use placeholder values only:

```ts
const values = {
  FIREBASE_PROJECT_ID: "test-project",
  FIREBASE_CLIENT_EMAIL: "firebase-admin@example.test",
  FIREBASE_PRIVATE_KEY: "line-one\\nline-two"
};
```

The first test must call `getDb()` twice and assert:

```ts
expect(cert).toHaveBeenCalledWith({
  projectId: "test-project",
  clientEmail: "firebase-admin@example.test",
  privateKey: "line-one\nline-two"
});
expect(initializeApp).toHaveBeenCalledOnce();
expect(getFirestore).toHaveBeenCalledOnce();
expect(settings).toHaveBeenCalledWith({ ignoreUndefinedProperties: true });
expect(secondResult).toBe(firstResult);
```

- [ ] **Step 3: Test reuse of an already initialized default app**

Set `getApps()` to return one placeholder app, call `getDb()`, and assert that `initializeApp()` is not called while `getFirestore()` and `settings()` still are. This protects serverless warm-start behavior across the major upgrade.

- [ ] **Step 4: Extend Firestore tests to cover writes and webhook transforms**

Extend the existing mocked database in `src/lib/firestore.test.ts` with document `set`, `runTransaction`, transaction `get`, and transaction `set` spies. Add tests that prove:

1. `createOrder(order)` writes the exact order to `orders/{order.id}`.
2. `beginWebhookEventProcessing("stripe", eventId, payload)` returns `true` for a missing event and writes:
   - `status: "processing"`
   - `attempts` from `FieldValue.increment(1)`
   - `updatedAt` from `Timestamp.now()`
   - `{ merge: true }`
3. A webhook event already marked `processed` returns `false` and is not written again.
4. `createSyncRun()` uses `FieldValue.serverTimestamp()` and the `syncRuns` collection.

Use the actual installed `FieldValue` and `Timestamp` exports while mocking only `getDb()`. Do not connect to Firebase.

- [ ] **Step 5: Run the characterization suite on Firebase Admin 12**

Run:

```powershell
npx.cmd vitest run --environment node --testTimeout 15000 src/lib/firebase-admin.test.ts src/lib/firestore.test.ts src/lib/order-service.test.ts src/lib/printful-webhook-route.test.ts
```

Expected: PASS before changing the dependency. If a test fails, correct the test double so it reflects the existing contract; do not change production behavior to satisfy a faulty characterization test.

- [ ] **Step 6: Inspect the focused diff**

Run:

```powershell
git diff --check -- package.json src/lib/firebase-admin.test.ts src/lib/firestore.test.ts
git diff -- package.json src/lib/firebase-admin.test.ts src/lib/firestore.test.ts
```

Expected: no production code change and no secret-like value.

### Task 3: Declare the runtime contract and upgrade Firebase Admin

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Declare Node.js 22+ in `package.json`**

Add this top-level field:

```json
"engines": {
  "node": ">=22"
}
```

Use `>=22`, not `22.x`, because the developer machine currently runs Node 24 and Firebase Admin supports Node 22 or newer.

- [ ] **Step 2: Install the reviewed Firebase Admin release without forcing unrelated upgrades**

Run:

```powershell
npm.cmd install firebase-admin@14.5.0 --save
```

Expected:

- `package.json` contains `"firebase-admin": "^14.5.0"`.
- `package-lock.json` resolves `firebase-admin` to `14.5.0`.
- Its optional Firestore dependency resolves to `9.1.x` and Storage to `8.1.x`.
- No `--force`, override, or unrelated direct dependency upgrade is introduced.

- [ ] **Step 3: Inspect the resolved tree**

Run:

```powershell
npm.cmd ls firebase-admin @google-cloud/firestore @google-cloud/storage google-gax uuid
git diff -- package.json package-lock.json
```

Expected: the diff is limited to the Node engine, Firebase Admin version, and its lockfile dependency graph. Investigate any unrelated direct-package change before continuing.

- [ ] **Step 4: Smoke-test the modular runtime exports**

Run:

```powershell
node -e "const app=require('firebase-admin/app'); const fs=require('firebase-admin/firestore'); if (![app.initializeApp, app.cert, app.getApps, fs.getFirestore, fs.FieldValue, fs.Timestamp].every(Boolean)) process.exit(1)"
```

Expected: exit code `0` with no output.

- [ ] **Step 5: Run the focused compatibility tests on Firebase Admin 14**

Run:

```powershell
npx.cmd vitest run --environment node --testTimeout 15000 src/lib/firebase-admin.test.ts src/lib/firestore.test.ts src/lib/order-service.test.ts src/lib/printful-webhook-route.test.ts
```

Expected: PASS with the same behavior established on v12.

- [ ] **Step 6: Confirm the vulnerable Firebase paths are gone**

Run:

```powershell
npm.cmd audit --omit=dev
```

Expected:

- The audit may still exit non-zero because unrelated Next.js/PostCSS/Sharp/Nano ID findings are separate roadmap items.
- It must not list the old Firebase Admin/Firestore/Storage/Google GAX/retry-request/teeny-request/UUID path as vulnerable.
- If npm still attributes one of those findings to `firebase-admin@14.5.0`, stop and diagnose the resolved tree. Do not use `npm audit fix --force`.

### Task 4: Verify all server flows without production writes

**Files:**
- No planned production source change.

- [ ] **Step 1: Run every existing behavioral test**

Run:

```powershell
npm.cmd test
```

Expected: PASS, including catalog, Firestore, order service, Stripe/Printful webhook, shipping, email, and storefront suites.

- [ ] **Step 2: Compile and build the real Next.js server graph**

Run:

```powershell
npm.cmd run lint
npx.cmd tsc --noEmit --incremental false
npm.cmd run build
```

Expected: PASS. The build must successfully bundle/import:

- Dynamic catalog API and pages that read Firestore.
- Checkout and order service code that imports `FieldValue`.
- Stripe and Printful webhook routes.
- Admin order and catalog-sync routes.

- [ ] **Step 3: Handle any incompatibility with evidence**

If a test, typecheck, or build fails after the upgrade:

1. Use `superpowers:systematic-debugging`.
2. Reproduce the failure with one focused command.
3. Compare it against the Firebase 14 release notes and the resolved package tree.
4. Change `src/lib/firebase-admin.ts` or `src/lib/firestore.ts` only if the failure proves a real API incompatibility.
5. Add a failing regression test before any production-code fix.
6. Re-run Tasks 3 and 4.

Do not make speculative initialization changes. The current modular code is expected to remain valid.

- [ ] **Step 4: Check the complete patch for scope and secrets**

Run:

```powershell
git diff --check
git status --short
git diff --stat
git diff -- package.json package-lock.json src/lib/firebase-admin.test.ts src/lib/firestore.test.ts README.md docs/SECURITY.md
```

Expected: only the planned files are modified, with no credentials, test orders, generated build output, or unrelated storefront changes.

### Task 5: Document the supported runtime and verified security state

**Files:**
- Modify: `README.md`
- Modify: `docs/SECURITY.md`
- Update locally after verification: `docs/LAUNCH_CHECKLIST.md` (not part of the feature branch unless separately authorized)

- [ ] **Step 1: Document Node.js 22+ in the README**

Add Node.js 22 or newer to the local/deployment prerequisites. Do not claim a specific Vercel runtime until the preview build confirms it.

- [ ] **Step 2: Update `docs/SECURITY.md` from the actual audit output**

Replace the Firebase Admin pending-upgrade statement with verified facts:

- Firebase Admin is `14.5.0`.
- Node.js 22+ is required.
- The old vulnerable Firebase transitive paths no longer appear in `npm audit --omit=dev`.
- Any remaining findings are listed separately by actual package and severity; do not reuse old counts if the new audit differs.

- [ ] **Step 3: Update the local launch checklist only after code verification**

In `docs/LAUNCH_CHECKLIST.md`:

- Mark the Firebase Admin migration complete only after Tasks 3 and 4 pass.
- Record the exact audit counts and date.
- Leave preview/runtime verification unchecked until Task 6 succeeds.
- Add the PR URL as evidence once the PR exists.
- Keep this untracked local file out of the feature-branch commits unless the user separately asks to add it to Git.

- [ ] **Step 4: Re-run documentation and full verification checks**

Run:

```powershell
git diff --check -- README.md docs/SECURITY.md
npm.cmd test
npm.cmd run lint
npx.cmd tsc --noEmit --incremental false
npm.cmd run build
npm.cmd audit --omit=dev
```

Expected: all required quality commands pass; audit matches the documented residual state, even if unrelated advisories keep its exit code non-zero.

### Task 6: Open a PR and verify the Vercel preview safely

**Files:**
- No additional source file planned.

- [ ] **Step 1: Commit in two reviewable units**

Stage only the planned paths. Suggested commits:

```powershell
git add package.json package-lock.json src/lib/firebase-admin.test.ts src/lib/firestore.test.ts README.md
git commit -m "chore: upgrade firebase admin to v14"

git add docs/SECURITY.md
git commit -m "docs: record firebase admin security upgrade"
```

Do not add `docs/superpowers/`, the untracked local `docs/LAUNCH_CHECKLIST.md`, or unrelated files.

- [ ] **Step 2: Request security-focused code review before pushing**

Use `superpowers:requesting-code-review`. Review against this plan with special attention to:

- Node runtime compatibility.
- Firebase initialization and warm-runtime caching.
- Order and webhook write semantics.
- Lockfile scope.
- Honest audit documentation.

Address valid findings with `superpowers:receiving-code-review`, then rerun the focused and full verification commands.

- [ ] **Step 3: Push the feature branch and create the PR**

Run:

```powershell
git push -u origin codex/firebase-admin-14
```

Create a PR against `main` titled:

```text
Upgrade Firebase Admin to v14
```

The PR body must include:

- Before/after Firebase package versions.
- Node.js 22+ requirement.
- Baseline and final audit summaries.
- Focused and full verification commands/results.
- Explicit statement that no production Firestore writes, Stripe Checkout Sessions, or Printful orders were created during verification.

After creating the PR, attach it to the task with the Codex artifact tool.

- [ ] **Step 4: Verify the preview runtime**

From Vercel preview build logs or Project Settings, confirm that builds and functions use Node.js 22.x or 24.x. If Vercel still uses Node.js 20, change the project Node.js setting to 22.x or 24.x and redeploy; do not merge while Node 20 is active.

- [ ] **Step 5: Run read-only preview smoke checks**

With the preview environment configured with its existing Firebase credentials:

1. `GET /api/catalog` returns `200` and the real public product list.
2. `/`, `/products`, and one mapped `/products/{slug}` route render without a Firebase initialization error.
3. `GET /api/admin/orders` without credentials returns `401`.
4. `POST /api/catalog/sync` without credentials returns `401` before contacting Printful or Firestore.
5. `POST /api/webhooks/printful` without the webhook secret returns `401` before reading/processing a body.
6. `POST /api/checkout` with an invalid empty payload returns `400` and creates no Firestore order or Stripe session.

Do not use valid admin/webhook credentials and do not submit a valid checkout in this migration PR.

- [ ] **Step 6: Record preview evidence and finish the branch**

Update the local checklist with the preview evidence and PR URL without staging it, rerun `git diff --check`, and use `superpowers:finishing-a-development-branch`.

Merge only after:

- All required commands pass.
- The audit no longer contains the old Firebase dependency path.
- Node.js 22+ is confirmed in preview.
- Read-only/rejection-path smoke tests pass.
- The PR review has no unresolved high-risk finding.

### Task 7: Post-merge verification and rollback boundary

**Files:**
- No planned code changes.

- [ ] **Step 1: Confirm production deployed the merge commit on Node.js 22+**

Verify the production deployment commit and runtime from Vercel. A successful GitHub merge alone is not deployment evidence.

- [ ] **Step 2: Run the same non-mutating production smoke checks**

Repeat the public catalog/page reads and unauthenticated rejection checks from Task 6. Do not run checkout, catalog sync, admin writes, or webhook processing as part of this dependency migration.

- [ ] **Step 3: Monitor the first production window**

Check Vercel function logs for new Firebase initialization, credential parsing, Firestore transport, or Node runtime errors. Do not log secret values or full private-key-related errors.

- [ ] **Step 4: Use a narrow rollback if production reads regress**

If the deployment introduces a reproducible Firebase regression, revert the migration PR as one unit and redeploy the last known-good `main`. Do not manually downgrade only the lockfile or bypass the Node requirement. Preserve the failing evidence for a follow-up plan.
