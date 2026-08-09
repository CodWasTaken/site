# Vercel Next Development Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the PerkCommons Next-development runtime to a production `*.vercel.app` deployment sourced from `CodWasTaken/site` `main`, preserving the static-first catalogue, dynamic submission/moderation/report behavior, publication/removal reconciliation, and the existing Cloudflare Next-development Worker as rollback.

**Architecture:** Keep Astro static. Extract the current Worker API dispatcher into runtime-neutral modules, then add thin Vercel Node Function and Routing Middleware adapters. Replace Worker cron execution with a protected Vercel Cron endpoint and replace Next-dev site rebuild dispatch with a Vercel Deploy Hook. Reuse the isolated Next-dev Supabase project and fail closed if Vercel publication/removal code attempts to target the original `PerkCommons/*` repositories.

**Tech Stack:** Astro 7, TypeScript 6, Vercel Node.js Functions, `@vercel/node`, Vercel Routing Middleware via `@vercel/functions`, Vercel Cron, Supabase REST/Auth, GitHub REST API, Pagefind, Node test runner.

## Global Constraints

- Modify only `CodWasTaken/site` and isolated Next-development infrastructure.
- Never modify or deploy `PerkCommons/*`, `perkcommons.com`, the production Cloudflare Worker, or the existing `perkcommons-next-fork-dev.cod3eater.workers.dev` Worker.
- Vercel project name: `perkcommons-next-dev`.
- Vercel production branch: `main`.
- Initial public hostname: generated `*.vercel.app` only; no custom domain.
- Vercel builds must use `https://github.com/CodWasTaken/data.git` at ref `main`; no silent fallback to `PerkCommons/data` on Vercel.
- Reuse the existing isolated Next-development Supabase project.
- Keep raw client IP transient; persist only existing keyed fingerprints and normalized country code.
- Preserve moderator sessions, Turnstile verification, publication validation, tombstone suppression, and static-first pages.
- Vercel reconciliation order: publication batches first, listing removals second.
- Keep the Cloudflare Worker source buildable; its already-deployed Next-dev version is rollback and must not be changed during this migration.
- Never commit `SUPABASE_SERVICE_ROLE_KEY`, `SUBMISSION_FINGERPRINT_SECRET`, `GITHUB_DATA_PUBLICATION_TOKEN`, `CRON_SECRET`, `TURNSTILE_SECRET_KEY`, or `VERCEL_DEPLOY_HOOK_URL` values.

---

## File Structure

### New files

- `worker/lib/api-router.ts` — runtime-neutral `/api/*` route dispatcher extracted from `worker/index.ts`.
- `worker/lib/request-metadata.ts` — client IP/country extraction supporting both Cloudflare and Vercel headers.
- `worker/lib/github-targets.ts` — GitHub repository configuration and fork-only refusal guard; intentionally independent of deployment transport.
- `worker/lib/deployment.ts` — rebuild transport abstraction; Vercel Deploy Hook first, legacy GitHub workflow dispatch only when explicitly configured.
- `vercel/runtime-env.ts` — strict construction of shared `Env` from Vercel environment variables.
- `api/[...path].ts` — catch-all Vercel Node Function adapter for shared API routing.
- `api/cron/reconcile.ts` — protected Vercel Cron reconciliation endpoint.
- `middleware.ts` — Vercel Routing Middleware for listing tombstones and moderator route protection.
- `vercel.json` — Vercel build/function/headers/cron configuration.
- `worker/tests/runtime-adapters.test.ts` — shared router, request metadata, environment adapter, middleware utility tests.
- `worker/tests/deployment.test.ts` — fork-target and deploy-hook tests.
- `worker/tests/vercel-cron.test.ts` — cron authorization and ordering tests.

### Existing files to modify

- `worker/index.ts`
- `worker/lib/types.ts`
- `worker/routes/public.ts`
- `worker/lib/publication-github.ts`
- `worker/lib/publication.ts`
- `worker/lib/removal.ts`
- `worker/tests/public-api.test.ts`
- `worker/tests/publication.test.ts`
- `worker/tests/removal.test.ts`
- `scripts/fetch-data.mjs`
- `astro.config.ts`
- `package.json`
- `package-lock.json`
- `.env.example`

