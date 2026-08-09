# Vercel Next Development Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the PerkCommons Next-development runtime to a production `*.vercel.app` deployment sourced from `CodWasTaken/site` `main`, while preserving the static-first catalogue, dynamic API/moderation behavior, publication/removal reconciliation, and the existing Cloudflare Next-development Worker as rollback.

**Architecture:** Keep Astro output static and extract the current Cloudflare Worker request router into runtime-neutral modules. Add thin Vercel adapters for API requests, routing middleware for listing tombstones/moderator protection, a protected Vercel Cron reconciliation endpoint, and a Vercel Deploy Hook transport for publication-triggered rebuilds. Reuse the isolated Next-development Supabase project and hard-fail any Vercel Next-development path that would target the original `PerkCommons/*` repositories.

**Tech Stack:** Astro 7, TypeScript 6, Vercel Node.js Functions, Vercel Routing Middleware via `@vercel/functions`, Vercel Cron Jobs, Supabase REST/Auth, GitHub REST API, Pagefind, Node test runner.

## Global Constraints

- Modify only `CodWasTaken/site` and isolated Next-development infrastructure.
- Do not modify `PerkCommons/*`, `perkcommons.com`, the production Cloudflare Worker, or the existing `perkcommons-next-fork-dev.cod3eater.workers.dev` deployment.
- Vercel project name: `perkcommons-next-dev`.
- Production branch: `main`.
- Initial public hostname: generated `*.vercel.app` only; attach no custom domain.
- Vercel builds must read `https://github.com/CodWasTaken/data.git` at ref `main` and must not silently fall back to `PerkCommons/data`.
- Reuse the existing isolated Next-development Supabase project.
- Keep raw client IP transient; persist only the existing keyed fingerprints and normalized country code.
- Preserve existing moderator session semantics, Turnstile verification, publication validation, listing removal behavior, and static-first public pages.
- Vercel Cron must call publication reconciliation before listing-removal reconciliation.
- The Cloudflare Worker entry point remains buildable as rollback-compatible source code.
- No secret value is committed to Git. Public browser values may remain public; `SUPABASE_SERVICE_ROLE_KEY`, `SUBMISSION_FINGERPRINT_SECRET`, GitHub write tokens, `CRON_SECRET`, and the Vercel deploy-hook URL are server-only.

---

## File Structure

### New files

- `worker/lib/api-router.ts` — runtime-neutral `/api/*` dispatcher extracted from `worker/index.ts`.
- `worker/lib/request-metadata.ts` — runtime-neutral client IP/country extraction from trusted Cloudflare or Vercel headers.
- `worker/lib/deployment.ts` — site rebuild transport abstraction; Vercel Deploy Hook first, legacy GitHub workflow dispatch only when explicitly configured.
- `vercel/runtime-env.ts` — validates and constructs the shared `Env` object from Vercel `process.env`.
- `api/[...path].ts` — catch-all Vercel Node.js Function adapter for the shared API router.
- `api/cron/reconcile.ts` — protected reconciliation endpoint called by Vercel Cron.
- `middleware.ts` — Vercel Routing Middleware for tombstones and moderator route protection.
- `vercel.json` — cron schedule, function duration, framework/build settings, and platform security headers.
- `worker/tests/runtime-adapters.test.ts` — request metadata, shared router, and Vercel environment tests.
- `worker/tests/vercel-cron.test.ts` — cron authorization/order tests.
- `worker/tests/deployment.test.ts` — deploy-hook and fork-only deployment tests.

### Existing files to modify

- `worker/index.ts` — reduce to Cloudflare adapter + static asset fallback + scheduled adapter.
- `worker/lib/types.ts` — remove shared reliance on mandatory `ASSETS`; add explicit fork/deployment configuration fields.
- `worker/routes/public.ts` — use `request-metadata.ts` instead of `request.cf`/Cloudflare-only IP extraction.
- `worker/lib/publication-github.ts` — replace hard-coded `PerkCommons/data`, `PerkCommons/site`, and `PerkCommons` head owner with validated configuration.
- `worker/lib/publication.ts` — use deployment abstraction and deployment-capability check.
- `worker/lib/removal.ts` — use deployment abstraction and deployment-capability check.
- `worker/tests/public-api.test.ts` — retain public API behavior and add Vercel-header coverage where appropriate.
- `worker/tests/publication.test.ts` — assert `CodWasTaken/data` targeting and Vercel deploy-hook behavior.
- `worker/tests/removal.test.ts` — assert fork-only removal and deploy-hook behavior.
- `scripts/fetch-data.mjs` — fail closed on Vercel when fork data repository/ref are absent.
- `astro.config.ts` — derive the generated site URL from the Vercel production URL during Vercel builds while keeping the existing production fallback outside Vercel.
- `package.json` / `package-lock.json` — add Vercel runtime dependencies and test/type-check coverage.
- `.env.example` — document Vercel-only variable names with empty values, never secrets.

