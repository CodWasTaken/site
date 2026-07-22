# PerkCommons Next experimental-fork handoff

Prepared 2026-07-22. This handoff covers local branches in personal forks owned by `CodWasTaken`. It is not a production release and does not represent the official PerkCommons implementation.

## Completed work

- Established fork-only remotes, disabled every official upstream push URL, and recorded the safety boundary in every repository.
- Audited the current public-data, submission, moderation, publication, removal, deployment, search, Supabase, Cloudflare, automation, and privacy boundaries.
- Added one canonical opportunity-v2 model with generated JSON Schema, TypeScript, runtime validation, form options, OpenAPI components, and draft SQL constraints.
- Added a non-destructive v1-to-v2 migration. Its full dry run validated all 1,068 records while preserving 10,737 ambiguous values as explicit unresolved markers.
- Replaced catalogue quotas with descriptive coverage plus deterministic scope, quality, duplicate-candidate, stale-record, and migration reports. Heuristics do not delete, merge, archive, or publish records.
- Isolated all importers behind candidate envelopes; importers no longer write into the canonical published directory or hard-code review dates.
- Replaced the 1,068-card directory DOM with a static-first 24-card first page, lazy weighted search, URL-persistent filters, sorting, and incremental loading.
- Generated static JSON/JSONL/CSV exports, search/facet/provider/category/audience assets, schema, OpenAPI, tombstone/change-feed placeholders, compatibility metadata, and a paginated public API facade.
- Improved branded cards, status presentation, detail-page URL semantics, convenience actions, and submission autosave/duplicate warning behavior.
- Added centralized report-only CSP and security headers, separate intake rate-limit bindings, edge-first tombstone suppression, fail-closed configured tombstone access, and independent publication/removal cron settlement.
- Added a minimized moderation queue-summary endpoint and an unapplied SQL migration contract for assignment, revision, conflict-of-interest, and distinct second-review enforcement.
- Replaced deploy automation with a credential-free fork dry run pinned to an exact data SHA. Automation targets only `CodWasTaken/*`.
- Added architecture, migration, moderation, search, deployment, security, risk, governance, and implementation-status documentation.

## Forks and branches

| Fork | Official read-only upstream | Local branch |
| --- | --- | --- |
| `https://github.com/CodWasTaken/site` | `https://github.com/PerkCommons/site` | `next/foundation` |
| `https://github.com/CodWasTaken/data` | `https://github.com/PerkCommons/data` | `next/schema-v2` |
| `https://github.com/CodWasTaken/docs` | `https://github.com/PerkCommons/docs` | `next/governance` |
| `https://github.com/CodWasTaken/branding` | `https://github.com/PerkCommons/branding` | `next/accessibility` |

The site's nested `.data` clone is also on `next/schema-v2`, with the personal data fork as `origin` and push-disabled official upstream.

## Commits

Changes are committed locally using narrowly scoped conventional subjects. Run the following in each fork for immutable commit IDs:

```bash
git log --oneline origin/main..HEAD
```

No branch or commit was pushed during this project.

## Validation executed

| Repository | Command | Result |
| --- | --- | --- |
| data | `npm ci` | completed; no credentials used |
| data | `npm run check` | generated artifacts current; 1,068 v1 records valid |
| data | `npm test` | 10 passed, 0 failed |
| data | `npm run reports` | all required scope/quality/duplicate/stale reports regenerated |
| data | `npm run migrate:v2` | 1,068/1,068 v2 results valid; 10,737 unresolved markers; no records written |
| data | `npm audit` | 0 known vulnerabilities after transitive lock update |
| site | `npm ci` | completed; no credentials used |
| site | `npm run check` | Astro and TypeScript checks passed |
| site | `npm test` | 36 passed, 0 failed |
| site | `npm run build` | 1,095 static routes built; 1,068 detail pages indexed |
| site | `npm run test:browser` | final full Chromium desktop/mobile run: 50 passed, 4 intentionally skipped, 0 failed |
| site | `npx wrangler deploy --dry-run --outdir /tmp/perkcommons-next-wrangler-dry-run` | bundled 3,356 assets and exited without authentication or deployment |
| branding | `jq empty` plus SVG presence checks | passed |
| docs | exact offline Lychee workflow | not run: Lychee is not installed locally |

The site audit still reports three high-severity development-tool advisories inherited through Wrangler/Miniflare's `sharp`. npm offers an old Wrangler downgrade rather than a compatible fix. This is R21 in the risk register and is not silently treated as resolved.

## Local preview

From `site`:

```bash
npm ci
npm run build
npm run preview -- --host 127.0.0.1 --port 4322
```

Open `http://127.0.0.1:4322/`. The build resolves the adjacent isolated `data` fork. Browser-test screenshots and traces are generated under ignored `test-results/`; no screenshots contain production credentials.

## Known limitations and deferred work

- Current v1 facts are not editorially upgraded by migration. Ambiguous status, geography, provenance, evidence, application URL, and deadline values require human review.
- Broken links and redirects are explicitly reported as `not-measured`; no large network crawl was performed.
- The search index is lazy but remains approximately 1 MB uncompressed. Shard-first loading and representative ranking fixtures remain work.
- Provider pages, original audience guides, comparison UI, separate sitemaps, structured deadlines, and benefit-aware sorting are deferred.
- Submission tracking references, correction/withdrawal flows, and multiple structured evidence inputs remain deferred.
- The minimized queue summary exists, but the current moderation UI still needs modular state, saved views, dedicated private detail/reveal auditing, selectable publication batches, operational metrics, and richer report decisions.
- The SQL review-concurrency migration is an isolated proposal only. It has not been applied to any Supabase project.
- Edge tombstones require an isolated KV namespace before hosted testing. No namespace was created and no production binding was contacted.
- GitHub App authentication, exact hosted deployment state, production-equivalent smoke verification, and publication/removal dashboards remain proposals.
- Firefox, WebKit/Safari, Axe, screen-reader, forced-colors, high-contrast, 200%/400% zoom, and manual device verification remain outstanding.
- CSP is report-only by design; enforcement requires a fork report-collection period and inline-script remediation.

## Security and privacy considerations

- Do not add production credentials to `.env.production`, Wrangler configuration, CI, fixtures, screenshots, or documentation.
- A hosted fork must use isolated Supabase, Cloudflare, Turnstile, GitHub App, KV, and rate-limit resources.
- Require `TOMBSTONE_STORE` for any production-like environment and define reason-sensitive failure policy before launch.
- Preserve HttpOnly, Secure, SameSite, role, same-origin, service-role, and raw-IP protections.
- Do not expose contributor or reporter identities in queue summaries. A future reveal action must be deliberate and audited.
- Do not publish migrated or imported records without a human review event.

## Database and deployment requirements

1. Review `supabase/migrations/202607220001_next_review_concurrency.sql` with privacy/security owners.
2. Apply it only to a disposable fork Supabase project, test rollback and RLS, then run concurrency/second-review integration tests.
3. Provision an isolated tombstone KV store and isolated Turnstile/rate-limit configuration; never reuse production identifiers or secrets.
4. Pin the exact site commit, data commit, schema version, taxonomy version, and minimum migration in the compatibility manifest.
5. Run the credential-free dry-run workflow first, then deploy only to a distinct non-production hostname after explicit authorization.
6. Verify homepage 200, changed record 200, tombstoned record 410, exports/search/sitemaps, exact data SHA, and API schema version.
7. Keep publication and removal reconciliation independent and prevent an older deployment from superseding a newer one.

## Later transfer to official repositories

Transfer is prohibited until the owner explicitly states Build Week is over and authorizes official changes. After authorization:

1. Re-verify the authorization and record its scope.
2. Fetch official upstreams without changing their settings or branches.
3. Create new, focused official integration branches; do not merge the experimental branches wholesale.
4. Fetch the authorized official upstream, review both `git log origin/main..HEAD` and `git log upstream/main..HEAD`, then cherry-pick only approved, independently reviewable commits in dependency order: schema/data tooling, site consumption, Worker safety, moderation migration, then documentation.
5. Replace fork identifiers only through a reviewed configuration change. Do not copy fork placeholders or isolated resource IDs into production.
6. Regenerate artifacts and reports from the exact approved data revision.
7. Run clean installs, checks, unit tests, build, browser/accessibility suites, SQL integration tests, and Wrangler dry run.
8. Conduct privacy, security, editorial, accessibility, governance, and migration reviews.
9. Open separate official pull requests only if explicitly authorized, with no automatic publication or deployment.
10. Deploy only after separate explicit production authorization, exact-SHA verification, rollback preparation, and human approval.

## Safety attestation

The official `PerkCommons/site`, `PerkCommons/data`, `PerkCommons/docs`, and `PerkCommons/branding` repositories were not modified, pushed to, branched, merged, or targeted by pull requests. No production Cloudflare Worker, Supabase database, GitHub Actions workflow, secret, or `perkcommons.com` deployment was changed. No production deployment was triggered.
