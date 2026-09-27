# PerkCommons Next-to-main Promotion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote the PerkCommons Next site, schema-v2 dataset, and existing Supabase backend into the canonical PerkCommons implementation, verify it on Vercel, then promote the exact verified code/data to `main` without changing `perkcommons.com` yet.

**Architecture:** Build a release candidate from `site@next/foundation`, integrate the five main-only Vercel/runtime commits, fix provenance/trust semantics, reconcile and harden the existing Supabase project with one forward migration, verify the schema-v2 data branch, and deploy the exact release candidate to Vercel against the canonical Supabase backend. Promote `data/main` and `site/main` only after fresh local/database/hosted verification succeeds.

**Tech Stack:** Astro 7, TypeScript 6, Vercel Functions, Supabase/PostgreSQL 17, Node test runner/tsx, Playwright, Pagefind, GitHub, schema-v2 JSON dataset.

**Spec:** `docs/superpowers/specs/2026-09-27-next-main-promotion-design.md`

## Global Constraints

- Do not change the `perkcommons.com` DNS/domain attachment during this plan.
- Canonical Supabase project is `fspdxfhijtlebdnftkof`; do not reset or recreate it.
- Preserve existing moderator accounts, retention history, and operational rows.
- Never infer human review from schema version.
- Automated source research remains `needs-human-review` until a real moderator event exists.
- Never expose `SUPABASE_SERVICE_ROLE_KEY` or equivalent server secrets to browser code.
- Keep RLS enabled on exposed-schema tables; server-only tables may remain deny-by-default with no browser policies.
- Do not fabricate human review, legal/business identity, addresses, reviews, partnerships, or reputation.
- Site release candidate must build against an exact data commit SHA before promotion.
- Prefer auditable fast-forward/merge promotion; do not force-update `main` unless there is no safe alternative.
- Every completion claim requires a fresh verification run.

## Review Focus

- A schema-v2 record with `reviewMethod=automated-source-research` must render “human review pending,” never “Reviewed manually.”
- A record with `reviewState=needs-human-review` must never receive a Verified badge or verified export state.
- Server-only Supabase RPCs/tables must remain inaccessible to `anon` and ordinary authenticated roles after hardening.
- Vercel release builds must canonicalize to the Vercel release hostname, never prematurely to `perkcommons.com`.
- Merging main-only Vercel runtime work must not weaken the stronger CSP/security-header baseline already present on `next/foundation`.

---

### Task 1: Create the release branch and integrate the Vercel runtime

**Files:**
- Create branch: `release/next-main-promotion` from `next/foundation`
- Merge/add: `api/index.ts`
- Merge/add: `api/cron/reconcile.ts`
- Merge/add: `middleware.ts`
- Merge/add: `vercel/runtime-compat.ts`
- Merge/add: `vercel/runtime-env.ts`
- Merge/add: `vercel/runtime-globals.d.ts`
- Modify: `vercel.json`
- Modify: `.env.example`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `scripts/fetch-data.mjs`
- Merge/add tests from main: `tests/unit/vercel-config.test.ts`, `worker/tests/runtime-adapters.test.ts`, `worker/tests/vercel-cron.test.ts`, plus other main-only Vercel tests needed by the imported runtime

**Interfaces:**
- Consumes: current `next/foundation` tree and main-only commits `5e59c3d541121428c92d7ef8ae3f5171de752c92`, `3784e3c12b0414daab6947865bff205e41c063d8`, `74348d07039606960944b6e7500baf1581be8536`, `e4678e1607ac301612ac9e7fa436d773f2de8175`, `264c279e34ac628086706e55f8bba377f5ce5659`.
- Produces: one release branch with the Next trust/security work plus the Vercel API/runtime/cron implementation.

- [ ] **Step 1: Create the release branch from the approved spec commit**

Create `release/next-main-promotion` from current `next/foundation`, preserving the spec commit.

