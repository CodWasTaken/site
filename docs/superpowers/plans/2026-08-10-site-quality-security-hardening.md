# PerkCommons Next site-quality and security-hardening implementation plan

**Date:** 2026-08-10
**Parent design:** `docs/superpowers/specs/2026-08-10-trust-compliance-security-design.md`
**Scope:** Cycle 1 of 4 — site-quality fixes plus injection/CSP hardening
**Target:** `CodWasTaken/site@next/foundation`, isolated Vercel Next-dev only

## Goal

Turn the scanner/security concerns into reproducible tests and fix the confirmed issues without adding newsletter, analytics-consent, or legal-database behavior yet. Preserve Astro's static-first architecture, the existing moderation boundary, and all fork/production safety constraints.

## Safety boundary

- Modify only `CodWasTaken/site` on a feature branch created from the approved `next/foundation` head.
- Do not modify official `PerkCommons/*` repositories.
- Do not alter the production Cloudflare Worker, production Supabase, or `perkcommons.com` deployment.
- Do not create or replace a Vercel project while the connected Vercel account cannot resolve the previously verified Next-dev project.
- Hosted verification happens only after the connector resolves the intended isolated project/deployment identity.

## Task 1 — Establish failing site-quality/security checks

**Files:**
- Create `scripts/check-site-quality.mjs`
- Create `scripts/check-dangerous-sinks.mjs`
- Update `package.json`
- Add focused tests under the repository's existing `tests/unit/` and Playwright test directories, following the current naming/layout conventions

**Test-first requirements:**

1. Add a build-artifact checker that fails when an indexable HTML page has:
   - missing/empty `<title>`;
   - missing/empty meta description;
   - missing canonical;
   - missing `lang="en"`;
   - zero or more than one `<h1>`;
   - missing favicon reference;
   - missing Open Graph image;
   - Vite dev-client markers;
   - exposed `.map` assets.
2. Report duplicate titles for distinct indexable HTML routes, allowing explicit documented exceptions only when semantically justified.
3. Record production JavaScript/search-asset sizes and enforce a regression budget based on the cleaned baseline rather than an invented scanner threshold.
4. Add a source scanner that fails on unsafe user-data sinks (`innerHTML`, `outerHTML`, `insertAdjacentHTML`, `eval`, dynamic `Function`) and on unreviewed `set:html` usage.
5. Wire the checks into `npm run check` or a dedicated command invoked by `npm test`/CI.

**Commands:**

```bash
npm ci
npm run build
npm run check:site-quality
npm run check:dangerous-sinks
```

The new checks should fail against the pre-fix fixture/baseline for confirmed weaknesses before implementation changes make them pass.

**Commit:** `test(next): add site quality and sink regression checks`

## Task 2 — Make shared SEO metadata deployment-aware and injection-safe

**Files:**
- Create `src/lib/seo.ts`
- Update `src/layouts/BaseLayout.astro`
- Add/update unit tests for SEO serialization
- Add `public/og-default.png`

**Test-first requirements:**

1. Add tests for a JSON-LD serializer containing payloads such as `</script><script>alert(1)</script>`, `<`, `>`, `&`, U+2028, and U+2029; serialized output must remain valid JSON and must not contain a literal script-closing sequence capable of escaping the script block.
2. Add tests/fixture checks that canonical, Organization/WebSite URLs, logo/search target, and Open Graph URLs resolve from the configured `Astro.site` origin instead of hardcoded `perkcommons.com`.
3. Add checks that the default social image is a raster 1200×630 asset and that both Open Graph and Twitter metadata reference it.

**Implementation:**

- Centralize JSON-LD serialization in `src/lib/seo.ts`.
- Keep shared structured data truthful and minimal; do not add unsupported organization/business claims.
- Replace the SVG wordmark social preview with a deterministic branded `public/og-default.png` (1200×630) derived from existing PerkCommons brand assets.
- Use `summary_large_image` and provide `twitter:image`.
- Keep `<title>`, description, canonical, favicon, and `lang="en"` in the shared layout.

**Commands:**

```bash
npm run test:unit
npm run build
npm run check:site-quality
npm run check:dangerous-sinks
```

**Commit:** `fix(next): harden deployment-aware SEO metadata`

## Task 3 — Add 404, environment-aware robots/LLM discovery, and sitemap compatibility

**Files:**
- Create `src/pages/404.astro`
- Replace `public/robots.txt` with a build-time Astro endpoint such as `src/pages/robots.txt.ts`
- Create a build-time `src/pages/llms.txt.ts`
- Create `scripts/postbuild-site.mjs`
- Update `package.json`
- Update `astro.config.ts` only if required by the verified sitemap output

**Test-first requirements:**

1. A representative unknown route must resolve to a branded 404 page with one H1, useful recovery links, and `noindex` metadata.
2. `robots.txt` must retain `User-agent: *` + `Allow: /` and reference the current configured deployment origin, not hardcoded production.
3. `llms.txt` must describe PerkCommons, provenance, and canonical public entry points using the configured site origin.
4. Preserve Astro's canonical generated sitemap index. If `/sitemap.xml` compatibility is needed, create it deterministically after `astro build` by copying the valid generated sitemap index rather than maintaining duplicate URL data by hand.

**Implementation notes:**

- Do not enumerate vendor-specific AI bots. Wildcard `Allow: /` already permits them.
- Keep moderator/private routes excluded from sitemap output.
- The postbuild compatibility step must fail loudly if the expected generated sitemap source is absent.

**Commands:**