---

### Task 1: Extract the Shared API Router

**Files:**
- Create: `worker/lib/api-router.ts`
- Modify: `worker/index.ts`
- Modify: `worker/lib/types.ts`
- Test: `worker/tests/runtime-adapters.test.ts`

**Interfaces:**
- Produces: `routeApiRequest(request: Request, env: Env): Promise<Response>`.
- Produces: shared `Env` with optional runtime-specific bindings.

- [ ] **Step 1: Write the failing router test**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { routeApiRequest } from "../lib/api-router";
import type { Env } from "../lib/types";

const baseEnv = (): Env => ({
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "public",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  SUBMISSION_FINGERPRINT_SECRET: "0123456789abcdef0123456789abcdef",
  GITHUB_DATA_REPOSITORY: "CodWasTaken/data",
  GITHUB_DATA_BRANCH: "main",
  GITHUB_HEAD_OWNER: "CodWasTaken",
  FORK_ONLY_MODE: "true",
});

test("shared API router preserves unknown-route JSON contract", async () => {
  const response = await routeApiRequest(
    new Request("https://next.example/api/does-not-exist"),
    baseEnv(),
  );
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    error: { code: "not_found", message: "API route not found." },
  });
});
```

- [ ] **Step 2: Run the focused test**

```bash
npx tsx --test worker/tests/runtime-adapters.test.ts
```

Expected: FAIL because `worker/lib/api-router.ts` does not exist.

- [ ] **Step 3: Extract the existing route dispatcher**

Move the API regexes and current `api()` function from `worker/index.ts` into `worker/lib/api-router.ts`. Export:

```ts
export async function routeApiRequest(
  request: Request,
  env: Env,
): Promise<Response> {
  // Copy the current dispatch branches exactly: submissions, reports,
  // listing state, auth/session, moderation queue/reports/moderators/bans,
  // rejected purge, publications, feature, submission detail/actions,
  // ban removal, report resolution, and the existing JSON 404/error mapping.
}
```

`worker/index.ts` becomes an adapter:

```ts
if (url.pathname.startsWith("/api/")) {
  return routeApiRequest(request, env);
}
```

Change `Env.ASSETS` to optional because it is Cloudflare-only:

```ts
ASSETS?: { fetch(request: Request): Promise<Response> };
```

Before serving assets in `worker/index.ts`:

```ts
if (!env.ASSETS) {
  return new Response("Static asset binding is unavailable.", { status: 503 });
}
return env.ASSETS.fetch(request);
```

- [ ] **Step 4: Run router and Worker tests**

```bash
npx tsx --test worker/tests/runtime-adapters.test.ts worker/tests/*.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add worker/index.ts worker/lib/api-router.ts worker/lib/types.ts worker/tests/runtime-adapters.test.ts
git commit -m "refactor(runtime): extract shared API router"
```

---

### Task 2: Make Request Metadata Runtime-Neutral

**Files:**
- Create: `worker/lib/request-metadata.ts`
- Modify: `worker/routes/public.ts`
- Modify: `worker/tests/runtime-adapters.test.ts`
- Modify: `worker/tests/public-api.test.ts`

**Interfaces:**
- Produces: `requestClientIp(request: Request): string | null`.
- Produces: `requestCountry(request: Request): string | null`.

- [ ] **Step 1: Add failing header tests**

```ts
import { requestClientIp, requestCountry } from "../lib/request-metadata";

test("Vercel headers provide client metadata", () => {
  const request = new Request("https://next.example/api/submissions", {
    headers: {
      "x-forwarded-for": "203.0.113.40",
      "x-vercel-ip-country": "PL",
    },
  });
  assert.equal(requestClientIp(request), "203.0.113.40");
  assert.equal(requestCountry(request), "PL");
});

test("Cloudflare headers remain supported", () => {
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

- [ ] **Step 2: Run and confirm missing-module failure**

```bash
npx tsx --test worker/tests/runtime-adapters.test.ts
```

- [ ] **Step 3: Implement portable metadata extraction**

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

Update `worker/routes/public.ts` `requestSignals()` to use these helpers. Remove application dependence on `request.cf?.country`.

- [ ] **Step 4: Run public API tests**

```bash
npx tsx --test worker/tests/runtime-adapters.test.ts worker/tests/public-api.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add worker/lib/request-metadata.ts worker/routes/public.ts worker/tests/runtime-adapters.test.ts worker/tests/public-api.test.ts
git commit -m "refactor(runtime): support Vercel request metadata"
```

---

### Task 3: Make GitHub Publication Explicitly Fork-Only

**Files:**
- Create: `worker/lib/github-targets.ts`
- Modify: `worker/lib/publication-github.ts`
- Modify: `worker/lib/types.ts`
- Modify: `worker/tests/publication.test.ts`
- Modify: `worker/tests/removal.test.ts`
- Test: `worker/tests/deployment.test.ts`

**Interfaces:**
- Produces: `GithubTargetConfig`.
- Produces: `githubTargetConfig(env: Env): GithubTargetConfig`.
- Produces: `assertForkOnlyRepository(repository: string, forkOnlyMode: string | undefined): void`.
- `publication-github.ts` functions consume `GithubTargetConfig` instead of module-level repository constants.

- [ ] **Step 1: Write failing fork guard tests**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  assertForkOnlyRepository,
  githubTargetConfig,
} from "../lib/github-targets";
import type { Env } from "../lib/types";

test("fork-only mode refuses original organization repositories", () => {
  assert.throws(
    () => assertForkOnlyRepository("PerkCommons/data", "true"),
    /fork-only/i,
  );
  assert.doesNotThrow(() =>
    assertForkOnlyRepository("CodWasTaken/data", "true"),
  );
});

test("fork target config resolves the CodWasTaken data repository", () => {
  const config = githubTargetConfig({
    GITHUB_DATA_REPOSITORY: "CodWasTaken/data",
    GITHUB_DATA_BRANCH: "main",
    GITHUB_HEAD_OWNER: "CodWasTaken",
    FORK_ONLY_MODE: "true",
  } as Env);
  assert.deepEqual(config, {
    dataRepository: "CodWasTaken/data",
    dataBranch: "main",
    headOwner: "CodWasTaken",
  });
});
```

- [ ] **Step 2: Run and confirm missing-module failure**

```bash
npx tsx --test worker/tests/deployment.test.ts
```

- [ ] **Step 3: Implement the independent target module**

```ts
import { RequestError } from "./http";
import type { Env } from "./types";

export interface GithubTargetConfig {
  dataRepository: string;
  dataBranch: string;
  headOwner: string;
}

export function assertForkOnlyRepository(
  repository: string,
  forkOnlyMode: string | undefined,
): void {
  if (forkOnlyMode === "true" && repository.toLowerCase().startsWith("perkcommons/")) {
    throw new RequestError(
      "Fork-only mode refused an original PerkCommons repository.",
      503,
      "fork_only_violation",
    );
  }
}

export function githubTargetConfig(env: Env): GithubTargetConfig {
  const dataRepository = env.GITHUB_DATA_REPOSITORY ?? "PerkCommons/data";
  const dataBranch = env.GITHUB_DATA_BRANCH ?? "main";
  const headOwner = env.GITHUB_HEAD_OWNER ?? dataRepository.split("/")[0] ?? "";
  assertForkOnlyRepository(dataRepository, env.FORK_ONLY_MODE);
  return { dataRepository, dataBranch, headOwner };
}
```

- [ ] **Step 4: Parameterize `publication-github.ts`**

Remove:

```ts
const DATA_REPOSITORY = "PerkCommons/data";
const SITE_REPOSITORY = "PerkCommons/site";
const DATA_BRANCH = "main";
```

Each data publication/removal/check/merge helper receives a `GithubTargetConfig`. Every `/repos/...` path uses `config.dataRepository`; base refs use `config.dataBranch`; open PR queries use `head=${config.headOwner}:${branch}`.

Keep the legacy `dispatchSiteDeployment()` helper isolated for Cloudflare compatibility, but make its site repository an explicit parameter rather than a hard-coded original repository.

- [ ] **Step 5: Update publication/removal tests**

Use this environment in GitHub mocks:

```ts
GITHUB_DATA_REPOSITORY: "CodWasTaken/data",
GITHUB_DATA_BRANCH: "main",
GITHUB_HEAD_OWNER: "CodWasTaken",
FORK_ONLY_MODE: "true",
```

Assert every write/check/merge request path contains `/repos/CodWasTaken/data/` and no emitted request contains `/repos/PerkCommons/`.

- [ ] **Step 6: Run tests**

```bash
npx tsx --test worker/tests/deployment.test.ts worker/tests/publication.test.ts worker/tests/removal.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add worker/lib/github-targets.ts worker/lib/publication-github.ts worker/lib/types.ts worker/tests/deployment.test.ts worker/tests/publication.test.ts worker/tests/removal.test.ts
git commit -m "fix(publication): enforce fork-only GitHub targets"
```

---

### Task 4: Add Vercel Rebuild Dispatch

**Files:**
- Create: `worker/lib/deployment.ts`
- Modify: `worker/lib/publication.ts`
- Modify: `worker/lib/removal.ts`
- Modify: `worker/lib/types.ts`
- Modify: `worker/tests/deployment.test.ts`
- Modify: `worker/tests/publication.test.ts`
- Modify: `worker/tests/removal.test.ts`

**Interfaces:**
- Produces: `siteDeploymentConfigured(env: Env): boolean`.
- Produces: `requestSiteDeployment(env: Env): Promise<void>`.

- [ ] **Step 1: Write failing deploy-hook tests**

```ts
import {
  requestSiteDeployment,
  siteDeploymentConfigured,
} from "../lib/deployment";

test("a Vercel deploy hook configures site deployment", () => {
  assert.equal(
    siteDeploymentConfigured({
      VERCEL_DEPLOY_HOOK_URL: "https://api.vercel.com/v1/integrations/deploy/test",
    } as Env),
    true,
  );
});
```

Mock global `fetch`, call `requestSiteDeployment()`, and assert a single `POST` to the exact hook URL with no secret-bearing response body/log output.

- [ ] **Step 2: Run and confirm missing-module failure**

```bash
npx tsx --test worker/tests/deployment.test.ts
```

- [ ] **Step 3: Implement deployment transport**

```ts
import { RequestError } from "./http";
import { dispatchSiteDeployment } from "./publication-github";
import type { Env } from "./types";

export const siteDeploymentConfigured = (env: Env): boolean =>
  Boolean(env.VERCEL_DEPLOY_HOOK_URL || env.GITHUB_SITE_DEPLOY_TOKEN);

export async function requestSiteDeployment(env: Env): Promise<void> {
  if (env.VERCEL_DEPLOY_HOOK_URL) {
    const response = await fetch(env.VERCEL_DEPLOY_HOOK_URL, {
      method: "POST",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new RequestError(
        "The Vercel deployment request failed.",
        502,
        "deployment_request_failed",
      );
    }
    return;
  }

  if (env.GITHUB_SITE_DEPLOY_TOKEN && env.GITHUB_SITE_REPOSITORY) {
    await dispatchSiteDeployment(
      env.GITHUB_SITE_DEPLOY_TOKEN,
      env.GITHUB_SITE_REPOSITORY,
    );
    return;
  }

  throw new RequestError(
    "Automated site deployment is not configured.",
    503,
    "deployment_not_configured",
  );
}
```

Add `GITHUB_SITE_REPOSITORY?: string` and `VERCEL_DEPLOY_HOOK_URL?: string` to `Env`.

- [ ] **Step 4: Route publication/removal through the abstraction**

In `publication.ts`, replace the current two-token requirement with:

```ts
if (!env.GITHUB_DATA_PUBLICATION_TOKEN || !siteDeploymentConfigured(env)) {
  throw new RequestError(
    "Automated publication is not configured.",
    503,
    "publication_not_configured",
  );
}
```

Use `githubTargetConfig(env)` for every GitHub helper call and `requestSiteDeployment(env)` after finalization.

In `removal.ts`, use the same target config and deployment abstraction; reconciliation must not require `GITHUB_SITE_DEPLOY_TOKEN` when `VERCEL_DEPLOY_HOOK_URL` exists.

- [ ] **Step 5: Run deployment/publication/removal tests**

```bash
npx tsx --test worker/tests/deployment.test.ts worker/tests/publication.test.ts worker/tests/removal.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add worker/lib/deployment.ts worker/lib/publication.ts worker/lib/removal.ts worker/lib/types.ts worker/tests/deployment.test.ts worker/tests/publication.test.ts worker/tests/removal.test.ts
git commit -m "feat(deploy): trigger Vercel rebuilds after publication"
```

---

### Task 5: Add the Vercel API Runtime Adapter

**Files:**
- Create: `vercel/runtime-env.ts`
- Create: `api/[...path].ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.env.example`
- Modify: `worker/tests/runtime-adapters.test.ts`

**Interfaces:**
- Produces: `vercelEnv(source?: NodeJS.ProcessEnv): Env`.
- Produces a catch-all Node Function forwarding `/api/*` to `routeApiRequest()`.

- [ ] **Step 1: Add Vercel runtime dependencies**

```bash
npm install @vercel/node @vercel/functions
```

- [ ] **Step 2: Add failing environment tests**

```ts
import { vercelEnv } from "../../vercel/runtime-env";

test("Vercel environment requires server Supabase values", () => {
  assert.throws(() => vercelEnv({ VERCEL: "1" }), /SUPABASE_URL/);
});

test("Vercel adapter always enables fork-only mode", () => {
  const result = vercelEnv({
    VERCEL: "1",
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "public",
    SUPABASE_SERVICE_ROLE_KEY: "service",
    SUBMISSION_FINGERPRINT_SECRET: "0123456789abcdef0123456789abcdef",
  });
  assert.equal(result.GITHUB_DATA_REPOSITORY, "CodWasTaken/data");
  assert.equal(result.GITHUB_DATA_BRANCH, "main");
  assert.equal(result.GITHUB_HEAD_OWNER, "CodWasTaken");
  assert.equal(result.FORK_ONLY_MODE, "true");
});
```

- [ ] **Step 3: Implement strict environment construction**

```ts
const required = (source: NodeJS.ProcessEnv, name: string): string => {
  const value = source[name]?.trim();
  if (!value) {
    throw new Error(`Missing required Vercel environment variable: ${name}`);
  }
  return value;
};
```

`vercelEnv()` requires `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUBMISSION_FINGERPRINT_SECRET`. It maps optional `TURNSTILE_SECRET_KEY`, `GITHUB_DATA_PUBLICATION_TOKEN`, `VERCEL_DEPLOY_HOOK_URL`, and `CRON_SECRET`. It forces:

```ts
GITHUB_DATA_REPOSITORY: "CodWasTaken/data",
GITHUB_DATA_BRANCH: "main",
GITHUB_HEAD_OWNER: "CodWasTaken",
FORK_ONLY_MODE: "true",
```

unless an explicitly supplied non-original fork value is validated by `githubTargetConfig()`.

- [ ] **Step 4: Implement the catch-all Node Function**

```ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { routeApiRequest } from "../worker/lib/api-router";
import { vercelEnv } from "../vercel/runtime-env";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const host = req.headers.host ?? process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (!host) {
    return res.status(400).json({
      error: { code: "invalid_host", message: "Request host is missing." },
    });
  }

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) value.forEach((item) => headers.append(key, item));
    else if (value !== undefined) headers.set(key, value);
  }

  const init: RequestInit = { method: req.method, headers };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = typeof req.body === "string"
      ? req.body
      : JSON.stringify(req.body ?? {});
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

- [ ] **Step 5: Document variable names only**

Append to `.env.example`:

```dotenv
# Vercel Next-development server runtime
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

- [ ] **Step 6: Run type/unit tests**

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

### Task 6: Preserve Tombstones and Moderator Route Protection

**Files:**
- Create: `middleware.ts`
- Create: `vercel.json`
- Modify: `worker/tests/runtime-adapters.test.ts`

**Interfaces:**
- Consumes: `vercelEnv()`, `isListingRemoved()`, `requireModerator()`.
- Produces: Vercel middleware for `/opportunities/:path*`, `/moderate`, and `/moderate/:path*`.

- [ ] **Step 1: Add a failing path parser test**

Middleware exports:

```ts
export const listingIdFromPath = (pathname: string): string | null => {
  const match = pathname.match(/^\/opportunities\/([a-z0-9-]+)\/?$/);
  return match?.[1] ?? null;
};
```

Tests:

```ts
test("listing path parser ignores the directory index", () => {
  assert.equal(listingIdFromPath("/opportunities/"), null);
});

test("listing path parser accepts one stable listing slug", () => {
  assert.equal(
    listingIdFromPath("/opportunities/example-grant/"),
    "example-grant",
  );
});
```

- [ ] **Step 2: Implement Vercel middleware**

Use `next` from `@vercel/functions`.

For a listing detail path, query `isListingRemoved(vercelEnv(), listingId)`. If removed, return the same HTTP 410 HTML body currently used by the Worker.

For `/moderate` and descendants, call `requireModerator(request, vercelEnv())`. On auth failure, redirect to `/moderator-login/` and set `next=/moderate/`.

For allowed requests, return `next()`.

Do not match `/api/*`.

- [ ] **Step 3: Create `vercel.json`**

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

Do not introduce a new CSP or HSTS value unless an existing tested project policy can be copied exactly; this runtime migration must not guess at a weaker or incompatible policy.

- [ ] **Step 4: Run checks**

```bash
npm run check
npm test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add middleware.ts vercel.json worker/tests/runtime-adapters.test.ts
git commit -m "feat(vercel): preserve protected routes"
```

---

### Task 7: Replace Worker Scheduling with Protected Vercel Cron

**Files:**
- Create: `api/cron/reconcile.ts`
- Modify: `vercel.json`
- Test: `worker/tests/vercel-cron.test.ts`

**Interfaces:**
- Produces: `authorizeCron(authorization: string | undefined, secret: string | undefined): boolean`.
- Produces: `runReconciliation(env: Env): Promise<void>` with publication-before-removal order.

- [ ] **Step 1: Write failing auth tests**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { authorizeCron } from "../../api/cron/reconcile";

test("cron rejects missing credentials", () => {
  assert.equal(authorizeCron(undefined, "secret"), false);
});

test("cron requires exact bearer secret", () => {
  assert.equal(authorizeCron("Bearer secret", "secret"), true);
  assert.equal(authorizeCron("Bearer wrong", "secret"), false);
});
```

- [ ] **Step 2: Run and confirm missing-module failure**

```bash
npx tsx --test worker/tests/vercel-cron.test.ts
```

- [ ] **Step 3: Implement protected reconciliation**

The handler must return 401 unless:

```ts
authorization === `Bearer ${process.env.CRON_SECRET}`
```

Then execute:

```ts
await reconcilePublicationBatches(env);
await reconcileListingRemovals(env);
```

On failure, log only `event`, reconciliation phase, and `error.name`, and return 500.

- [ ] **Step 4: Add the production cron definition**

Add to `vercel.json`:

```json
"crons": [
  {
    "path": "/api/cron/reconcile",
    "schedule": "*/2 * * * *"
  }
]
```

If the connected Vercel plan rejects a two-minute schedule, stop and report that plan limitation; do not silently change reconciliation semantics.

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

### Task 8: Make Vercel Builds Fork-Safe and Canonical-Safe

**Files:**
- Modify: `scripts/fetch-data.mjs`
- Modify: `astro.config.ts`

**Interfaces:**
- Vercel requires `PERKCOMMONS_DATA_REPOSITORY` and `PERKCOMMONS_DATA_REF`.
- Astro derives its `site` from the Vercel production URL when available.

- [ ] **Step 1: Fail closed on missing Vercel data source**

Before clone execution in `scripts/fetch-data.mjs`:

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

Retain the existing non-Vercel fallback only for local/legacy Cloudflare build paths.

- [ ] **Step 2: Generate correct Vercel canonicals/sitemap**

In `astro.config.ts`:

```ts
const vercelProductionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
const site =
  process.env.PUBLIC_SITE_URL?.trim() ??
  (vercelProductionHost
    ? `https://${vercelProductionHost}`
    : "https://perkcommons.com");