- [ ] **Step 2: Integrate the main-only Vercel runtime in chronological order**

Bring in the five main-only commits, resolving conflicts in favor of the newer Next implementation for Trust/About/security/data semantics and in favor of main for Vercel runtime adapters/API routing.

Do not let the old main Trust/About files overwrite the newer Next versions.

- [ ] **Step 3: Resolve `vercel.json` as a union, not a winner-takes-all conflict**

The final config must retain:
- Astro framework/build/output settings and `api/**/*.ts` function duration from main;
- `/api/:path*` rewrite and daily `/api/cron/reconcile` cron from main;
- enforcing CSP, report-only detailed CSP, Referrer-Policy, Permissions-Policy, nosniff, HSTS, and COOP from `next/foundation`.

- [ ] **Step 4: Keep environment defaults fork-safe but promotion-ready**

Ensure `.env.example` documents:
- `PUBLIC_SUPABASE_URL`
- `PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET`
- Turnstile/fingerprint variables
- exact data repository/ref controls
- `PUBLIC_SITE_URL`

Do not commit real values.

- [ ] **Step 5: Run the Vercel/runtime-focused tests**

Run:
`npm ci`
`npm run test:unit`

Expected: PASS with the imported Vercel/runtime tests included.

- [ ] **Step 6: Run static checks**

Run:
`npm run check`

Expected: exit 0.

- [ ] **Step 7: Commit**

Commit message:
`feat(release): integrate Vercel runtime into Next promotion`

---

### Task 2: Make provenance an explicit site model

**Files:**
- Modify: `src/lib/listings.ts`
- Test: `tests/unit/validation.test.ts`
- Test: `tests/unit/publication-v2-integration.test.ts`
- Create: `tests/unit/review-provenance.test.ts`

**Interfaces:**
- Consumes: schema-v1 records and schema-v2 `reviewProvenance`, `classification.reviewState`, availability, evidence, and checked-claim fields.
- Produces: `Listing.editorialReviewState`, `Listing.reviewMethod`, `Listing.reviewState`, and `Listing.verified` derived from source data rather than schema version.

- [ ] **Step 1: Write failing provenance tests**

Add tests asserting:
- `automated-source-research + needs-human-review` => `automated-research-pending-human-review`, `verified=false`;
- manual/human method + reviewedAt + checked claims + evidence + publishable state => `human-reviewed`;
- legacy v1 => `legacy-source-checked`;
- missing/unsupported freshness => `unconfirmed` where appropriate;
- schema v2 alone never implies human review or verification.

- [ ] **Step 2: Run the new tests and confirm failure**

Run:
`npx tsx --test tests/unit/review-provenance.test.ts tests/unit/publication-v2-integration.test.ts`

Expected: FAIL before implementation.

- [ ] **Step 3: Extend the Listing interface and v2 adapter**

Add explicit fields for:
- `reviewMethod: string | null`
- `reviewState: string | null`
- `editorialReviewState: "human-reviewed" | "automated-research-pending-human-review" | "legacy-source-checked" | "unconfirmed"`
- `verified: boolean`

Read `classification.reviewState` and `reviewProvenance.reviewMethod` from schema-v2 records.

- [ ] **Step 4: Implement one pure derivation helper**

Add a deterministic helper in `src/lib/listings.ts` that computes editorial state and Verified eligibility from:
- schema version;
- review method/state;
- reviewed timestamp;
- checked claims;
- evidence URLs;
- availability state;
- freshness/geography fields required by the spec.

Do not use a magic `schemaVersion === "2.0"` shortcut.

- [ ] **Step 5: Re-run provenance tests**

