# Site Quality and Security Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve or reproducibly classify the 19 reported site-quality findings while hardening the Astro/Worker rendering boundary against injection and establishing Vercel-effective security headers.

**Architecture:** Keep the site static-first. Centralize SEO/JSON-LD generation in a small pure helper, generate environment-dependent static artifacts after Astro build, add a branded 404 and raster social card, and add build audits that fail on regressions. Preserve the current Worker validation and add explicit XSS/dangerous-sink tests instead of introducing sanitization libraries where normal escaping is sufficient.

**Tech Stack:** Astro 7, TypeScript 6, Node test runner via tsx, Playwright, Vercel static hosting, Cloudflare Worker, existing Tailwind CSS.

## Global Constraints

- Work only in `CodWasTaken/site@next/foundation` paired with `CodWasTaken/data@next/schema-v2`.
- Do not modify official `PerkCommons/*` repositories, production Cloudflare routes, production Supabase, or `perkcommons.com` deployment.
- No React runtime.
- Preserve static-first rendering and lazy search.
- User-controlled data is untrusted at intake, moderation, publication, Astro rendering, JSON-LD, email, and export boundaries.
- Do not weaken CSP to make third-party scripts work.
- The hosted verification target is the isolated Next Vercel deployment once its project identity is visible again.

---

## File Structure

- `src/lib/seo.ts` — pure canonical URL and safe JSON-LD serialization helpers.
- `src/layouts/BaseLayout.astro` — shared title/description/canonical/OpenGraph/JSON-LD shell using `seo.ts`.
- `src/pages/404.astro` — branded static 404 recovery page.
- `public/llms.txt` — concise AI-readable project/data/API provenance index.
- `public/brand/social-card.png` — 1200x630 raster social preview.
- `scripts/postbuild-site-assets.mjs` — generate deployment-aware `robots.txt` and `/sitemap.xml` compatibility copy after Astro sitemap generation.
- `scripts/audit-site-quality.mjs` — scan `dist/` for metadata, H1, map, JS-size, HTML-source, robots/sitemap and favicon failures.
- `scripts/audit-dangerous-sinks.mjs` — fail on unreviewed dynamic HTML/eval sinks in source.
- `tests/unit/seo.test.ts` — safe JSON-LD/canonical tests.
- `tests/unit/site-quality-audit.test.ts` — deterministic audit-fixture tests.
- `tests/unit/validation.test.ts` — expand unsafe URL/XSS-shaped payload validation cases.
- `tests/public-index.spec.ts` — hosted/browser checks for metadata, 404, source HTML, console and network errors.
- `public/_headers` — keep Cloudflare/static baseline aligned.
- `vercel.json` — Vercel-effective security headers for the static deployment.
- `package.json` — wire postbuild/audit scripts into checks.

### Task 1: Centralize environment-safe SEO and JSON-LD

**Files:**
- Create: `src/lib/seo.ts`
- Modify: `src/layouts/BaseLayout.astro`
- Test: `tests/unit/seo.test.ts`

**Interfaces:**
- Produces: `canonicalUrl(site: URL, pathname: string): URL`
- Produces: `safeJsonLd(value: unknown): string`
- Produces: `baseStructuredData(site: URL): unknown[]`

- [ ] **Step 1: Write failing helper tests**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { baseStructuredData, canonicalUrl, safeJsonLd } from "../../src/lib/seo";

test("canonicalUrl resolves against configured site origin", () => {
  assert.equal(canonicalUrl(new URL("https://next.example/"), "/about/").href, "https://next.example/about/");
});

test("safeJsonLd cannot close its script element", () => {
  const encoded = safeJsonLd({ name: "</script><script>alert(1)</script>\u2028" });
  assert.equal(encoded.includes("</script>"), false);
  assert.equal(JSON.parse(encoded).name, "</script><script>alert(1)</script>\u2028");
});