```

Pass `site` to `defineConfig()`.

- [ ] **Step 3: Run a Vercel-targeted build**

```bash
PERKCOMMONS_DATA_REPOSITORY=https://github.com/CodWasTaken/data.git \
PERKCOMMONS_DATA_REF=main \
VERCEL=1 \
VERCEL_PROJECT_PRODUCTION_URL=perkcommons-next-dev.vercel.app \
npm run build
```

Expected: Astro build and Pagefind succeed.

- [ ] **Step 4: Verify Trust/Privacy/About output and Vercel canonical**

```bash
test -f dist/index.html
test -f dist/trust/index.html
test -f dist/privacy/index.html
test -f dist/about/index.html
grep -R "perkcommons-next-dev.vercel.app" dist/sitemap* dist/*.html >/dev/null
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/fetch-data.mjs astro.config.ts
git commit -m "build(vercel): pin next-dev data and canonical URL"
```

---

### Task 9: Full Verification and Migration PR

**Files:** no planned new production files.

- [ ] **Step 1: Run the full test suite**

```bash
npm ci
npm test
```

Expected: all tests pass; zero Astro/TypeScript diagnostics.

- [ ] **Step 2: Run the Vercel-targeted build**

```bash
PERKCOMMONS_DATA_REPOSITORY=https://github.com/CodWasTaken/data.git \
PERKCOMMONS_DATA_REF=main \
VERCEL=1 \
VERCEL_PROJECT_PRODUCTION_URL=perkcommons-next-dev.vercel.app \
npm run build
```

Expected: PASS.

- [ ] **Step 3: Run browser coverage**

```bash
npm run test:browser
```

Expected: supported browser tests pass; only already-intentional skips remain.

- [ ] **Step 4: Scan the diff for forbidden write targets and committed secrets**

```bash
git diff main...HEAD -- . ':!package-lock.json' | grep -n "PerkCommons/data\|PerkCommons/site" || true
git diff main...HEAD | grep -nE "SUPABASE_SERVICE_ROLE_KEY=.+|SUBMISSION_FINGERPRINT_SECRET=.+|CRON_SECRET=.+|TURNSTILE_SECRET_KEY=.+|VERCEL_DEPLOY_HOOK_URL=https://" && exit 1 || true
```

Any remaining `PerkCommons/*` references must be a compatibility default outside Vercel fork-only execution, documentation naming a forbidden target, or a refusal test. No new request path may write to them.

- [ ] **Step 5: Open the migration PR**

Title:

```text
feat(vercel): migrate Next dev runtime
```

Body explicitly states:

```text
This PR changes only the CodWasTaken development fork. It does not deploy,
modify, route, or attach perkcommons.com, the original PerkCommons/*
repositories, the production Cloudflare Worker, or the existing Next-dev
Cloudflare rollback Worker.
```

- [ ] **Step 6: Review CI before merge**

Do not merge while code/test/build checks are red. If only artifact upload fails, inspect the job steps and separately verify that tests and build succeeded before classifying it as CI infrastructure noise.

---

### Task 10: Create the Isolated Vercel Project and Configure It

**Platform:** Vercel team `Cod's projects`.

**Interfaces:**
- Produces project `perkcommons-next-dev`.
- Production source: `CodWasTaken/site`, branch `main`.
- Produces generated `*.vercel.app` production URL.

- [ ] **Step 1: Create/link the Git-backed project**

Required project settings:

```text
Project: perkcommons-next-dev
Repository: CodWasTaken/site
Framework: Astro
Production branch: main
Build command: npm run build
Output directory: dist
Custom domains: none
```

If the connected Vercel tools cannot create/link a Git-backed project, stop at this exact step and report the connector limitation. Do not substitute the production PerkCommons project, a different account, or a custom domain.

- [ ] **Step 2: Set build-time fork variables**

Production values:

```text
PERKCOMMONS_DATA_REPOSITORY=https://github.com/CodWasTaken/data.git
PERKCOMMONS_DATA_REF=main
GITHUB_DATA_REPOSITORY=CodWasTaken/data
GITHUB_DATA_BRANCH=main
GITHUB_HEAD_OWNER=CodWasTaken
FORK_ONLY_MODE=true
```

- [ ] **Step 3: Set isolated public environment values**

Use the existing Next-dev Supabase/Turnstile values under:

```text
PUBLIC_SUPABASE_URL
PUBLIC_SUPABASE_PUBLISHABLE_KEY
PUBLIC_TURNSTILE_SITE_KEY
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
```

`SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` point to the same isolated project/public key as their `PUBLIC_*` counterparts.

- [ ] **Step 4: Set isolated server-only secrets**

Required names:

```text
SUPABASE_SERVICE_ROLE_KEY
SUBMISSION_FINGERPRINT_SECRET
TURNSTILE_SECRET_KEY
GITHUB_DATA_PUBLICATION_TOKEN
CRON_SECRET
```

Use only the existing isolated Next-dev values. If the connected tools cannot read/set these secret values, stop and report the missing variable names only. Never invent them or commit them.

- [ ] **Step 5: Create the data-rebuild Deploy Hook**

```text
Name: perkcommons-data-rebuild
Branch: main
```

Store the returned hook URL only as:

```text
VERCEL_DEPLOY_HOOK_URL
```

- [ ] **Step 6: Enable automatic `main` production deployments**

Confirm pushes to `CodWasTaken/site` `main` automatically create production deployments. Confirm `PerkCommons/site` is not connected.

---

### Task 11: First Vercel Production Deployment and Smoke Test

**Platform:** `perkcommons-next-dev`.

- [ ] **Step 1: Deploy merged `main` to Vercel production**

Wait until deployment status is `READY`. Record the deployment ID and generated production alias.

- [ ] **Step 2: Inspect build logs**

Require successful dependency install, tests/build if configured in the deployment pipeline, Astro generation, fork data fetch, and Pagefind generation. A build error blocks rollout.

- [ ] **Step 3: Smoke-test static pages**

Require HTTP 200 for:

```text
/
/opportunities/
/trust/
/privacy/
/about/
/moderator-login/
```

Require these markers:

```text
/trust/   -> Trust and transparency
/privacy/ -> A plain-language privacy notice.
/about/   -> operated by Cod from Poland
```

- [ ] **Step 4: Smoke-test protected routing**

Request `/moderate/` without a moderator cookie. Require redirect to `/moderator-login/` with `next=/moderate/`.

Fetch one known active listing and require 200. Do not create a fake removal merely to test 410 behavior.

- [ ] **Step 5: Smoke-test API safety without creating real records**

Require `/api/does-not-exist` to return the existing JSON 404 contract. Send an invalid content type to `/api/submissions` and require 415. Do not submit a valid opportunity/report during smoke testing.

- [ ] **Step 6: Verify cron protection and execution**

Unauthenticated `/api/cron/reconcile` must return 401. Trigger the deployed cron through Vercel's cron tooling and require 200 without exposing `CRON_SECRET`.

- [ ] **Step 7: Inspect Vercel runtime errors**

Check deployment runtime errors/logs after smoke traffic. Require no unexplained 5xx cluster.

- [ ] **Step 8: Confirm Cloudflare rollback remains unchanged**

Fetch:

```text
https://perkcommons-next-fork-dev.cod3eater.workers.dev
```

Do not deploy, update, delete, or attach this Worker. Its continued availability is the rollback proof.

- [ ] **Step 9: Completion report**

Report exact values for:

```text
Vercel project name
Vercel production URL
Vercel deployment ID
GitHub migration PR URL
Merged commit SHA
Cloudflare rollback URL
```

Do not claim the migration is complete until the Vercel deployment is `READY` and all smoke tests above pass.