Run:
`npx tsx --test tests/unit/review-provenance.test.ts tests/unit/publication-v2-integration.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

Commit message:
`fix(trust): derive review state from provenance`

---

### Task 3: Fix listing transparency UI and Trust/About claims

**Files:**
- Modify: `src/pages/opportunities/[id].astro`
- Modify: `src/pages/trust.astro`
- Modify: `src/pages/about.astro`
- Modify: `src/layouts/BaseLayout.astro` if it still says “Next experiment”
- Modify: `public/llms.txt`
- Test: `tests/browser-regressions.spec.ts`
- Create: `tests/unit/trust-copy.test.ts`

**Interfaces:**
- Consumes: `Listing.editorialReviewState`, `Listing.verified`, review date/method, checked claims, evidence, next-review date.
- Produces: accurate public wording for human review, automated research, legacy evidence, unconfirmed status, and optional Verified marker.

- [ ] **Step 1: Write failing copy/UI tests**

Tests must assert:
- no static source contains the phrase `Reviewed manually` based only on `isV2`;
- Trust copy does not claim all records are hand reviewed;
- experimental-fork banners are removed from canonical-facing About/layout copy;
- automated research wording explicitly says human review is pending;
- Verified UI is conditional on `listing.verified`.

- [ ] **Step 2: Run the focused tests and confirm failure**

Run:
`npx tsx --test tests/unit/trust-copy.test.ts`

Expected: FAIL.

- [ ] **Step 3: Replace the listing evidence section**

Render by `editorialReviewState`:
- human-reviewed: human-review date + checked claims;
- automated research: automated source check date/method + human review pending;
- legacy: structured-evidence limitation;
- unconfirmed: inability to establish current state.

Keep evidence links and next-review date when present.

- [ ] **Step 4: Add Verified only for the strict derived state**

Use a distinct, accessible label/badge only when `listing.verified === true`. Do not use Verified as a synonym for “source checked.”

- [ ] **Step 5: Rewrite Trust/About canonical wording**

Remove “Next experimental fork” production-facing language.

Replace broad hand-review claims with mixed-state wording:
- automation may research sources;
- humans make human-review/editorial decisions;
- current coverage is disclosed;
- provider terms control final eligibility/availability/outcomes.

- [ ] **Step 6: Re-run focused tests and browser regression tests**

Run:
`npx tsx --test tests/unit/trust-copy.test.ts`
`npm run test:browser`

Expected: PASS, with any environment-dependent Playwright skips documented.

- [ ] **Step 7: Commit**

Commit message:
`fix(trust): present review provenance accurately`

---

### Task 4: Add public methodology/data-quality reporting and improve structured metadata

**Files:**
- Create: `src/pages/data-quality.astro`
- Modify: `src/lib/seo.ts`
- Modify: `src/layouts/BaseLayout.astro`
- Modify: `src/pages/trust.astro`
- Modify: `src/pages/about.astro`
- Test: `tests/unit/seo.test.ts`
- Create: `tests/unit/data-quality-page.test.ts`

**Interfaces:**
- Consumes: checked-in data reports from the fetched data repository, current configured site origin, approved operator/project disclosures.
- Produces: public methodology/quality page and origin-safe Organization/WebSite JSON-LD with GitHub/contact/methodology references.

- [ ] **Step 1: Write failing tests**

Assert:
- data-quality page surfaces report date and factual metrics;
- unmeasured broken-link/redirect data is labeled unmeasured rather than given a fake number;
- JSON-LD uses configured origin;
- JSON-LD links PerkCommons to its GitHub repositories with `sameAs`/related public URLs;
- no LocalBusiness, fake street address, review score, or unsupported legal-company claim exists.

- [ ] **Step 2: Run focused tests and confirm failure**

Run:
`npx tsx --test tests/unit/seo.test.ts tests/unit/data-quality-page.test.ts`

Expected: FAIL for the new behavior.

- [ ] **Step 3: Implement the data-quality page**

Read current report artifacts from the data checkout and render at least:
- total;
- default-search-eligible/excluded;
- availability distribution;
- human-review coverage;
- requires-manual-review count;
- geography completeness;
- structured deadline/application/evidence coverage;
- duplicate candidates;
- broken-link/redirect audit state.

Include the report as-of date.

- [ ] **Step 4: Extend structured data**

Update `baseStructuredData(site)` to remain origin-safe and include only supported public relationships such as project/GitHub/contact/methodology URLs.

- [ ] **Step 5: Link methodology from Trust/About/footer**

Make the page discoverable without making it the primary navigation item unless the existing nav pattern warrants it.

- [ ] **Step 6: Re-run tests**

Run:
`npx tsx --test tests/unit/seo.test.ts tests/unit/data-quality-page.test.ts`
`npm run audit:sinks`

Expected: PASS.

- [ ] **Step 7: Commit**

Commit message:
`feat(trust): publish methodology and data quality`

---

### Task 5: Preserve review provenance through database publication

**Files:**
- Modify: `worker/lib/types.ts`
- Modify: `worker/lib/publication-data.ts`
- Modify: `worker/lib/publication.ts`
- Modify: `worker/routes/moderation.ts`
- Modify: `tests/unit/publication-v2-integration.test.ts`
- Modify: `worker/tests/publication.test.ts`
- Create migration: `supabase/migrations/202609270001_canonical_promotion_reconciliation.sql`

**Interfaces:**
- Consumes: moderator review event, normalized opportunity fields, publication batch payload.
- Produces: published v2 records that retain review method/state/timestamp and cannot falsely appear human-reviewed.

- [ ] **Step 1: Write failing publication tests**

Add assertions that:
- publication payload includes review provenance required by schema-v2 output;
- automated/imported normalized records cannot be serialized with a manual review method unless a real moderator approval event supplies it;
- publication output preserves `needs-human-review` when human review has not happened;
- a human-approved moderation action emits human-review provenance with the real review timestamp.

- [ ] **Step 2: Run publication tests and confirm failure**

Run:
`npx tsx --test tests/unit/publication-v2-integration.test.ts worker/tests/publication.test.ts`

Expected: FAIL.

- [ ] **Step 3: Extend publication payload types**

Add only the fields needed to preserve:
- review method;
- review state;
- reviewed timestamp;
- reviewer/public-safe reviewer reference where appropriate;
- claims checked;
- next review date.

Do not expose private moderator identity unless the existing public-safe model explicitly permits it.

- [ ] **Step 4: Update publication serialization**

Ensure `toPublishedOpportunity` writes correct `reviewProvenance` and `classification.reviewState` based on actual workflow state.

- [ ] **Step 5: Re-run publication tests**

Run:
`npx tsx --test tests/unit/publication-v2-integration.test.ts worker/tests/publication.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit application-side provenance changes**

