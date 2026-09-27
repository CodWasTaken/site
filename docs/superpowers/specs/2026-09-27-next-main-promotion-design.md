# PerkCommons Next-to-main promotion design

Date: 2026-09-27  
Status: approved design, pending user review before implementation planning  
Canonical site source today: `CodWasTaken/site@next/foundation`  
Canonical data source today: `CodWasTaken/data@next/schema-v2`  
Canonical Supabase project: `perkcommons-next-isolated-dev` (`fspdxfhijtlebdnftkof`)  
Initial web release target: Vercel  
Public-domain cutover target: `perkcommons.com`, only after the Vercel release candidate is verified

## 1. Purpose

Promote the current PerkCommons Next implementation into the canonical PerkCommons codebase and backend without prematurely changing the public domain.

The promotion must:

- make the Next site and schema-v2 data model the canonical implementation;
- retain the useful Vercel runtime work that exists only on `site@main`;
- treat Supabase project `fspdxfhijtlebdnftkof` as the main PerkCommons backend going forward;
- fix the trust/provenance mismatch where schema-v2 records can be presented as manually reviewed even when the underlying provenance is automated research or still needs human review;
- harden database permissions and known security findings without opening private moderation tables to browser access;
- preserve existing moderator identity, retention history, and operational rows in Supabase;
- deploy and test the promoted system on Vercel first;
- promote the exact verified release candidate to GitHub `main`;
- keep `perkcommons.com` on the old deployment until a separate final cutover after production-equivalent verification.

This project does not fabricate human review, reputation, legal identity, business registration, physical addresses, testimonials, partnerships, or other trust signals that do not exist.

## 2. Current baseline

### 2.1 Site branches

`CodWasTaken/site@next/foundation` and `CodWasTaken/site@main` have diverged.

- `next/foundation` is 87 commits ahead of the merge base and contains the substantive Next implementation: mixed schema support, trust/transparency pages, data-quality tooling, security hardening, moderation workflows, generated public data APIs, schema v2 consumption, and hosted test work.
- `main` is 5 commits ahead of the merge base and contains Vercel-specific runtime/deployment work that is not fully present in `next/foundation`: Vercel serverless API routing, runtime compatibility/environment adapters, reconciliation cron, and related configuration/tests.

A direct force move of `main` would risk discarding useful Vercel work. A blind merge would also preserve obsolete Next/fork wording and may reintroduce conflicting deployment assumptions.

### 2.2 Data branches

`CodWasTaken/data@next/schema-v2` is 8 commits ahead of `data@main` and 0 commits behind. It can therefore be promoted by fast-forward after verification.

The schema-v2 branch currently contains:

- 1,068 mixed-schema records;
- 779 default-search-eligible records;
- 289 explicit non-opportunity/resource exclusions from default discovery;
- availability research and source snapshots;
- migration and quality reports;
- AI-assisted source research labels that explicitly remain `needs-human-review`;
- no basis for representing the catalogue as broadly human-verified.

### 2.3 Supabase

The connected project `perkcommons-next-isolated-dev` is healthy on PostgreSQL 17 and already contains the substantive Next moderation/publication schema:

- `opportunity_submissions`;
- `normalized_opportunities`;
- `moderator_profiles`;
- moderation actions, flags, bans, and listing reports;
- listing moderation/removal state;
- publication batches and batch items;
- listing update workflow columns;
- second-review/concurrency columns;
- moderation-retention history and cron.

The project has no recorded Supabase migration history even though the live schema reflects the repository migration chain. Therefore, old migrations must not be replayed blindly.

Current security-advisor findings include:

- `rls_auto_enable()` is a `SECURITY DEFINER` function callable by `anon` and `authenticated`;
- `touch_updated_at()` and `bump_submission_revision()` have mutable function search paths;
- 13 public tables have RLS enabled with no policies;
- 14 foreign keys lack covering indexes;
- leaked-password protection is disabled at the Auth configuration level.

The no-policy findings are not automatically bugs: most moderation tables are intended to be server-only. The promotion must preserve deny-by-default behavior unless a table is explicitly designed for browser access.

### 2.4 Trust/provenance mismatch

The current listing detail template treats `schemaVersion === "2.0"` as sufficient to render:

> Reviewed manually on [date]

That is incorrect for data records whose provenance says `automated-source-research` or whose review state is `needs-human-review`.

The public trust page also states broadly that records are checked by hand. That wording must be scoped to records that have actually completed human moderation.

## 3. Chosen promotion architecture

The promotion uses a release-candidate model.

### 3.1 Release candidate

Create a temporary site branch:

`release/next-main-promotion`

from `site@next/foundation`.