---

### Task 1: Extract a Runtime-Neutral API Router

**Files:**
- Create: `worker/lib/api-router.ts`
- Modify: `worker/index.ts`
- Modify: `worker/lib/types.ts`
- Test: `worker/tests/runtime-adapters.test.ts`

**Interfaces:**
- Produces: `routeApiRequest(request: Request, env: Env): Promise<Response>`.
- Produces: `Env` where `ASSETS` is optional and runtime-only configuration fields are explicit strings.
- Consumes: all existing moderation/public route functions without changing their public signatures.

- [ ] **Step 1: Write the failing shared-router test**

Create `worker/tests/runtime-adapters.test.ts` with a minimal environment helper and assert an unknown API route returns the existing JSON 404 contract:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { routeApiRequest } from "../lib/api-router";
import type { Env } from "../lib/types";

const env = (): Env => ({
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "public",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  SUBMISSION_FINGERPRINT_SECRET: "0123456789abcdef0123456789abcdef",
  GITHUB_DATA_REPOSITORY: "CodWasTaken/data",
  GITHUB_DATA_BRANCH: "main",
  GITHUB_HEAD_OWNER: "CodWasTaken",
  FORK_ONLY_MODE: "true",
});

test("shared API router preserves the not-found contract", async () => {
  const response = await routeApiRequest(
    new Request("https://next.example/api/does-not-exist"),
    env(),
  );
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    error: { code: "not_found", message: "API route not found." },
  });
});
```

- [ ] **Step 2: Run the focused test and confirm it fails because the module is absent**

Run:

```bash
npx tsx --test worker/tests/runtime-adapters.test.ts
```

Expected: FAIL with module resolution error for `../lib/api-router`.

- [ ] **Step 3: Move only the `/api/*` dispatch logic out of `worker/index.ts`**

Create `worker/lib/api-router.ts` containing the route regexes and the current `api()` body, exported as:

```ts
export async function routeApiRequest(
  request: Request,
  env: Env,
): Promise<Response> {
  // Existing route dispatch copied without behavior changes.
}
```

Keep `worker/index.ts` responsible for Cloudflare-only concerns:

```ts
if (url.pathname.startsWith("/api/")) {
  return routeApiRequest(request, env);
}
```

Change the `Env` shape so `ASSETS` is optional to shared code:

```ts
export interface Env {
  ASSETS?: { fetch(request: Request): Promise<Response> };
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUBMISSION_FINGERPRINT_SECRET: string;
  GITHUB_DATA_PUBLICATION_TOKEN?: string;
  GITHUB_SITE_DEPLOY_TOKEN?: string;
  GITHUB_DATA_REPOSITORY?: string;
  GITHUB_DATA_BRANCH?: string;
  GITHUB_HEAD_OWNER?: string;
  FORK_ONLY_MODE?: string;
  VERCEL_DEPLOY_HOOK_URL?: string;
  TURNSTILE_SECRET_KEY?: string;
  SUBMISSION_RATE_LIMITER?: {
    limit(options: { key: string }): Promise<{ success: boolean }>;
  };
}
```

Before `env.ASSETS.fetch()` in the Cloudflare adapter, fail explicitly when the binding is absent rather than using a non-null assertion.

- [ ] **Step 4: Run router and full Worker tests**

Run:

```bash
npx tsx --test worker/tests/runtime-adapters.test.ts worker/tests/*.test.ts
```

Expected: PASS, with existing Worker behavior unchanged.

- [ ] **Step 5: Commit**

```bash
git add worker/index.ts worker/lib/api-router.ts worker/lib/types.ts worker/tests/runtime-adapters.test.ts
git commit -m "refactor(runtime): extract shared API router"
```

---

### Task 2: Make Request Metadata Portable to Vercel

**Files:**
- Create: `worker/lib/request-metadata.ts`
- Modify: `worker/routes/public.ts`
- Modify: `worker/tests/runtime-adapters.test.ts`
- Modify: `worker/tests/public-api.test.ts`

**Interfaces:**
- Produces: `requestClientIp(request: Request): string | null`.
- Produces: `requestCountry(request: Request): string | null`.
- Consumes: existing `normalizeIpAddress()` and `normalizeCountryCode()`.

- [ ] **Step 1: Add failing tests for Vercel and Cloudflare request metadata**

Add:

```ts
import { requestClientIp, requestCountry } from "../lib/request-metadata";

test("Vercel request metadata uses trusted forwarded IP and country headers", () => {
  const request = new Request("https://next.example/api/submissions", {
    headers: {
      "x-forwarded-for": "203.0.113.40",
      "x-vercel-ip-country": "PL",
    },
  });
  assert.equal(requestClientIp(request), "203.0.113.40");
  assert.equal(requestCountry(request), "PL");
});

test("Cloudflare request metadata remains supported for rollback code", () => {
  const request = new Request("https://next.example/api/submissions", {
    headers: {
      "cf-connecting-ip": "198.51.100.4",
      "cf-ipcountry": "DE",
    },
  });
  assert.equal(requestClientIp(request), "198.51.100.4");
  assert.equal(requestCountry(request), "DE");
});
```

- [ ] **Step 2: Run the tests and confirm missing-module failure**

Run:

```bash
npx tsx --test worker/tests/runtime-adapters.test.ts
```

Expected: FAIL until `request-metadata.ts` exists.

- [ ] **Step 3: Implement header-based metadata extraction**

Create:

```ts
import { normalizeIpAddress } from "./fingerprints";
import { normalizeCountryCode } from "./validation";

export const requestClientIp = (request: Request): string | null =>
  normalizeIpAddress(
    request.headers.get("cf-connecting-ip") ??
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "",
  );

export const requestCountry = (request: Request): string | null =>
  normalizeCountryCode(
    request.headers.get("cf-ipcountry") ??
      request.headers.get("x-vercel-ip-country") ??
      null,
  );
```

Update `worker/routes/public.ts` so `requestSignals()` uses only these helpers. Remove `request.cf?.country` entirely from application logic.

- [ ] **Step 4: Run public API and runtime tests**

Run:

```bash
npx tsx --test worker/tests/runtime-adapters.test.ts worker/tests/public-api.test.ts
```

Expected: PASS, including existing fingerprint/rate-limit behavior.

- [ ] **Step 5: Commit**

```bash
git add worker/lib/request-metadata.ts worker/routes/public.ts worker/tests/runtime-adapters.test.ts worker/tests/public-api.test.ts
git commit -m "refactor(runtime): support Vercel request metadata"
```

---

### Task 3: Enforce Fork-Only GitHub Publication and Vercel Rebuild Dispatch

**Files:**
- Create: `worker/lib/deployment.ts`
- Modify: `worker/lib/publication-github.ts`
- Modify: `worker/lib/publication.ts`
- Modify: `worker/lib/removal.ts`
- Modify: `worker/lib/types.ts`
- Test: `worker/tests/deployment.test.ts`
- Test: `worker/tests/publication.test.ts`
- Test: `worker/tests/removal.test.ts`

**Interfaces:**
- Produces: `githubPublicationConfig(env: Env): { dataRepository: string; dataBranch: string; headOwner: string }`.
- Produces: `assertForkOnlyRepository(repository: string, forkOnlyMode: string | undefined): void`.
- Produces: `siteDeploymentConfigured(env: Env): boolean`.
- Produces: `requestSiteDeployment(env: Env): Promise<void>`.
- Changes GitHub helpers to consume repository configuration rather than module-level hard-coded repository constants.

- [ ] **Step 1: Write failing fork-safety and deploy-hook tests**

Create `worker/tests/deployment.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  assertForkOnlyRepository,
  requestSiteDeployment,
  siteDeploymentConfigured,
} from "../lib/deployment";
import type { Env } from "../lib/types";

test("fork-only mode refuses original repositories", () => {
  assert.throws(
    () => assertForkOnlyRepository("PerkCommons/data", "true"),
    /fork-only/i,
  );
  assert.doesNotThrow(() =>
    assertForkOnlyRepository("CodWasTaken/data", "true"),
  );
});

test("Vercel deploy hook satisfies site deployment capability", () => {
  const env = { VERCEL_DEPLOY_HOOK_URL: "https://api.vercel.com/v1/integrations/deploy/test" } as Env;
  assert.equal(siteDeploymentConfigured(env), true);
});
```

Add an HTTP mock test that captures a POST to `VERCEL_DEPLOY_HOOK_URL` and asserts no authorization secret is logged or returned.

- [ ] **Step 2: Run focused tests and confirm failure**

```bash
npx tsx --test worker/tests/deployment.test.ts
```

Expected: FAIL because `worker/lib/deployment.ts` does not exist.

- [ ] **Step 3: Implement validated fork configuration**

In `worker/lib/publication-github.ts`, replace module constants with values passed from a configuration object. Defaults are permitted only when `FORK_ONLY_MODE` is not enabled. In fork-only mode, any repository whose owner is `PerkCommons` must throw before an HTTP request is issued.

Use this configuration shape:

```ts
export interface GithubPublicationConfig {
  dataRepository: string;
  dataBranch: string;
  headOwner: string;
}

export const githubPublicationConfig = (env: Env): GithubPublicationConfig => {
  const dataRepository = env.GITHUB_DATA_REPOSITORY ?? "PerkCommons/data";
  const dataBranch = env.GITHUB_DATA_BRANCH ?? "main";
  const headOwner = env.GITHUB_HEAD_OWNER ?? dataRepository.split("/")[0] ?? "";
  assertForkOnlyRepository(dataRepository, env.FORK_ONLY_MODE);
  return { dataRepository, dataBranch, headOwner };
};
```

All publication/removal PR query paths must use `config.dataRepository`, `config.dataBranch`, and `config.headOwner`; specifically, the `head=` query becomes `${config.headOwner}:${branch}` rather than `PerkCommons:${branch}`.

- [ ] **Step 4: Implement site-deployment abstraction**

Create `worker/lib/deployment.ts` so Vercel is preferred when configured:

```ts
export const siteDeploymentConfigured = (env: Env): boolean =>
  Boolean(env.VERCEL_DEPLOY_HOOK_URL || env.GITHUB_SITE_DEPLOY_TOKEN);

export async function requestSiteDeployment(env: Env): Promise<void> {
  if (env.VERCEL_DEPLOY_HOOK_URL) {
    const response = await fetch(env.VERCEL_DEPLOY_HOOK_URL, {
      method: "POST",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Vercel deploy hook failed (${response.status})`);
    return;
  }
  if (env.GITHUB_SITE_DEPLOY_TOKEN) {
    await dispatchSiteDeployment(env.GITHUB_SITE_DEPLOY_TOKEN);
    return;
  }
  throw new RequestError(
    "Automated site deployment is not configured.",
    503,
    "deployment_not_configured",
  );
}
```

Update `publication.ts` and `removal.ts` so deployment readiness checks use `siteDeploymentConfigured(env)` and rebuild calls use `requestSiteDeployment(env)`.

- [ ] **Step 5: Update publication/removal tests to assert fork paths**

In the existing GitHub fetch mocks, assert paths contain:

```text
/repos/CodWasTaken/data/
```

and do not contain:

```text
/repos/PerkCommons/
```

The test environment must set:

```ts
GITHUB_DATA_REPOSITORY: "CodWasTaken/data",
GITHUB_DATA_BRANCH: "main",
GITHUB_HEAD_OWNER: "CodWasTaken",
FORK_ONLY_MODE: "true",
VERCEL_DEPLOY_HOOK_URL: "https://api.vercel.com/v1/integrations/deploy/test",
```

- [ ] **Step 6: Run deployment/publication/removal tests**

```bash
npx tsx --test worker/tests/deployment.test.ts worker/tests/publication.test.ts worker/tests/removal.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add worker/lib/deployment.ts worker/lib/publication-github.ts worker/lib/publication.ts worker/lib/removal.ts worker/lib/types.ts worker/tests/deployment.test.ts worker/tests/publication.test.ts worker/tests/removal.test.ts
git commit -m "feat(runtime): target fork publication and Vercel rebuilds"
```

---

### Task 4: Add the Vercel Environment and API Function Adapters

**Files:**
- Create: `vercel/runtime-env.ts`
- Create: `api/[...path].ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.env.example`
- Modify: `worker/tests/runtime-adapters.test.ts`

**Interfaces:**
- Produces: `vercelEnv(source?: NodeJS.ProcessEnv): Env`.
- Produces: a default Vercel Node handler that forwards all `/api/*` methods to `routeApiRequest()`.

- [ ] **Step 1: Add dependencies**

Run:

```bash
npm install @vercel/node @vercel/functions
```

This updates both `package.json` and `package-lock.json`.

- [ ] **Step 2: Add failing environment validation tests**

Add:

```ts
import { vercelEnv } from "../../vercel/runtime-env";

test("Vercel environment requires isolated server secrets", () => {
  assert.throws(
    () => vercelEnv({ VERCEL: "1" }),
    /SUPABASE_URL/,
  );
});

test("Vercel environment enables fork-only repository targeting", () => {
  const result = vercelEnv({
    VERCEL: "1",
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "public",
    SUPABASE_SERVICE_ROLE_KEY: "service",
    SUBMISSION_FINGERPRINT_SECRET: "0123456789abcdef0123456789abcdef",
    GITHUB_DATA_REPOSITORY: "CodWasTaken/data",
    GITHUB_DATA_BRANCH: "main",
    GITHUB_HEAD_OWNER: "CodWasTaken",
    FORK_ONLY_MODE: "true",
  });
  assert.equal(result.GITHUB_DATA_REPOSITORY, "CodWasTaken/data");
  assert.equal(result.FORK_ONLY_MODE, "true");
});
```

- [ ] **Step 3: Implement strict Vercel env construction**

Create `vercel/runtime-env.ts` with a helper that throws using the variable name only, never its value:

```ts
const required = (source: NodeJS.ProcessEnv, name: string): string => {
  const value = source[name]?.trim();
  if (!value) throw new Error(`Missing required Vercel environment variable: ${name}`);
  return value;
};
```

Construct `Env` from the required Supabase/fingerprint values and optional Turnstile/GitHub/deploy-hook values. Force these repository defaults for this Vercel adapter when variables are omitted:

```ts
GITHUB_DATA_REPOSITORY: source.GITHUB_DATA_REPOSITORY ?? "CodWasTaken/data",
GITHUB_DATA_BRANCH: source.GITHUB_DATA_BRANCH ?? "main",
GITHUB_HEAD_OWNER: source.GITHUB_HEAD_OWNER ?? "CodWasTaken",
FORK_ONLY_MODE: "true",
```

Do not expose `SUPABASE_SERVICE_ROLE_KEY` or other server-only values through `PUBLIC_*` names.

- [ ] **Step 4: Implement catch-all Node Function adapter**

`api/[...path].ts` must reconstruct the public URL and request body, invoke the shared Web router, then copy status/headers/body back to `VercelResponse`:

```ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { routeApiRequest } from "../worker/lib/api-router";
import { vercelEnv } from "../vercel/runtime-env";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const host = req.headers.host ?? process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (!host) return res.status(400).json({ error: { code: "invalid_host", message: "Request host is missing." } });

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) value.forEach((item) => headers.append(key, item));
    else if (value !== undefined) headers.set(key, value);
  }

  const init: RequestInit = { method: req.method, headers };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {});
  }

  const response = await routeApiRequest(
    new Request(`https://${host}${req.url ?? "/api"}`, init),
    vercelEnv(),
  );
  res.status(response.status);
  response.headers.forEach((value, key) => res.setHeader(key, value));
  res.send(Buffer.from(await response.arrayBuffer()));
}
```

- [ ] **Step 5: Document environment names without values**

Append to `.env.example`:

```dotenv
# Vercel Next-development server-only variables
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUBMISSION_FINGERPRINT_SECRET=
TURNSTILE_SECRET_KEY=
GITHUB_DATA_PUBLICATION_TOKEN=
GITHUB_DATA_REPOSITORY=CodWasTaken/data
GITHUB_DATA_BRANCH=main
GITHUB_HEAD_OWNER=CodWasTaken
FORK_ONLY_MODE=true
VERCEL_DEPLOY_HOOK_URL=
CRON_SECRET=
```

- [ ] **Step 6: Run type checks and runtime tests**

```bash
npm run check
npx tsx --test worker/tests/runtime-adapters.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add api vercel package.json package-lock.json .env.example worker/tests/runtime-adapters.test.ts
git commit -m "feat(vercel): add API runtime adapter"
```

---

### Task 5: Preserve Tombstones and Moderator Protection with Routing Middleware

**Files:**
- Create: `middleware.ts`
- Create or modify: `vercel.json`
- Modify: `worker/tests/runtime-adapters.test.ts`

**Interfaces:**
- Consumes: `vercelEnv()`, `isListingRemoved(env, listingId)`, `requireModerator(request, env)`.
- Produces: default Vercel middleware and matcher covering `/opportunities/:path*`, `/moderate`, and `/moderate/:path*`.

- [ ] **Step 1: Extract middleware decision logic into testable functions**

Inside `middleware.ts`, export:

```ts
export const listingIdFromPath = (pathname: string): string | null => {
  const match = pathname.match(/^\/opportunities\/([a-z0-9-]+)\/?$/);
  return match?.[1] ?? null;
};
```

Add tests asserting category/index routes do not become listing IDs and one listing slug does.

- [ ] **Step 2: Run the focused test and confirm failure until middleware exists**

```bash
npx tsx --test worker/tests/runtime-adapters.test.ts
```

Expected: FAIL on missing `middleware.ts` import.

- [ ] **Step 3: Implement Vercel middleware**

Use `next` from `@vercel/functions`. For a listing path, call `isListingRemoved()`; if removed, return the same 410 HTML contract currently emitted by `worker/index.ts`. For `/moderate` and descendants, call `requireModerator()` and redirect unauthenticated requests to `/moderator-login/?next=/moderate/`. Otherwise return `next()`.

The middleware must not intercept `/api/*`; those requests belong to the Function adapter.

- [ ] **Step 4: Add the matcher and platform security headers to `vercel.json`**

Use:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "astro",
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "functions": {
    "api/**/*.ts": { "maxDuration": 60 }
  },
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()" }
      ]
    }
  ]
}
```

Keep CSP/HSTS out of this migration unless the existing project already has an exact tested policy; do not invent a looser or incompatible policy while changing runtimes.

- [ ] **Step 5: Run type/unit tests**

```bash
npm run check
npm test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add middleware.ts vercel.json worker/tests/runtime-adapters.test.ts
git commit -m "feat(vercel): preserve edge route protections"
```

---

### Task 6: Replace the Worker Schedule with Protected Vercel Cron

**Files:**
- Create: `api/cron/reconcile.ts`
- Modify: `vercel.json`
- Test: `worker/tests/vercel-cron.test.ts`

**Interfaces:**
- Produces: `runReconciliation(env: Env): Promise<void>` calling publication then removal reconciliation.
- Produces: cron handler requiring `Authorization: Bearer ${CRON_SECRET}`.

- [ ] **Step 1: Write failing order and authorization tests**

Create tests around an exported `authorizeCron(authorization: string | undefined, secret: string | undefined): boolean` and `runReconciliation()` with injected reconciliation functions so order is observable:

```ts
test("cron rejects missing authorization", () => {
  assert.equal(authorizeCron(undefined, "secret"), false);
});

