# PerkCommons Next implementation status

Legend: `[ ]` not started, `[~]` in progress, `[x]` implemented, `[t]` tested, `[d]` deferred, `[b]` blocked. An implementation marker is not a test claim.

## Safety and audit

- [t] Fork ownership and parent relationships verified through GitHub.
- [t] Fork `origin` and push-disabled official `upstream` verified in five local clones.
- [t] Clean baseline status/branch/remotes recorded before source edits.
- [x] `FORK_SAFETY.md` added to each fork.
- [t] Baseline data tests (5) and site unit tests (29) executed before implementation.
- [x] Current flows, boundaries and risks documented.

## Data and schema

- [t] Canonical v2 model generates JSON Schema, TypeScript, form options, OpenAPI components and draft SQL constraints.
- [t] V1-to-v2 migration preserves identity, URLs, legacy availability/geography and explicit unresolved fields.
- [t] Full dry run: 1,068/1,068 records schema-valid; no v1 records replaced.
- [t] Unknown country and impossible date-order runtime checks.
- [t] Importers write isolated candidate envelopes and contain no hard-coded review date or published-directory path.
- [t] Scope, quality, duplicate and stale reports generated deterministically for 2026-07-22.
- [x] Coverage reports are descriptive rather than quota failures.
- [d] Network broken-link/redirect audit was not run; the report marks both metrics unmeasured.
- [d] Optional semantic duplicate detection.

## Public site and discovery

- [t] Directory initial HTML limited to 24 cards; search index lazy-loaded on interaction.
- [t] Weighted title/provider/alias/benefit/category/tag/eligibility/description search, phrase gating, synonyms and typo tolerance.
- [t] Category, resource type, status, region and archived filters; URL persistence; incremental load.
- [t] JSON, JSONL, CSV, schema, OpenAPI, provider, facet, category and audience assets generated with commit/version metadata.
- [t] Paginated `/api/v1/opportunities` facade over static assets.
- [x] Distinct status styles and canonical brand mark/wordmark copied from the branding fork.
- [x] Moderator access moved out of primary/mobile navigation; theme control moved into header.
- [x] Listing detail quick facts plus local bookmark, compare-list, copy-link and record-export actions.
- [d] Provider pages, comparison workflow and high-value editorial audience guides.
- [d] Structured deadlines, closing-soon and highest-benefit sorts require reviewed v2 data.

## Security, removal and reliability

- [t] Central CSP report-only, Referrer-Policy, Permissions-Policy, nosniff, HSTS and COOP headers.
- [t] One-sided production Turnstile configuration fails closed.
- [t] Separate submission/report rate-limit binding selection; login/tracking bindings reserved.
- [t] Edge tombstones take precedence over cache/Supabase and return 410.
- [t] Removal preparation writes a tombstone before Git preparation when the binding exists.
- [t] Publication and removal cron reconciliation use `Promise.allSettled`.
- [x] Fork automation targets `CodWasTaken/*`; official repositories are not automation targets.
- [t] Fork workflow accepts exact data SHA and performs credential-free build plus Wrangler dry run only.
- [d] Reason-sensitive tombstone policy, KV reconciliation, static tombstone feed and production smoke verification.
- [d] Worker-signed session replacing the reusable Supabase access token cookie.
- [d] GitHub App installation-token integration.

## Submission and moderation

- [x] Existing accessible preview and validation retained; public-field local autosave and duplicate warning added.
- [d] Public tracking reference, correction/withdrawal status workflow.
- [t] Cursor-based queue summary endpoint minimizes fields and excludes contributor descriptions and identity.
- [d] Dedicated detail endpoint and deliberate audited email reveal.
- [d] Modular state model, cursor pagination, saved views and operational dashboard.
- [t] Isolated migration contract adds optimistic revision and distinct second-review enforcement; migration was not applied.
- [d] Selectable publication batches and field-level preview.

## Validation evidence

- [t] Data: `npm test` — 10/10 passed after changes.
- [t] Clean installs: `npm ci` completed in data and site without using credentials.
- [t] Site: `npm test` — 36/36 passed after changes.
- [t] Site: `npm run build` — 1,095 static routes built; Pagefind indexed 1,068 detail pages.
- [t] Browser: final full Chromium desktop/mobile suite — 50 passed, 4 intentionally skipped, 0 failed.
- [t] Wrangler 4.112.0 dry run bundled 3,356 static assets and exited without authentication or deployment.
- [t] Branding JSON/SVG workflow checks passed locally.
- [b] Docs' exact offline Lychee check was not executable locally because the Lychee binary is not installed.
- [t] Data dependency audit reports zero known vulnerabilities after updating the transitive `fast-uri` lock.
- [~] Site dependency audit reports three high-severity development-tool findings through Wrangler/Miniflare `sharp`; npm offers only an unsafe Wrangler downgrade, so this remains registered.
- [ ] Manual Firefox/WebKit, forced-colors, screen-reader and 400% zoom review.

No production database, Worker, workflow, secret or domain was changed or contacted for mutation.