Integrate the useful main-only Vercel runtime work into this branch in focused commits rather than replacing the branch wholesale.

The release branch is the only place where promotion changes are assembled until verification is complete.

### 3.2 Source-of-truth transition

During implementation:

- Site source of truth: `release/next-main-promotion`.
- Data source of truth: `data@next/schema-v2`.
- Backend source of truth: Supabase project `fspdxfhijtlebdnftkof`.
- Web deployment: a Vercel project/preview linked to the release branch.

After verification:

- fast-forward or merge `data/main` to the verified schema-v2 commit;
- promote the verified site release commit to `site/main`;
- update branch references and public wording so there is no longer a public “Next experimental fork” distinction;
- keep the old public `perkcommons.com` deployment unchanged until final cutover.

### 3.3 No destructive database rebuild

Do not reset the canonical Supabase project and do not apply the greenfield migration over the existing database.

Instead:

1. inspect the live schema, functions, grants, policies, triggers, cron jobs, and indexes;
2. compare them to the repository migration intent;
3. create one forward reconciliation migration for the canonical project;
4. apply the forward migration;
5. verify behavior and security advisors;
6. commit the resulting migration to the site repository.

Existing moderator accounts, retention logs, and operational rows must be preserved.

## 4. Provenance and verification model

### 4.1 Separate review dimensions

The public site must stop inferring review state from schema version.

Each listing will expose an explicit derived editorial state based on real provenance:

- `human-reviewed`
- `automated-research-pending-human-review`
- `legacy-source-checked`
- `unconfirmed`

The exact labels shown in UI may be friendlier, but their meaning must remain distinct.

### 4.2 Human-reviewed criteria

A record can be represented as human reviewed only when all of the following are true:

- a real human moderation event exists;
- the review method is explicitly human/manual, not automated source research;
- a review timestamp exists;
- the record is not currently marked `needs-human-review`;
- checked claims are recorded;
- at least one suitable evidence/source URL exists;
- current publication state is not disputed, archived, expired, or suppressed;
- no pending editorial condition makes the review claim misleading.

The implementation must not backfill these facts from automation.

### 4.3 Verified state

“Verified” is a stricter optional state, not a synonym for schema v2.

A listing may display a Verified marker only when:

- it qualifies as human reviewed;
- the public claims being presented have corresponding checked-claim entries;
- evidence URLs are present and valid enough for publication;
- the availability/current-status state has been reviewed;
- geography/eligibility fields required for the listing are not materially unresolved;
- a next-review date or freshness policy is available when the record type requires one;
- no open dispute/removal condition exists.

If those conditions are not met, the site uses accurate descriptive status rather than “Verified.”

### 4.4 UI wording

Examples:

**Human-reviewed**
“Human-reviewed on 14 Sep 2026. Checked claims: eligibility, deadline, application URL.”

**Automated research**
“Provider sources were checked automatically on 14 Sep 2026. Human editorial review is still pending.”

**Legacy**
“This legacy record cites overview evidence checked on 14 Sep 2026. Separate structured evidence is not yet complete.”

**Unconfirmed**
“Current availability could not be established from the available provider sources.”

No UI path may show “Reviewed manually” merely because `schemaVersion === "2.0"`.

## 5. Trust and transparency surface

### 5.1 About and Trust pages

Remove language describing the promoted release as an experimental fork once the release candidate is approved for canonical use.

Keep the following explicit:

- PerkCommons is open source;
- operator identity and location claims must match the already-approved public project disclosures;
- ordinary listings are not pay-to-verify;
- automated research and human moderation are separate;
- provider-source checking is not a guarantee of eligibility, safety, acceptance, or future availability;
- current dataset-quality limitations are published rather than hidden.

The broad statement “Records are checked by hand” must be replaced with wording that reflects mixed review states.

### 5.2 Data-quality page

Expose a public data-quality/methodology surface generated from current data reports. It should show factual aggregate metrics such as:

- total records;
- default-search-eligible records;
- records excluded as resources/non-opportunities;
- availability-state distribution;
- human-review coverage;
- records still requiring human review;
- geography completeness;
- application/deadline/evidence coverage;
- duplicate candidates;
- broken-link/redirect audit status.

The page must identify the report date and must not imply a metric is measured when it is not.

### 5.3 Structured metadata

Improve JSON-LD to describe the actual site and operator relationship without inventing unsupported corporate identity.

At minimum:

- Organization/WebSite relationship;
- canonical site origin;
- operator/project relationship;
- GitHub `sameAs` links where appropriate;
- contact/methodology links where public;
- global online service framing and Poland-based operation where already publicly documented.

No fake local-business schema, street address, legal company name, or review score is added.

## 6. Canonical Supabase backend

