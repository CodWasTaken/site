# Vercel Next Development Migration Design

Date: 2026-08-09
Status: Approved for implementation planning
Scope: `CodWasTaken/site` and the isolated Next-development infrastructure only

## Goal

Move the PerkCommons Next development deployment from Cloudflare Workers to Vercel while preserving the current product behavior: static-first public pages, Supabase-backed submissions and moderation, report handling, moderator authentication, listing tombstone suppression, publication/removal reconciliation, and automated rebuilds after publication changes.

The migration must not modify the original `PerkCommons/*` repositories, `perkcommons.com`, its production Worker, or the existing Next-development Cloudflare Worker. The Cloudflare Next-development Worker remains available as rollback until the Vercel version is proven stable.

## Chosen approach

Use Vercel as the full runtime for the Next-development site rather than only as a static frontend host.

`CodWasTaken/site` `main` will be connected to a Vercel project and will automatically create the production Next-development deployment. The public hostname will initially be a Vercel-provided `*.vercel.app` domain only. No custom PerkCommons domain will be attached during this migration.

The existing isolated Next-development Supabase project remains the database and authentication backend. No new database project is introduced.

## Alternatives considered

### Static-only Vercel frontend with Cloudflare API backend

This would be the fastest migration, but would leave deployment split across two hosting systems and retain the Cloudflare Worker as a runtime dependency. It does not satisfy the requested full move.

### Full Astro SSR conversion

Converting every page to server rendering would simplify some request interception, but it would discard PerkCommons' static-first architecture and unnecessarily move more traffic into serverless compute. This is rejected.

### Selected: static Astro plus Vercel Functions and Routing Middleware

Keep the Astro catalogue pre-rendered. Port only the dynamic boundaries to Vercel Functions and Routing Middleware. This preserves current performance and keeps the migration narrow.

## Architecture

### Static application

Astro remains configured for static output. The catalogue, listing detail pages, trust pages, privacy page, About page, search assets, Pagefind index, and other public documents remain build artifacts.

The build continues to fetch the data repository before Astro generation. For Vercel deployments the data source must be explicitly pinned to:

- repository: `CodWasTaken/data`
- ref: `main`

The build must never silently fetch `PerkCommons/data` in the Vercel Next-development deployment.

### Vercel API adapter

The current Worker routing logic should be refactored so the application-level handlers are runtime-neutral. Existing modules already consume Web `Request` objects and return Web `Response` objects, so the migration should preserve those interfaces.

A small Vercel adapter will:

1. construct the application `Env` from Vercel environment variables;
2. route `/api/*` requests into the shared PerkCommons API router;
3. convert the returned Web `Response` into the Vercel function response where required;
4. avoid duplicating moderation, Supabase, validation, publication, and removal business logic.

The Cloudflare Worker entry point remains present for rollback, but it becomes another adapter around the same shared request router.

### Environment abstraction

Runtime-specific values will be separated from application logic.

The shared environment shape continues to contain the Supabase credentials, fingerprint secret, GitHub publication credentials, Turnstile secret, and deployment trigger information. `ASSETS` and the Cloudflare rate-limit binding must no longer be assumed by shared API code.