test("cron uses exact bearer secret", () => {
  assert.equal(authorizeCron("Bearer secret", "secret"), true);
  assert.equal(authorizeCron("Bearer wrong", "secret"), false);
});
```

- [ ] **Step 2: Run and confirm failure**

```bash
npx tsx --test worker/tests/vercel-cron.test.ts
```

Expected: FAIL because the cron module does not exist.

- [ ] **Step 3: Implement the cron endpoint**

The handler must:

```ts
if (!authorizeCron(req.headers.authorization, process.env.CRON_SECRET)) {
  return res.status(401).json({ success: false });
}
await reconcilePublicationBatches(env);
await reconcileListingRemovals(env);
return res.status(200).json({ success: true });
```

Wrap reconciliation in `try/catch`, log only the phase/error name, and return 500 on failure.

- [ ] **Step 4: Configure the production cron**

Add to `vercel.json`:

```json
"crons": [
  {
    "path": "/api/cron/reconcile",
    "schedule": "*/2 * * * *"
  }
]
```

The cron exists only on Vercel production deployments. If Vercel rejects the two-minute schedule for the connected plan, stop and report the platform-plan limitation rather than silently changing semantics.

- [ ] **Step 5: Run tests**

```bash
npx tsx --test worker/tests/vercel-cron.test.ts worker/tests/publication.test.ts worker/tests/removal.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add api/cron/reconcile.ts vercel.json worker/tests/vercel-cron.test.ts
git commit -m "feat(vercel): add protected reconciliation cron"
```

---

### Task 7: Make Vercel Builds Fork-Safe and Generate Correct Canonicals

**Files:**
- Modify: `scripts/fetch-data.mjs`
- Modify: `astro.config.ts`
- Modify: `package.json`
- Test: existing unit/build checks

**Interfaces:**
- Vercel build consumes `PERKCOMMONS_DATA_REPOSITORY=https://github.com/CodWasTaken/data.git` and `PERKCOMMONS_DATA_REF=main`.
- Astro `site` resolves to the generated Vercel production hostname when present.