Commit message:
`fix(publication): preserve human review provenance`

---

### Task 6: Reconcile and harden the canonical Supabase project

**Files:**
- Complete: `supabase/migrations/202609270001_canonical_promotion_reconciliation.sql`
- Modify/create DB contract test: `tests/unit/migration-contract.test.ts`
- Modify/create SQL smoke fixture if needed: `tests/fixtures/greenfield-smoke.sql`
- Update: `NEXT_HANDOFF.md` or a focused DB baseline note documenting hosted migration-history baseline

**Interfaces:**
- Consumes: current hosted schema in project `fspdxfhijtlebdnftkof`.
- Produces: forward-only hardened schema, provenance-capable publication payload, explicit safe grants, covering indexes, and an auditable migration baseline.

- [ ] **Step 1: Snapshot live DB invariants before writes**

Record via read-only SQL:
- moderator profile count and IDs only as needed for preservation checks;
- table row counts;
- functions/security-definer/search-path settings;
- grants to `anon`, `authenticated`, `service_role`;
- RLS state/policies;
- relevant indexes;
- cron job for retention.

Do not export private submission/reporter bodies.

- [ ] **Step 2: Write migration-contract tests first**

The test must assert the new migration contains:
- revoke of `anon/authenticated` execute on `rls_auto_enable`;
- fixed `search_path` for `touch_updated_at` and `bump_submission_revision`;
- service-role-only execution for private mutation RPCs;
- provenance columns/return fields required by Task 5;
- covering indexes for the foreign keys selected from the performance advisor;
- no RLS disable statements on public tables.