test("base structured data uses the configured origin", () => {
  const json = JSON.stringify(baseStructuredData(new URL("https://next.example/")));
  assert.match(json, /https:\/\/next\.example/);
  assert.doesNotMatch(json, /https:\/\/perkcommons\.com/);
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx tsx --test tests/unit/seo.test.ts`
Expected: FAIL because `src/lib/seo.ts` does not exist.

- [ ] **Step 3: Implement the helpers**

```ts
export const canonicalUrl = (site: URL, pathname: string) => new URL(pathname, site);

export const safeJsonLd = (value: unknown): string => JSON.stringify(value)
  .replace(/</g, "\\u003c")
  .replace(/\u2028/g, "\\u2028")
  .replace(/\u2029/g, "\\u2029");

export const baseStructuredData = (site: URL) => {
  const origin = site.href.replace(/\/$/, "");
  return [
    { "@context": "https://schema.org", "@type": "Organization", name: "PerkCommons", url: origin, logo: `${origin}/brand/mark.svg` },
    { "@context": "https://schema.org", "@type": "WebSite", name: "PerkCommons", url: origin, potentialAction: { "@type": "SearchAction", target: `${origin}/opportunities/?q={search_term_string}`, "query-input": "required name=search_term_string" } },
  ];
};
```

Update `BaseLayout.astro` to use `canonicalUrl(Astro.site, Astro.url.pathname)`, `safeJsonLd(baseStructuredData(Astro.site))`, `twitter:card="summary_large_image"`, and `/brand/social-card.png` for OG/Twitter image metadata. Keep required `title` and `description` props.

- [ ] **Step 4: Run tests and type checks**

Run: `npx tsx --test tests/unit/seo.test.ts && npx astro check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/seo.ts src/layouts/BaseLayout.astro tests/unit/seo.test.ts
git commit -m "fix(seo): make metadata origin safe"
```

### Task 2: Add 404, llms.txt, and deployment-aware robots/sitemap compatibility

**Files:**
- Create: `src/pages/404.astro`
- Create: `public/llms.txt`
- Create: `scripts/postbuild-site-assets.mjs`
- Delete: `public/robots.txt`
- Modify: `package.json`
- Test: `tests/unit/site-quality-audit.test.ts`

**Interfaces:**
- `postbuild-site-assets.mjs` reads `PUBLIC_SITE_URL`, then `VERCEL_PROJECT_PRODUCTION_URL`, then the same fallback used in `astro.config.ts`.
- Produces `dist/robots.txt` containing `User-agent: *`, `Allow: /`, and the resolved `/sitemap.xml` URL.
- Produces `dist/sitemap.xml` as a byte-for-byte compatibility copy of `dist/sitemap-index.xml`.

- [ ] **Step 1: Add failing artifact-generation fixture test**

Create a temporary directory containing `sitemap-index.xml`, run the generator with `PUBLIC_SITE_URL=https://preview.example`, and assert `robots.txt` and `sitemap.xml` are generated with the preview origin.

- [ ] **Step 2: Verify failure**

Run: `npx tsx --test tests/unit/site-quality-audit.test.ts`
Expected: FAIL because the postbuild generator is absent.

- [ ] **Step 3: Implement the generator and pages**

`404.astro` must use `BaseLayout` with `noindex`, exactly one H1, links to `/opportunities/`, `/categories/`, and `/`.

`public/llms.txt` must name PerkCommons Next as an experimental fork, point to `/about/`, `/data/opportunities.json`, `/api/v1/opportunities`, `/openapi.json`, and the experimental GitHub source/data repositories; it must not claim AI training permission or legal rights beyond public reuse terms.

`postbuild-site-assets.mjs` must refuse to write a sitemap URL with a non-HTTPS origin except localhost test fixtures.

Update build script to: `astro check && astro build && node scripts/postbuild-site-assets.mjs && pagefind --site dist`.

- [ ] **Step 4: Build and verify**

Run: `npm run build`
Expected: `dist/404/index.html`, `dist/llms.txt`, `dist/robots.txt`, `dist/sitemap.xml`, and `dist/sitemap-index.xml` exist.

- [ ] **Step 5: Commit**

```bash
git add src/pages/404.astro public/llms.txt scripts/postbuild-site-assets.mjs package.json tests/unit/site-quality-audit.test.ts
git rm public/robots.txt
git commit -m "fix(site): add crawler and 404 artifacts"
```

### Task 3: Add the raster social card

**Files:**
- Create: `public/brand/social-card.png`
- Test: `scripts/audit-site-quality.mjs`

- [ ] **Step 1: Generate a 1200x630 branded social card**

Use the existing PerkCommons visual language: clean off-white/dark-compatible neutral field, PerkCommons mark, wordmark, and the line `Open data. Evidence-led review.` Avoid small text and decorative claims.

- [ ] **Step 2: Verify dimensions**

Run: `node -e "const fs=require('fs'); const b=fs.readFileSync('public/brand/social-card.png'); if(!b.length) process.exit(1)"`
Expected: exit 0; the site-quality audit added in Task 4 will verify dimensions through its PNG header parser.

- [ ] **Step 3: Commit**

```bash
git add public/brand/social-card.png
git commit -m "feat(brand): add social preview card"
```

### Task 4: Build a deterministic 19-item site-quality audit

**Files:**
- Create: `scripts/audit-site-quality.mjs`
- Modify: `tests/unit/site-quality-audit.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces `auditDist(root): { errors: string[]; metrics: { jsBytes: number; largestJsBytes: number } }`.
- HTML routes exclude JSON/XML/text/API assets from H1 checks.

- [ ] **Step 1: Write failing fixtures**

Fixtures must prove the audit rejects: empty HTML shell, missing/duplicate title, missing description/canonical/lang/favicon/og:image/JSON-LD, zero or multiple H1, exposed `.map`, missing robots/sitemap/llms, and a JS file over the chosen baseline budget.

- [ ] **Step 2: Verify failure**

Run: `npx tsx --test tests/unit/site-quality-audit.test.ts`
Expected: FAIL because `auditDist` is absent.

- [ ] **Step 3: Implement audit**

Use Node built-ins only. Parse generated HTML with conservative regex/string checks; this is a build artifact guard, not a browser DOM parser. Read the PNG IHDR bytes and require 1200x630. Set initial JS budget only after measuring the clean build; encode `largestJsBytes <= max(150_000, baselineLargestJsBytes * 1.10)` in a checked-in JSON baseline file created from the current cleaned build.

Add scripts:

```json
"audit:site": "node scripts/audit-site-quality.mjs dist",
"check": "node scripts/sync-taxonomy.mjs --check && node scripts/build-greenfield-migration.mjs --check && npm run worker:types:check && astro check && tsc --noEmit && tsc -p worker/tsconfig.json --noEmit && tsc -p worker/tests/tsconfig.json --noEmit && npm run audit:sinks",
"postbuild:audit": "npm run audit:site"
```

Do not make `check` require `dist`; run `audit:site` after `build` in CI.

- [ ] **Step 4: Run clean build/audit**

Run: `npm run build && npm run audit:site`
Expected: PASS with printed JS metrics.

- [ ] **Step 5: Commit**

```bash
git add scripts/audit-site-quality.mjs tests/unit/site-quality-audit.test.ts package.json docs/site-quality-baseline.json
git commit -m "test(site): enforce quality audit"
```

### Task 5: Add dangerous-sink and XSS regression coverage

**Files:**
- Create: `scripts/audit-dangerous-sinks.mjs`
- Modify: `tests/unit/validation.test.ts`
- Modify: `tests/moderation.spec.ts`
- Modify: `package.json`

**Interfaces:**
- Sink scanner rejects `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `eval(`, `new Function`, and `set:html` outside an allowlist containing only the reviewed static JSON-LD call in `BaseLayout.astro`.

- [ ] **Step 1: Expand validation tests**

Add cases proving `safeHttpsUrl` rejects `javascript:alert(1)`, `data:text/html,...`, URLs with usernames/passwords, and malformed encoded schemes while ordinary text fields may contain literal `<script>` text because output encoding—not destructive input sanitization—is the security boundary.

- [ ] **Step 2: Add browser payload test**

In `tests/moderation.spec.ts`, enter `<img src=x onerror=window.__xss=1>` and `</script><script>window.__xss=1</script>` into previewed text fields. Assert the literal text is visible, no injected `img`/`script` exists in the preview, and `window.__xss` is undefined.

- [ ] **Step 3: Implement sink scanner**

Walk `src/` and `worker/` `.ts/.astro/.js` files. Fail with file/line for forbidden sinks. Permit the single `set:html={safeJsonLd(...)}` reviewed call by exact file+substring allowlist.

- [ ] **Step 4: Run tests**

Run: `npm run test:unit && npm run audit:sinks`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/audit-dangerous-sinks.mjs tests/unit/validation.test.ts tests/moderation.spec.ts package.json
git commit -m "test(security): guard injection sinks"
```

### Task 6: Make security headers effective on Vercel

**Files:**
- Create: `vercel.json`
- Modify: `public/_headers`
- Test: `tests/unit/vercel-site-origin.test.ts`
- Test: `tests/public-index.spec.ts`

**Interfaces:**
- Vercel headers apply to `/(.*)`.
- Enforced CSP baseline: `base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'` plus existing HSTS/nosniff/referrer/permissions policies.
- Detailed script/connect policy remains `Content-Security-Policy-Report-Only` until analytics/Turnstile origins are finalized.

- [ ] **Step 1: Add failing config test**

Read `vercel.json` and assert it contains the enforced baseline CSP and the same non-CSP security headers as `public/_headers`.

- [ ] **Step 2: Verify failure**

Run: `npx tsx --test tests/unit/vercel-site-origin.test.ts`
Expected: FAIL because `vercel.json` is absent.

- [ ] **Step 3: Add Vercel headers**

Use Vercel `headers` config; do not add a catch-all rewrite that would interfere with static files. Keep `public/_headers` for the isolated Worker/static-asset path.

- [ ] **Step 4: Add hosted header assertions**

Extend Playwright request checks so homepage and 404 responses contain `x-content-type-options`, `referrer-policy`, `permissions-policy`, and CSP headers when run against a deployed base URL.

- [ ] **Step 5: Commit**

```bash
git add vercel.json public/_headers tests/unit/vercel-site-origin.test.ts tests/public-index.spec.ts
git commit -m "fix(security): enforce Vercel headers"
```

### Task 7: Fail browser tests on console/page/resource regressions

**Files:**
- Modify: `tests/public-index.spec.ts`

- [ ] **Step 1: Add shared error collectors**

For representative homepage, opportunities index/detail, category, about, privacy and 404 routes, register `page.on("console")`, `page.on("pageerror")`, and `page.on("requestfailed")`. Ignore only explicitly documented third-party failures in tests that deliberately block those resources.

- [ ] **Step 2: Add source-HTML assertion**

Use Playwright request context to fetch representative routes and assert HTML includes a non-empty `<main`, `<h1`, title, meta description and canonical before any browser JS executes.

- [ ] **Step 3: Run browser suite**

Run: `npm run build && npm run test:browser`
Expected: existing tests plus new checks pass on desktop/mobile projects.

- [ ] **Step 4: Commit**

```bash
git add tests/public-index.spec.ts
git commit -m "test(browser): fail on runtime regressions"
```

### Task 8: Full cycle verification

- [ ] **Step 1:** `npm ci`
- [ ] **Step 2:** `npm run check`
- [ ] **Step 3:** `npm test`
- [ ] **Step 4:** `npm run build && npm run audit:site`
- [ ] **Step 5:** `npm run test:browser`
- [ ] **Step 6:** inspect `dist` for `.map` files and exact generated sitemap/robots content.
- [ ] **Step 7:** verify no official repository or production deployment reference was introduced.
- [ ] **Step 8:** commit only if verification required a test/baseline correction, then re-run the affected command.
