# PerkCommons Next architecture plan

Status: experimental fork proposal, recorded 2026-07-22. This is not the production architecture and does not authorize changes to official repositories or services.

## Repository boundaries

| Fork | Current responsibility | Next responsibility |
| --- | --- | --- |
| `CodWasTaken/data` | Published v1 JSON, taxonomy, schema, import scripts | Canonical public facts, v1/v2 contracts, candidate isolation, migration, quality reports, generated cross-repository contracts |
| `CodWasTaken/site` | Astro public site, Cloudflare Worker, submission/moderation UI, Supabase migrations | Static discovery and exports, thin privacy-aware API, edge tombstones, review workspace, exact-version deployment evidence |
| `CodWasTaken/docs` | Public policy and architecture | Governance, editorial policy, compatibility and adoption guidance |
| `CodWasTaken/branding` | Mark, wordmark, base tokens | Canonical accessible assets, semantic status tokens and component guidance |

Git remains the canonical public-data history. Supabase remains private moderation/audit state. Cloudflare serves immutable public artifacts and immediate tombstones. No private submission or moderator identity belongs in Git, static HTML, search assets, exports, screenshots, or public APIs.

## Audited current system

### Public data and search

Published records are individual v1 JSON files in `data/opportunities/`. The site builds one static detail page per record. Before this branch, `/opportunities/` rendered all 1,068 cards into one HTML document and performed substring matching across every DOM node on every input event. The home page used Pagefind while the directory used separate substring logic.

The v1 dataset has strong portability but insufficient structure. As audited on 2026-07-22, 1,011 of 1,068 records were `limited`, 1,067 were attributed to `maintainer`, 1,065 shared one review date, 1,060 used the same source and destination URL, and 1,057 claimed only `Global`. These patterns require review; they are not proof that individual facts are wrong.

### Submission flow

The browser posts JSON to `POST /api/submissions`. The Worker validates length, taxonomy, safe HTTPS URLs, honeypot, rate limits, Turnstile, hashed abuse signals and active bans. A Worker-only Supabase service credential writes private submission and fingerprint tables. Anonymous Supabase access is not granted.

### Moderation flow

Moderators authenticate with Supabase, then exchange a reusable access token for a one-hour HttpOnly, Secure, SameSite=Strict cookie. The current queue requests up to 50 full submissions, including private contributor fields. A single 1,170-line browser module owns queue state, dialogs, reports, publication, shortcuts and interactions. Approval writes a normalized v1 row. Assignment and report claiming exist in parts of the database, but revision-based optimistic concurrency and enforced independent second review are not complete.

### Publication and removal

An administrator currently begins one batch containing every approved record. Worker code constructs Git objects, opens a data PR, waits for a check named `validate`, merges, then dispatches the site workflow. The baseline hard-coded official repositories and deployed moving `main`; this fork redirects automation constants to `CodWasTaken/*` and changes the workflow to a dry run. Publication still needs selectable moderate batches, explicit normalized availability/geography/sponsorship, GitHub App tokens and exact data/site SHA state before production adoption.

For removals, Supabase is canonical moderation state and the Worker checks it before serving static detail routes. The baseline failed open on Supabase errors. The fork adds a primary edge tombstone binding checked before cache or Supabase and writes the tombstone before Git removal preparation. Static search/directory removal after a new build and sensitive reason-specific failure policy remain adoption work.

### Deployment

The baseline workflow checked out moving official `data/main` and performed `wrangler deploy` with production credentials. The fork workflow accepts an exact fork data SHA, records site/data/schema/taxonomy versions in generated exports, runs tests/build/dry-run only, and loads no Cloudflare credential. No deployment was triggered.

## Target architecture

```text
Public sources
  -> isolated candidate envelopes + source metadata
  -> deterministic lint and duplicate candidates
  -> accountable human review (optional independent second review)
  -> normalized v2 public record
  -> selected, validated fork data change
  -> immutable data commit
  -> site build pinned to site + data commit
  -> static pages, shards, exports and search assets

Private contributor input
  -> Cloudflare validation / separate rate limits / Turnstile
  -> private Supabase intake and audit state
  -> minimized queue summaries
  -> private detail fetch on open

Removal decision
  -> Supabase audit event
  -> edge tombstone immediately
  -> validated Git tombstone or archival change
  -> exact-version build
  -> smoke verification
  -> tombstone retained
```

### Static discovery

Detail pages remain static and canonical. The directory ships one small first page and lazy-loads `catalog-index.json`; category and audience shards support constrained entry points. The same weighted field order drives all public search surfaces. URL state is canonical for filters. Archived, disputed and expired records are excluded by default, without deleting history.

### Contract generation

`data/schema/opportunity-v2.model.json` is the canonical v2 model. Its generator emits JSON Schema, TypeScript types, form options, OpenAPI components and draft database constraints. Site exports read generated data artifacts at build time rather than hand-copying the contract.

### Supabase boundary

Supabase owns private submissions, reporter/contributor contact data, role/assignment state, review notes, audit events, publication/removal coordination, appeals and retention evidence. Queue summary endpoints must exclude private details. Contributor email reveal must be deliberate and audited. Public browsing must not require Supabase.

### Cloudflare boundary

Static Assets owns public pages and export files. The Worker owns bounded intake, authentication mediation, a paginated facade over static exports, security headers and tombstone route suppression. KV or an equivalent edge binding owns fast tombstones; it is not the canonical editorial audit ledger. Long-running publication should migrate from cron polling toward a durable workflow or queue after policy design.

### GitHub automation

Future automation should use a GitHub App installation token with repository-scoped contents, pull-request, checks/status and workflow permissions. It must target an allow-listed repository, branch from a recorded base SHA, validate generated files, never force-update a reviewed branch, merge only the recorded head SHA, and dispatch a site build with exact site/data SHAs. Official installation requires later explicit owner authorization.

## Compatibility and migration

V1 files remain accepted and untouched. The v2 migration dry run creates no published files unless an explicit output directory is provided. Ambiguous URL purpose, `active`, `Global`, review identity, deadlines and audience fields remain listed in `migration.unresolvedFields`; migrated records are `needs-human-review`. The site reads v1 while exports advertise `1+2.0`. Mixed-mode publication and v2 detail rendering should be adopted only after fixtures, moderation fields and database migrations agree.

## Bottlenecks and sequencing

1. Establish safe fork remotes and isolated data/build inputs.
2. Generate the v2 contract and migration; isolate import candidates.
3. Replace quantity quotas with editorial quality reports.
4. Ship static-first directory and machine-readable exports.
5. Add edge tombstones, central headers and independent reconciliation.
6. Minimize queue summaries and add optimistic concurrency/second review in an isolated Supabase project.
7. Replace publish-all with selected exact-SHA batches and GitHub App authentication.
8. Add provider/audience/comparison pages only where content thresholds and original copy are met.
9. Run cross-browser, accessibility, dry-run and failure-recovery validation before any adoption proposal.

Editorial heuristics never approve, publish, remove or merge facts. When v1 intent is ambiguous, preserve it and require a human decision.