- [ ] **Step 3: Run migration-contract tests and confirm failure**

Run:
`npx tsx --test tests/unit/migration-contract.test.ts`

Expected: FAIL until migration is complete.

- [ ] **Step 4: Finish the forward reconciliation migration**

Use `ALTER ... IF EXISTS/IF NOT EXISTS` patterns where appropriate so the hosted state is reconciled rather than rebuilt.

At minimum:
- harden `rls_auto_enable()`;
- fix helper function search paths;
- add provenance fields required by publication;
- update `publication_batch_payload(uuid)` to return them;
- restrict RPC execution;
- add the advisor-backed FK indexes that support moderation/publication integrity operations.

Do not drop existing operational data.

- [ ] **Step 5: Apply the migration to Supabase**

Apply the reviewed migration through the Supabase migration mechanism to project `fspdxfhijtlebdnftkof`.

- [ ] **Step 6: Verify the hosted schema with direct queries**

Confirm:
- moderator profile count is unchanged;
- retention-run history is unchanged except for normal cron activity;
- RLS remains enabled;
- `anon`/`authenticated` cannot execute server-only RPCs;
- service role retains required execution;
- publication payload returns provenance fields;
- second-review and listing-update functions still exist.

- [ ] **Step 7: Re-run Supabase advisors**

Run security and performance advisors.

Expected:
- `rls_auto_enable` public-execution warnings are gone;
- mutable-search-path warnings for the two helper functions are gone;
- selected unindexed-FK findings are gone;
- remaining no-policy findings are documented as intentional deny-by-default if grants/policies confirm that design;
- leaked-password protection is either enabled through supported project settings or recorded as an explicit dashboard follow-up.

- [ ] **Step 8: Re-run migration-contract tests**

Run:
`npx tsx --test tests/unit/migration-contract.test.ts`

Expected: PASS.

- [ ] **Step 9: Commit**

Commit message:
`feat(db): reconcile canonical Supabase backend`

---

### Task 7: Verify and prepare schema-v2 data for canonical promotion

**Files:**
- Data repo branch: `CodWasTaken/data@next/schema-v2`
- Regenerate/update: `reports/data-quality.md`
- Regenerate/update: `reports/availability-research.md`
- Regenerate/update: `reports/availability-research.json`
- Generate/update source audit report if the script writes one
- Create/update deterministic human-review queue report/script only if no suitable existing report already provides one

**Interfaces:**
- Consumes: all 1,068 opportunity/resource records and current provider-source evidence.
- Produces: validated reports, source audit, deterministic human-review priority list, exact verified data SHA.

- [ ] **Step 1: Run clean data checks**

Run in the data repo:
`npm ci`
`npm test`
`npm run coverage`
`npm run reports -- --as-of 2026-09-27`

Expected: PASS and reports regenerate deterministically.

- [ ] **Step 2: Run migration dry-run**

Run:
`npm run migrate:v2`

Expected: no invalid records; do not write migrated v1 records as human-reviewed.

- [ ] **Step 3: Run source audit**

Run:
`npm run audit:sources`

Classify blocked/ambiguous separately from broken according to the existing script/report model.

If network restrictions prevent a complete audit, record the incomplete measurement in the report; do not fabricate a pass.

- [ ] **Step 4: Produce a deterministic human-review queue**

Prioritize:
1. default-search-eligible;
2. selective/materially valuable;
3. open/current;
4. stronger provider-source coverage;
5. active deadlines/application windows.

The queue is work planning, not a review event.

- [ ] **Step 5: Run final data validation**

Run:
`npm test`