Vercel production environment variables for the Next-development project will include at minimum:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUBMISSION_FINGERPRINT_SECRET`
- `TURNSTILE_SECRET_KEY` when Turnstile is enabled
- `GITHUB_DATA_PUBLICATION_TOKEN` when automated publication is enabled
- `VERCEL_DEPLOY_HOOK_URL` for post-publication rebuilds
- `CRON_SECRET`

Public build-time variables required by the Astro frontend remain separate from server-only secrets.

No production PerkCommons credentials should be reused.

### Request signals and privacy

Cloudflare-specific request metadata will be replaced with Vercel equivalents while preserving the existing privacy model.

- client IP: trusted Vercel `x-forwarded-for`
- country: Vercel geolocation information / `x-vercel-ip-country`
- user agent: standard `user-agent`

Raw IP addresses continue to be used only transiently for verification/fingerprinting and are not persisted. Existing keyed hash behavior remains unchanged.

### Rate limiting

The Cloudflare `SUBMISSION_RATE_LIMITER` binding will not be recreated as a new third-party service for the initial Vercel migration. The existing Supabase-backed submission/report fingerprint checks remain the durable abuse-prevention limit.

This intentionally favors one authoritative shared limit during migration instead of introducing another stateful dependency. A Vercel-native or external short-window limiter can be added later if observed traffic requires it.

### Listing tombstones

The current Worker returns HTTP 410 for removed `/opportunities/:id` listings before serving the static asset.

Vercel Routing Middleware will preserve this behavior. It will run only for the required listing paths, query the isolated Supabase removal state through the shared tombstone helper, return the existing 410 response when removed, and otherwise call Vercel's `next()` helper so the static Astro page is served normally.

This keeps public listing pages static while retaining immediate removal enforcement.

### Moderator route protection

Routing Middleware will also guard `/moderate` and `/moderate/*` before static assets are served. It will reuse the existing moderator-session verification logic. Unauthenticated visitors are redirected to `/moderator-login/` with the same `next` behavior as the Worker implementation.

The actual moderation API remains implemented through Vercel Functions.

### Scheduled reconciliation

The Worker's `scheduled()` handler becomes a protected Vercel Cron endpoint. It will call the same two operations in the current order:

1. reconcile publication batches;
2. reconcile listing removals.

The endpoint will require `Authorization: Bearer <CRON_SECRET>` and fail closed when the secret is absent or incorrect.

The cron is enabled only on the Vercel production deployment of this Next-development project.

### Publication-triggered rebuilds

The current publication flow requests a site deployment after a data PR is merged. Under Vercel this becomes an isolated Vercel Deploy Hook targeting the `CodWasTaken/site` `main` branch.

The deploy-hook URL is stored only as a Vercel server-side secret. Publication code calls the hook after a successful data publication/removal merge. This avoids depending on a Cloudflare deployment workflow after the migration.

The GitHub publication code must remain constrained to the fork repositories. It must never write or merge into `PerkCommons/*` while fork-only mode is active.

## Git and deployment flow

Normal code deployment:

1. code lands on `CodWasTaken/site` `main`;
2. Vercel's Git integration automatically starts a production deployment;
3. Vercel runs the repository build using `CodWasTaken/data` `main`;
4. tests/build checks must pass before the deployment is considered usable;
5. the resulting production alias remains under `*.vercel.app`.

Data publication deployment:

1. moderator-approved data is written through the existing publication workflow to `CodWasTaken/data`;
2. validation passes and the data PR is merged;
3. the reconciliation process triggers `VERCEL_DEPLOY_HOOK_URL`;
4. Vercel rebuilds `CodWasTaken/site` `main`, fetching the newly merged fork data.

## Vercel project configuration

Create one project under the connected Vercel team `Cod's projects`.

Recommended project name: `perkcommons-next-dev`.

Configuration requirements:

- source repository: `CodWasTaken/site`
- production branch: `main`
- automatic Git production deployments enabled
- Astro/static build retained
- no custom domain
- no connection to `perkcommons.com`
- server-only secrets stored in Vercel environment variables
- production URL allowed to remain the generated `*.vercel.app` alias

The exact generated Vercel hostname is accepted rather than requiring a predetermined alias.

## Error handling

Dynamic API failures continue to use the existing generic public error contract and detailed server-side logging. Sensitive Supabase/GitHub/secret values must never appear in browser responses or logs.

Tombstone lookup failure must follow the existing security posture determined by the shared helper and its tests rather than introducing new behavior during the hosting migration.

Cron failures must return a non-2xx status and log which reconciliation phase failed without logging credentials or private submission content.

A failed Vercel deployment must not alter or remove the existing Cloudflare Next-development deployment.

## Security requirements

- Only `CodWasTaken/*` GitHub repositories may be modified by the migrated Next-development automation.
- No `perkcommons.com` domain is connected to Vercel during this work.
- Production PerkCommons Cloudflare resources are untouched.
- Existing Cloudflare Next-development Worker is untouched and retained as rollback.
- Supabase service-role credentials remain server-only.
- `CRON_SECRET` protects the reconciliation endpoint.
- Deploy-hook URL is treated as a secret.
- Turnstile verification remains server-side.
- Existing security headers must be preserved on Vercel static and dynamic responses.

## Testing strategy

### Unit and type tests

The existing test suite must stay green. New tests cover:

- Vercel environment construction;
- client IP/country extraction without Cloudflare `request.cf`;
- routing through the Vercel API adapter;
- absence of the Cloudflare rate-limit binding;
- cron authorization;
- publication deploy-hook dispatch;
- fork-only repository targeting;
- middleware tombstone behavior;
- middleware moderator redirect behavior.

### Build verification

A Vercel-targeted build must successfully generate the catalogue from `CodWasTaken/data` and include the Trust, Privacy, and About changes already merged to the fork.

### Deployment smoke tests

After the first production deployment, verify at minimum:

- `/`
- `/opportunities/`
- one normal listing detail page
- `/trust/`
- `/privacy/`
- `/about/`
- `/moderator-login/`
- unauthenticated `/moderate/` redirect
- one read-only public API endpoint
- submission/report validation path without submitting real test spam
- protected cron endpoint rejects unauthenticated calls

Runtime logs are checked for 5xx errors after smoke traffic.

## Rollout

1. Implement on a dedicated branch in `CodWasTaken/site`.
2. Run unit/type/build tests.
3. Create/configure the Vercel project and isolated secrets.
4. Create an initial Vercel production deployment under `*.vercel.app`.
5. Run smoke tests and inspect runtime/build logs.
6. Connect `main` Git auto-deploy after deployment behavior is verified.
7. Create the production-branch deploy hook and validate publication-triggered rebuild logic.
8. Keep the Cloudflare Next-development Worker available until the Vercel deployment has passed functional verification.

## Rollback

Rollback is immediate: use the existing `perkcommons-next-fork-dev.cod3eater.workers.dev` deployment while the Vercel project is repaired. No DNS change is required because the migration initially uses only a separate `*.vercel.app` hostname.

If a Vercel code change is faulty, revert the fork commit or promote a previous known-good Vercel deployment. The Cloudflare Worker and original PerkCommons production infrastructure remain unaffected.

## Non-goals

This migration does not:

- move or modify `perkcommons.com`;
- alter the original `PerkCommons/*` repositories;
- delete or reconfigure the Cloudflare Next-development Worker;
- migrate away from the isolated Next-development Supabase project;
- redesign moderation/publication product behavior;
- introduce a paid external rate-limit datastore;
- add a custom Vercel domain.

## Success criteria

The migration is complete when a production `*.vercel.app` deployment sourced from `CodWasTaken/site` `main` serves the full Next-development experience, all dynamic moderation/submission/report functionality uses Vercel runtime components and the isolated Supabase project, publication/removal reconciliation runs through protected Vercel Cron, data changes can trigger Vercel rebuilds, main-branch pushes auto-deploy, and both the original PerkCommons production infrastructure and the Cloudflare Next-development Worker remain untouched.