- [ ] **Step 1: Add a fail-closed Vercel data-source guard**

In `scripts/fetch-data.mjs`, before cloning:

```js
const isVercel = process.env.VERCEL === "1";
const configuredRepository = process.env.PERKCOMMONS_DATA_REPOSITORY?.trim();
const configuredRef = process.env.PERKCOMMONS_DATA_REF?.trim();

if (isVercel && (!configuredRepository || !configuredRef)) {
  throw new Error(
    "Vercel builds require PERKCOMMONS_DATA_REPOSITORY and PERKCOMMONS_DATA_REF",
  );
}
```

Then keep the non-Vercel fallback for existing local/Cloudflare workflows only.

- [ ] **Step 2: Derive the Astro site URL safely**

Use:

```ts
const vercelProductionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
const site = process.env.PUBLIC_SITE_URL?.trim()
  ?? (vercelProductionHost ? `https://${vercelProductionHost}` : "https://perkcommons.com");
```

Pass `site` to `defineConfig`. This prevents the Vercel Next-dev sitemap/canonicals from claiming `perkcommons.com`.

- [ ] **Step 3: Run a fork-data build**

```bash
PERKCOMMONS_DATA_REPOSITORY=https://github.com/CodWasTaken/data.git \
PERKCOMMONS_DATA_REF=main \
VERCEL=1 \
VERCEL_PROJECT_PRODUCTION_URL=perkcommons-next-dev.vercel.app \
npm run build
```

Expected: build succeeds, Pagefind indexes the catalogue, and generated Trust/Privacy/About pages exist.

- [ ] **Step 4: Verify generated content**

```bash
test -f dist/index.html
test -f dist/trust/index.html
test -f dist/privacy/index.html
test -f dist/about/index.html
grep -R "perkcommons-next-dev.vercel.app" dist/sitemap* dist/*.html >/dev/null
```

Expected: all checks pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/fetch-data.mjs astro.config.ts package.json package-lock.json
git commit -m "build(vercel): pin next-dev data and site URL"
```

---

### Task 8: Full Verification Before Opening the Migration PR

**Files:**
- No new production files unless a failing test requires a scoped fix.

**Interfaces:**
- Consumes all prior tasks.
- Produces a reviewable migration branch with green tests and build.

- [ ] **Step 1: Run all unit/type checks**

```bash
npm ci
npm test
```

Expected: all tests pass; zero Astro/TypeScript diagnostics.

- [ ] **Step 2: Run the Vercel-targeted production build**

```bash
PERKCOMMONS_DATA_REPOSITORY=https://github.com/CodWasTaken/data.git \
PERKCOMMONS_DATA_REF=main \
VERCEL=1 \
VERCEL_PROJECT_PRODUCTION_URL=perkcommons-next-dev.vercel.app \
npm run build
```

Expected: success.

- [ ] **Step 3: Run browser tests against the local static build where applicable**

```bash
npm run test:browser
```

Expected: existing supported browser suite passes; existing intentional skips remain documented.

- [ ] **Step 4: Inspect the diff for forbidden targets and secrets**

```bash
git diff main...HEAD -- . ':!package-lock.json' | grep -n "PerkCommons/data\|PerkCommons/site\|perkcommons.com" || true
git diff main...HEAD | grep -nE "SUPABASE_SERVICE_ROLE_KEY=.+|SUBMISSION_FINGERPRINT_SECRET=.+|CRON_SECRET=.+|VERCEL_DEPLOY_HOOK_URL=https://" && exit 1 || true
```

Manually confirm any remaining `PerkCommons/*` strings are compatibility defaults outside Vercel fork-only execution, documentation explaining forbidden targets, or tests that assert refusal. No new write path may target them.

- [ ] **Step 5: Open a PR to `CodWasTaken/site` `main`**

PR title:

```text
feat(vercel): migrate Next dev runtime
```

PR body must state that the Cloudflare Next-development Worker and all original `PerkCommons/*` infrastructure are intentionally untouched.

- [ ] **Step 6: Review CI before merge**

Do not merge on a red code/test/build check. Artifact-upload-only failures may be classified separately only after verifying test/build steps themselves succeeded.

---

### Task 9: Create and Configure the Isolated Vercel Project

**Platform:** Vercel team `Cod's projects`

**Interfaces:**
- Produces Vercel project `perkcommons-next-dev`.
- Production source: `CodWasTaken/site`, branch `main`.
- Produces a generated `*.vercel.app` production URL.

- [ ] **Step 1: Create/link the project without a custom domain**

Use the connected Vercel account/team. Project requirements:

```text
Name: perkcommons-next-dev
Framework: Astro
Production branch: main
Build command: npm run build
Output directory: dist
Custom domains: none
```

If the connector cannot create/link a Git-backed project, stop at this step and report that exact connector limitation; do not substitute the production domain or another hosting account.

- [ ] **Step 2: Configure build-time fork variables**

Set for Production (and Preview if branch previews are enabled):

```text
PERKCOMMONS_DATA_REPOSITORY=https://github.com/CodWasTaken/data.git
PERKCOMMONS_DATA_REF=main
GITHUB_DATA_REPOSITORY=CodWasTaken/data
GITHUB_DATA_BRANCH=main
GITHUB_HEAD_OWNER=CodWasTaken
FORK_ONLY_MODE=true
```

- [ ] **Step 3: Configure the existing isolated Next-dev public Supabase/Turnstile values**

Set the existing values under these names:

```text
PUBLIC_SUPABASE_URL
PUBLIC_SUPABASE_PUBLISHABLE_KEY
PUBLIC_TURNSTILE_SITE_KEY
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
```

`SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` use the same isolated project endpoint/public key as their `PUBLIC_*` counterparts.

- [ ] **Step 4: Configure server-only secrets**

Set the existing isolated values under:

```text
SUPABASE_SERVICE_ROLE_KEY
SUBMISSION_FINGERPRINT_SECRET
TURNSTILE_SECRET_KEY
GITHUB_DATA_PUBLICATION_TOKEN
CRON_SECRET
```

Do not copy values from production PerkCommons infrastructure. If these values are not available through connected secret management, stop and report the missing variable names only; never invent values and never paste secrets into GitHub.

- [ ] **Step 5: Create a Vercel Deploy Hook for `main`**

Create a hook named:

```text
perkcommons-data-rebuild
```

Target branch:

```text
main
```

Store its URL only in the Vercel server variable:

```text
VERCEL_DEPLOY_HOOK_URL
```

- [ ] **Step 6: Enable automatic Git production deployments**

Confirm `CodWasTaken/site` `main` pushes automatically create Vercel production deployments. Do not connect `PerkCommons/site`.

---

### Task 10: First Production Deployment and Runtime Smoke Tests

**Platform:** Vercel project `perkcommons-next-dev`

**Interfaces:**
- Produces the final generated `https://<alias>.vercel.app` URL.
- Confirms runtime parity without touching the Cloudflare fallback.

- [ ] **Step 1: Deploy the merged `main` branch to Vercel production**

Wait for Vercel state `READY`. Record the immutable deployment ID and production alias.

- [ ] **Step 2: Check build logs before smoke tests**

Confirm the build used `CodWasTaken/data`, completed Astro generation, and generated Pagefind output. Any build failure blocks rollout.

- [ ] **Step 3: Smoke-test static pages**

Fetch and require HTTP 200 for:

```text
/
/opportunities/
/trust/
/privacy/
/about/
/moderator-login/
```

Require `/trust/` to contain `Trust and transparency`, `/privacy/` to contain `A plain-language privacy notice.`, and `/about/` to contain `operated by Cod from Poland`.

- [ ] **Step 4: Smoke-test protected routing**

Request `/moderate/` without a moderator cookie and require a 302/307 redirect to `/moderator-login/` with `next=/moderate/`.

Select one known active listing and require its detail route to return 200. Do not create a fake removal solely for smoke testing.

- [ ] **Step 5: Smoke-test API safety without creating real submissions**

Require an unknown API path such as `/api/does-not-exist` to return the JSON 404 contract. Send an intentionally invalid content type to `/api/submissions` and require 415; do not submit a valid record.

- [ ] **Step 6: Verify cron protection**

Request `/api/cron/reconcile` without authorization and require 401. Then trigger the deployed cron through Vercel's cron tooling and confirm 200 without exposing `CRON_SECRET`.

- [ ] **Step 7: Inspect runtime errors**

Check Vercel runtime errors/logs for the deployment after smoke traffic. Require no unexplained 5xx clusters.

- [ ] **Step 8: Verify the Cloudflare rollback endpoint remains unchanged**

Fetch:

```text
https://perkcommons-next-fork-dev.cod3eater.workers.dev
```

Do not deploy, reconfigure, delete, or attach it to Vercel. Its continued availability is the rollback proof.

- [ ] **Step 9: Report completion with exact URLs and immutable identifiers**

Report:

```text
Vercel project name
Vercel production URL
Vercel deployment ID
GitHub migration PR
Merged commit SHA
Cloudflare rollback URL
```

Do not claim completion until Vercel is `READY` and the smoke tests above pass.