Expected: PASS.

- [ ] **Step 6: Commit any regenerated reports/queue changes**

Commit message:
`chore(data): refresh canonical quality reports`

Record the exact resulting data SHA for Vercel pinning.

---

### Task 8: Run the full release-candidate verification locally

**Files:**
- No new product files unless fixes are required.
- Record verification notes in: `docs/releases/2026-09-27-next-main-promotion.md`

**Interfaces:**
- Consumes: release branch + exact data SHA + hardened Supabase project.
- Produces: release evidence sufficient to allow Vercel deployment.

- [ ] **Step 1: Pin the release build to the exact data SHA**

Set the build/test environment so `PERKCOMMONS_DATA_REF` resolves to the exact verified data commit, not a moving branch.

- [ ] **Step 2: Run full site checks**

Run:
`npm ci`
`npm run check`
`npm test`
`npm run build`
`npm run audit:site`
`npm run audit:sinks`
`npm run test:browser`

Expected: all required checks pass; any intentional browser skips are recorded.

- [ ] **Step 3: Verify trust regressions explicitly**

Search/test the built output and source for:
- no false “Reviewed manually” state;
- no Verified badge for automated/needs-human-review fixtures;
- no broad “all records are human reviewed” claim;
- no `perkcommons.com` canonical in the Vercel-release configuration.

- [ ] **Step 4: Verify generated public assets**

Inspect:
- `dist/robots.txt`;
- sitemap;
- JSON-LD;
- opportunity JSON/JSONL/CSV endpoints;
- schema/OpenAPI outputs;
- data-quality page.

Expected: consistent release hostname/origin behavior and correct mixed-schema semantics.

- [ ] **Step 5: Commit release verification note**

The note records:
- site release SHA;
- data SHA;
- Supabase project ref;
- exact commands/results;
- remaining non-blocking advisories;
- explicit statement that `perkcommons.com` has not been changed.

Commit message:
`docs(release): record promotion verification`

---

### Task 9: Create or recover the Vercel project and deploy the exact release candidate

**Files/External configuration:**
- Vercel project under the connected Cod account/team
- Environment variables for Preview/Production as appropriate
- Git integration to `CodWasTaken/site` or direct deployment of the exact release tree

**Interfaces:**
- Consumes: verified release branch/site SHA, exact data SHA, canonical Supabase project.
- Produces: hosted Vercel release URL that does not own `perkcommons.com`.

- [ ] **Step 1: Re-check Vercel team/project visibility**

List teams and projects.

If the expected project is still not visible, reconnect/switch the Vercel plugin to the account/team that owns it or create a new PerkCommons project only after confirming the connected account is the intended owner.

- [ ] **Step 2: Configure non-secret and secret environment values**

Set:
- `PUBLIC_SITE_URL` to the Vercel release hostname;
- Supabase URL/publishable key;
- server-only Supabase service role key;
- `PERKCOMMONS_DATA_REF` to the exact verified data SHA;
- Turnstile/fingerprint values if enabled;
- `CRON_SECRET`;
- GitHub publication/deployment secrets only if those workflows are enabled.

Do not attach `perkcommons.com`.

- [ ] **Step 3: Deploy the exact release candidate**

Deploy the verified site SHA/tree.

Record deployment ID and URL.

- [ ] **Step 4: Inspect build logs**

Expected: successful build with exact data SHA and no hidden fallback to the old data/main state.

- [ ] **Step 5: Run hosted smoke tests**

Verify:
- `/` => 200;
- one listing detail => 200;
- public JSON/API endpoints => expected shape;
- data-quality and Trust/About pages => 200;
- unauthorized cron => 401;
- submission/report route validation works;
- security headers exist;
- canonical/OG/JSON-LD URLs use Vercel hostname;
- no production-domain mutation.

- [ ] **Step 6: Inspect runtime errors/logs**

Check release deployment runtime errors and recent logs after smoke tests.