### 6.1 Access model

Browser-facing code may use only the publishable Supabase key.

The service-role key stays server-side in Vercel runtime environment variables.

Moderation, publication, removal, batch reconciliation, listing updates, and private workflow operations remain server-only.

Tables intended to be server-only may intentionally have RLS enabled with no browser policy. The implementation should prefer explicit privilege revocation where useful rather than adding broad policies solely to silence an advisor.

### 6.2 Security hardening

The reconciliation migration must:

- revoke `anon` and `authenticated` execution on `public.rls_auto_enable()`;
- review whether the event-trigger helper should remain in `public` or move to a private schema;
- set safe explicit `search_path` values for trigger/helper functions including `touch_updated_at()` and `bump_submission_revision()`;
- confirm every `SECURITY DEFINER` function has a fixed safe search path;
- keep server-only RPCs executable only by `service_role`;
- add covering indexes for foreign keys used by moderation/publication paths when they materially improve integrity-operation performance;
- retain RLS on every exposed public-schema table;
- inspect grants so no private moderation table becomes directly readable/writable by `anon` or normal authenticated users.

Leaked-password protection is an Auth project setting rather than a schema change. Enable it if the connected project/account supports the setting through available tooling; otherwise leave it as an explicit dashboard follow-up rather than pretending SQL changed it.

### 6.3 Publication semantics

Publication cannot convert automated research into human review.

The canonical database/publication payload must preserve sufficient provenance to distinguish:

- source research method;
- human reviewer event;
- review timestamp;
- claims checked;
- next review date;
- outstanding human-review requirement.

If the current normalized tables cannot represent this safely, add the minimum columns/tables necessary in the forward reconciliation migration.

### 6.4 Migration history

Because the live schema predates recorded migration history:

- do not retroactively re-run historical DDL;
- keep the historical migration files for repository history;
- add a canonical reconciliation migration that is idempotent where practical;
- record the migration through the supported Supabase migration mechanism only after live verification;
- document the baseline relationship so a future engineer knows why the hosted migration history begins later than the repository's old incremental files.

## 7. Vercel integration

### 7.1 Runtime

Retain the main-only Vercel runtime architecture:

- Astro static build;
- `api/index.ts` as the same-origin API entry;
- Vercel runtime compatibility/environment adapters;
- protected reconciliation cron;
- Vercel rewrites for `/api/*`;
- daily reconciliation schedule compatible with the current plan limits.

Merge this runtime with the newer security headers and site-quality work from `next/foundation`.

### 7.2 Environment configuration

The Vercel project will use:

Public/build-time:
- `PUBLIC_SUPABASE_URL`
- `PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `PUBLIC_TURNSTILE_SITE_KEY` when submission protection is enabled
- `PUBLIC_SITE_URL` set to the Vercel canonical hostname during release-candidate testing

Server-only:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TURNSTILE_SECRET_KEY`
- `SUBMISSION_FINGERPRINT_SECRET`
- GitHub publication/deployment credentials only when the corresponding automated workflow is enabled
- `CRON_SECRET`

Data build:
- `PERKCOMMONS_DATA_REPOSITORY=https://github.com/CodWasTaken/data.git`
- `PERKCOMMONS_DATA_REF` pinned to the exact verified data commit for release validation

No secret value is committed to GitHub.

### 7.3 Vercel project discovery

The currently connected Vercel team reports zero visible projects. Implementation must first locate or create the correct PerkCommons Vercel project once the user's account/team scope is available.

Do not connect `perkcommons.com` during the release-candidate stage.

## 8. Data promotion and human-review backlog

### 8.1 Data main

After schema-v2 verification, fast-forward `CodWasTaken/data@main` to the verified `next/schema-v2` commit.

The release candidate must build against an exact data SHA before branch promotion.

### 8.2 Human-review prioritization

Do not attempt to fabricate 772 human reviews.

Generate a deterministic review queue that prioritizes:

1. default-search-eligible records;
2. materially valuable/selective opportunities;
3. records with current/open availability;
4. records with stronger provider-source coverage;
5. records with deadlines/current application windows;
6. records receiving user traffic/reports when those signals become available.

Automation may collect evidence and suggest fields. Only a real moderator action can satisfy human-review provenance.

### 8.3 Broken-link and redirect quality

Run a repeatable network audit that distinguishes:

- successful canonical URL;
- redirect;
- redirect chain;
- broken response;
- blocked/bot-protected source;
- ambiguous destination.

Do not collapse blocked or ambiguous responses into “broken.”

## 9. Branch and repository promotion

### 9.1 Site

The release branch starts from `next/foundation`.

Main-only Vercel commits are integrated in dependency order, resolving conflicts in favor of:

- Next trust/provenance correctness;
- Vercel runtime compatibility;
- current security headers;
- canonical rather than “experimental fork” wording.

After release verification, `site/main` must point to a commit that is exactly the verified release artifact or a merge commit whose tree is identical to it.

Do not force-update `main` unless necessary; prefer an auditable merge/fast-forward path.

### 9.2 Data

Because `next/schema-v2` is strictly ahead of `data/main`, promote by fast-forward once tests pass.

### 9.3 Docs/branding

Do not block the site promotion on unrelated documentation/branding branch cleanup. Update only references required to stop published pages from describing the canonical version as an experimental fork. Broader repository consolidation can happen separately.

## 10. Verification gates

The release candidate is not promotable until all applicable checks pass on fresh runs.

### 10.1 Site checks

- clean dependency install;
- Astro/TypeScript check;
- unit tests;
- worker/runtime tests;
- production build;
- browser regression suite;
- site-quality/security audit;
- dangerous-sink/XSS regression audit;
- SEO canonical-origin tests;
- Vercel runtime/config tests.

### 10.2 Data checks

- clean dependency install;
- data validation/check;
- unit tests;
- schema-v2 migration dry run;
- reports regeneration;
- exact counts reconcile with checked-in reports;
- broken-link/redirect audit report generated;
- no record is automatically relabeled as human-reviewed.

### 10.3 Database checks

- forward reconciliation migration applies successfully;
- moderator account remains present;
- retention cron remains active;
- public tables retain RLS;
- server-only tables/RPCs are inaccessible to browser roles;
- service-role moderation RPCs still work;
- second-review rules still reject same-reviewer completion;
- listing-update workflow works;
- publication payload preserves provenance;
- security advisor is rerun and all remaining warnings are either fixed or explicitly documented;
- performance advisor is rerun after index work.

### 10.4 Hosted Vercel checks

On the exact release deployment:

- homepage returns 200;
- opportunity detail returns 200;
- catalogue/public API endpoints return expected schema;
- submission/report API behavior works with configured protection;
- moderator authentication/workflow works;
- publication/reconciliation endpoint rejects unauthorized requests;
- authorized cron path reconciles safely;
- security headers are present;
- canonical/OG/schema URLs use the Vercel release hostname, not `perkcommons.com`;
- no production-domain mutation occurs;
- runtime logs show no unexplained 5xx errors during smoke tests.

### 10.5 Trust-specific regression tests

Tests must fail if:

- schema v2 alone causes “Reviewed manually” text;
- automated-source-research is displayed as human review;
- `needs-human-review` receives a Verified badge;
- a record with no human-review event is exported as verified;
- public Trust/About copy claims all records are human reviewed;
- structured metadata claims unsupported operator/business facts.

## 11. Rollback

Before site-main promotion:

- keep the existing public deployment unchanged;
- keep `next/foundation` and the release branch available;
- record the exact verified site and data SHAs;
- preserve the prior `main` SHA.

If the Vercel release candidate fails, fix the release branch; do not move `main`.

After `main` promotion but before `perkcommons.com` cutover, rollback is a Git branch/deployment operation and does not require DNS changes.

After the eventual public-domain cutover, keep the previous deployment alias or equivalent Vercel rollback target until the new production version has passed post-cutover checks.

Database changes must be forward-compatible where practical. Avoid destructive column/table removal in this promotion so an application rollback can still operate against the upgraded database.

## 12. Domain cutover

`perkcommons.com` remains out of scope for the implementation phase covered by this design.

The domain is moved only after:

- the promoted `main` commit has been deployed and verified on Vercel;
- the exact data SHA is known;
- Supabase production behavior is verified;
- canonical URLs, robots, sitemap and structured data are ready to switch to `https://perkcommons.com`;
- a rollback deployment exists.

At cutover:

- set the production site origin to `https://perkcommons.com`;
- attach the domain to the verified Vercel project;
- regenerate sitemap/robots/canonical metadata;
- preserve existing public URLs where possible and add redirects for changed routes;
- run immediate post-cutover smoke, SEO, API, submission, moderation, and log checks.

## 13. Completion criteria

This promotion is complete when:

- `CodWasTaken/site@main` contains the verified promoted implementation;
- `CodWasTaken/data@main` contains the verified schema-v2 dataset/tooling;
- the canonical Supabase project is reconciled and hardened;
- the hosted Vercel version works against that Supabase backend;
- provenance UI accurately distinguishes automated research from human review;
- Verified status is machine-enforced and not inferred from schema version;
- trust/methodology/data-quality surfaces reflect the real dataset;
- the full release verification gates pass;
- `perkcommons.com` itself remains unchanged pending the separate final cutover.