```bash
npm run build
npm run check:site-quality
npm run test:browser
```

**Commit:** `fix(next): add resilient discovery and 404 surfaces`

## Task 4 — Enforce Vercel security headers without weakening the existing Worker policy

**Files:**
- Create/update `vercel.json`
- Update `public/_headers`
- Add header-config tests/checks

**Test-first requirements:**

1. Verify the Vercel configuration actually emits the intended headers; do not assume `public/_headers` is interpreted by Vercel.
2. Enforce an immediate structural CSP baseline at minimum for `base-uri 'self'`, `object-src 'none'`, `frame-ancestors 'none'`, and `form-action 'self'`.
3. Retain the detailed full policy in report-only form while inline scripts are being removed/migrated.
4. Preserve Referrer-Policy, Permissions-Policy, X-Content-Type-Options, HSTS, and COOP.
5. Keep Cloudflare/static fallback headers aligned enough that the Vercel and Worker/static paths do not contradict one another.

**Implementation notes:**

- Do not add Google Analytics origins yet; analytics is cycle 3 and remains disabled.
- Do not weaken CSP for Turnstile beyond the origins already required by the existing submission flow.

**Commands:**

```bash
npm run test:unit
npm run check
```

**Commit:** `fix(next): enforce baseline security headers on Vercel`

## Task 5 — Add XSS and unsafe-URL regression coverage across public submission rendering

**Files:**
- Update `worker/lib/validation.ts` only if tests reveal a real gap
- Update `src/pages/submit.astro` only if tests reveal a real gap
- Update moderator/publication code only where tests demonstrate an unsafe sink
- Add unit and Playwright fixtures/tests using the project's existing test structure

**Payload corpus:**

- `<script>alert(1)</script>`
- `</script><script>alert(1)</script>`
- `<img src=x onerror=alert(1)>`
- SVG/event-handler payloads
- `javascript:alert(1)` and encoded executable-scheme variants
- quotes, angle brackets, ampersands, and template-looking strings
- payloads in public listing fields and moderator-only notes

**Test-first requirements:**

1. Public text payloads may be stored as data where valid, but preview/public rendering must display them as text and never create executable nodes/handlers.
2. Submitted destination URLs must remain HTTPS-only with no credentials; executable schemes are rejected server-side.
3. Structured data remains parseable and cannot be escaped into executable markup.
4. Publication/moderator rendering cannot introduce an unsafe HTML sink.
5. Existing moderation-before-publication behavior remains unchanged.

**Commands:**

```bash
npm run test:unit
npm run test:browser
npm run check:dangerous-sinks
```

**Commit:** `test(next): lock down injection boundaries`

## Task 6 — Turn scanner items into hosted/browser acceptance tests

**Files:**
- Add/update Playwright site-quality smoke tests
- Update `scripts/check-site-quality.mjs` budgets/allowlists using the cleaned measured baseline
- Update CI workflow only if the new commands are not already covered by existing `npm test`/browser jobs

**Acceptance matrix:**

1. View source contains meaningful prerendered HTML.
2. Custom 404 works.
3. No React runtime/Vite dev client is shipped.
4. Titles are unique/descriptive.
5. Descriptions exist.
6. Raster `og:image` exists.
7. JSON-LD exists and uses correct origin.
8. No multiple H1 pages.
9. No zero-H1 indexable HTML pages.
10. Canonical is correct for deployment origin.
11. `llms.txt` exists.
12. `robots.txt` wildcard allows crawling and points to the correct sitemap.
13. Favicon exists.
14. Sitemap index plus `/sitemap.xml` compatibility both resolve.
15. `lang="en"` exists.
16. Meaningful images have alt text; decorative images may correctly use empty alt.
17. No public source maps.
18. Representative desktop/mobile pages produce no unexpected console/page errors or first-party failed requests.
19. Initial production JS/search assets remain within the recorded regression budget.

**Commands:**

```bash
npm ci
npm run check
npm test
npm run build
npm run check:site-quality
npm run check:dangerous-sinks
npm run test:browser
npm audit
```

Record unresolved development-tool-only advisories separately; do not label them runtime vulnerabilities without evidence.

**Commit:** `test(next): verify trust hardening acceptance matrix`

## Task 7 — GitHub review and isolated Vercel verification

**GitHub:**

1. Push only the feature branch in `CodWasTaken/site`.
2. Compare against `next/foundation` and inspect every changed file.
3. Run the full clean verification suite.
4. Merge/fast-forward only after verification is green.

**Vercel gate:**

1. Re-check `team_4PdJPHiTvOgLihuhr6w6pYAy` and resolve the existing Next-dev project identity.
2. Never create a replacement project merely because the connector lists zero projects.
3. Once the intended isolated project is positively identified, deploy the exact verified commit.
4. Verify the deployed commit/site data pairing, representative routes, response headers, metadata, sitemap/robots/llms, console/network behavior, and source-map absence.
5. Do not change `perkcommons.com` or any production alias.

If the connector still cannot see the intended project after code verification, stop at the deployment gate and report the exact connector limitation while leaving the verified GitHub branch ready to deploy.

## Cycle-1 done criteria

Cycle 1 is complete only when the clean local/CI suite passes, the diff has been reviewed, the 19 scanner concerns are either fixed or reproducibly classified as false positives, injection regressions are locked down, Vercel-specific headers are configured, and the isolated hosted Next-dev verification passes—or the only remaining blocker is explicitly the Vercel connector/project-identity issue with no unsafe replacement deployment attempted.