Expected: no unexplained 5xx cluster.

- [ ] **Step 7: Record hosted verification evidence**

Update the release note with deployment ID/URL, smoke results, and log findings.

---

### Task 10: Promote verified data and site commits to main

**Files/Branches:**
- `CodWasTaken/data@main`
- `CodWasTaken/site@main`
- Preserve prior main SHAs in the release note

**Interfaces:**
- Consumes: exact verified data SHA and site release SHA.
- Produces: canonical `main` branches matching the verified artifacts.

- [ ] **Step 1: Confirm branch ancestry immediately before promotion**

Data:
- `next/schema-v2` must still be ahead of and not behind `main`, or reconcile any newly arrived commits before promotion.

Site:
- confirm no unexpected new `main` commits arrived after the release branch was created.

- [ ] **Step 2: Promote data/main**

Fast-forward `CodWasTaken/data@main` to the exact verified data SHA.

Do not use a later unverified schema-v2 commit.

- [ ] **Step 3: Verify data/main**

Run or inspect the same data test/check suite against the promoted main SHA.

Expected: matches the verified data artifact.

- [ ] **Step 4: Promote site/main**

Use an auditable merge/fast-forward path such that the resulting `main` tree is identical to the verified release-candidate tree.

Do not force-push unless branch topology makes a safe merge impossible and the prior main SHA is already recorded.

- [ ] **Step 5: Verify site/main tree identity**

Compare the promoted `main` tree/commit content to the verified release artifact.

Expected: no unverified file differences.

- [ ] **Step 6: Trigger/inspect the Vercel deployment from canonical main**

If Git integration is enabled, verify the resulting main deployment uses:
- the same Supabase project;
- the same verified data SHA or a deliberately re-verified main data SHA;
- the same release configuration.

- [ ] **Step 7: Run final hosted smoke/log checks**

Repeat the critical hosted checks on the canonical-main Vercel deployment.

Expected: PASS.

- [ ] **Step 8: Mark the promotion release note complete**

Record:
- prior and new site main SHAs;
- prior and new data main SHAs;
- canonical Supabase project;
- Vercel canonical-main deployment ID/URL;
- outstanding non-blocking items;
- explicit statement: `perkcommons.com` is still on the old deployment and domain cutover is a separate later action.

---

### Task 11: Final post-promotion audit without domain cutover

**Files:**
- Update: `docs/releases/2026-09-27-next-main-promotion.md`
- Optionally update: `NEXT_HANDOFF.md` to remove obsolete branch/source-of-truth instructions

**Interfaces:**
- Consumes: canonical main branches, Supabase, Vercel deployment.
- Produces: final evidence that the old audit findings are addressed in the promoted version and a short list of genuinely external/manual follow-ups.

- [ ] **Step 1: Re-run the trust/site-quality audit against the Vercel main deployment**

Check:
- operator/transparency presence;
- verification methodology;
- freshness/geography presentation;
- robots/sitemap/schema;
- canonical metadata;
- provenance wording;
- public data-quality metrics.

- [ ] **Step 2: Separate solved issues from external/manual follow-ups**

External/manual follow-ups may include:
- genuine independent reputation/citations;
- remaining human-review backlog;
- manual Firefox/WebKit/forced-colors/screen-reader/400% zoom passes if not completed during browser work;
- leaked-password protection dashboard toggle if connector tooling cannot change it;
- eventual `perkcommons.com` cutover.

- [ ] **Step 3: Re-run final repository checks**

Site:
`npm test`
`npm run build`

Data:
`npm test`

Expected: PASS on the promoted main branches.

- [ ] **Step 4: Commit final handoff/audit note if changed**

Commit message:
`docs: finalize Next-to-main promotion handoff`

- [ ] **Step 5: Stop before domain cutover**

Do not attach or redirect `perkcommons.com` in this plan. The public-domain cutover begins only after a separate explicit final cutover action.
