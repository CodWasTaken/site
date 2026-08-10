# Newsletter, Resend, and Supabase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a double-opt-in, category-based daily/weekly digest system with separate site-update consent, passwordless preference management, immediate unsubscribe/suppression, and authenticated outbound delivery through Resend.

**Architecture:** Supabase stores subscriber state, preferences, consent events, hashed tokens, suppressions and send jobs. The existing Worker owns all mutation endpoints and scheduled digest execution. Astro serves static signup/confirm/manage pages that call same-origin Worker routes through the isolated deployment boundary. Raw tokens never persist server-side; raw email is minimized and durable suppression uses a keyed fingerprint.

**Tech Stack:** Astro, TypeScript, Cloudflare Worker scheduled handler, Supabase/PostgREST, Resend HTTPS API, Node tests, Playwright.

## Global Constraints

- Sender: `PerkCommons <updates@perkcommons.com>`.
- Reply-To: `hello@perkcommons.com`.
- Double opt-in is mandatory.
- Category digest and site updates are independent consent streams.
- Digest frequency: user-selectable `daily` or `weekly`.
- No subscriber account/password.
- Manage/unsubscribe links use opaque high-entropy tokens; stored only as keyed hashes.
- GET must never confirm a subscription or mutate preferences.
- Unsubscribe from all must be available and prioritized for reliability.
- Suppression survives profile deletion/reimport so accidental re-mailing cannot occur.
- No paid subscription/billing work.
- Resolve SPF/DKIM/DMARC and physical-address legal requirements before real promotional delivery.

---

## File Structure

- `supabase/migrations/202608100002_newsletter.sql` — subscribers/preferences/consent/tokens/suppressions/send jobs with RLS.
- `supabase/greenfield/00000000000000_perkcommons_fork.sql` — regenerated baseline.
- `worker/lib/newsletter-types.ts` — newsletter domain types.
- `worker/lib/newsletter-token.ts` — token generation/hash/verification purpose separation.
- `worker/lib/newsletter-email.ts` — escaped HTML/text renderers and headers.
- `worker/lib/resend.ts` — minimal Resend API client.
- `worker/lib/newsletter.ts` — subscriber state transitions and digest selection/idempotency.
- `worker/routes/newsletter.ts` — signup/confirm/preferences/unsubscribe endpoints and Resend webhook.
- `worker/index.ts` — route dispatch + scheduled digest reconciliation.
- `worker/lib/types.ts` / `worker-configuration.d.ts` / Wrangler config — required secrets/config bindings.
- `src/pages/newsletter/index.astro` — signup UI.
- `src/pages/newsletter/confirm.astro` — scanner-safe confirmation page with explicit POST button.
- `src/pages/newsletter/manage.astro` — passwordless preference UI.
- `src/pages/newsletter/unsubscribe.astro` — explicit stream/all unsubscribe page.
- `src/layouts/BaseLayout.astro` — newsletter entry point in footer.
- `.env.example` / `.dev.vars.dev.example` — documented non-secret names only.
- `tests/unit/newsletter-token.test.ts`
- `tests/unit/newsletter-state.test.ts`
- `tests/unit/newsletter-email.test.ts`
- `worker/tests/newsletter.test.ts`
- `tests/public-index.spec.ts`

### Task 1: Add newsletter database schema

**Files:**
- Create: `supabase/migrations/202608100002_newsletter.sql`
- Regenerate: `supabase/greenfield/00000000000000_perkcommons_fork.sql`
- Modify: `tests/unit/migration-contract.test.ts`
- Modify: `tests/unit/greenfield-migration.test.ts`

**Interfaces:**

Tables:

```text
newsletter_subscribers(id uuid pk, email citext/text unique, state pending|confirmed|unsubscribed, frequency daily|weekly, confirmed_at, last_digest_at, created_at, updated_at)
newsletter_category_preferences(subscriber_id, category_id, active, updated_at; unique subscriber/category)
newsletter_stream_preferences(subscriber_id, stream opportunity_digest|site_updates, active, updated_at; unique subscriber/stream)
newsletter_consent_events(id, subscriber_id nullable, event_type, policy_version, wording_version, stream, occurred_at, request_country_code, request_ip_hash)
newsletter_tokens(id, subscriber_id, purpose confirm|manage|unsubscribe, token_hash unique, expires_at, used_at, created_at)
newsletter_suppressions(email_hash pk, reason unsubscribe|bounce|complaint|admin, created_at, cleared_at nullable)
newsletter_send_jobs(id, subscriber_id, kind digest|site_update, period_key, idempotency_key unique, status pending|sending|sent|failed|suppressed, resend_id, attempts, last_error, created_at, sent_at)
```

- [ ] **Step 1: Add failing schema assertions**

Require RLS on every newsletter table, no anon/authenticated direct grants, unique email/suppression/idempotency constraints, token expiry/use fields, and indexes for confirmed/state/frequency/last_digest_at and pending send jobs.

- [ ] **Step 2: Run migration contract tests**

Run: `npx tsx --test tests/unit/migration-contract.test.ts`
Expected: FAIL because schema is absent.

- [ ] **Step 3: Write migration**

Use `lower(email)` unique index if `citext` is not already guaranteed. Add check constraints rather than new Postgres enums unless current schema conventions favor enums. Subscriber delete cascades preferences/tokens/jobs/consent events where legally appropriate, but suppression records are independent and keyed only by HMAC/hash.

- [ ] **Step 4: Regenerate greenfield baseline**

Run: `npm run greenfield:generate && npm run greenfield:check`.

- [ ] **Step 5: Run tests and commit**

```bash
npx tsx --test tests/unit/migration-contract.test.ts tests/unit/greenfield-migration.test.ts
git add supabase/migrations/202608100002_newsletter.sql supabase/greenfield/00000000000000_perkcommons_fork.sql tests/unit
git commit -m "feat(newsletter): add consent and delivery schema"
```

### Task 2: Add token and request validation primitives

**Files:**
- Create: `worker/lib/newsletter-types.ts`
- Create: `worker/lib/newsletter-token.ts`
- Create: `tests/unit/newsletter-token.test.ts`
- Modify: `worker/lib/validation.ts`
- Modify: `worker/lib/types.ts`

**Interfaces:**

```ts
export type DigestFrequency = "daily" | "weekly";
export type NewsletterStream = "opportunity_digest" | "site_updates";
export type TokenPurpose = "confirm" | "manage" | "unsubscribe";
export async function createNewsletterToken(secret: string, purpose: TokenPurpose): Promise<{ raw: string; hash: string }>;
export async function hashNewsletterToken(secret: string, purpose: TokenPurpose, raw: string): Promise<string>;
export function validateNewsletterSignup(value: unknown): { email: string; categories: string[]; frequency: DigestFrequency; site_updates: boolean; consent_version: string; website: string; turnstile_token: string | null };
```

- [ ] **Step 1: Write token tests**

Assert 32-byte-or-stronger entropy, URL-safe raw value, deterministic keyed hash per raw+purpose, different hashes for same raw across purposes, and constant-shape invalid token handling.

- [ ] **Step 2: Write signup validation tests**

Require valid normalized email, at least one category when opportunity digest is enabled, allow site-updates-only subscription, daily/weekly only, category allowlist, explicit consent version, honeypot and bounded payload.

- [ ] **Step 3: Run tests and verify failure**

Run: `npx tsx --test tests/unit/newsletter-token.test.ts tests/unit/validation.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implement helpers**

Generate raw token using Web Crypto `crypto.getRandomValues(new Uint8Array(32))`; base64url encode without padding. Hash with HMAC-SHA-256 using `NEWSLETTER_TOKEN_SECRET`, message `${purpose}:${raw}`. Never log raw token.

- [ ] **Step 5: Run and commit**

```bash
npx tsx --test tests/unit/newsletter-token.test.ts tests/unit/validation.test.ts
git add worker/lib/newsletter-types.ts worker/lib/newsletter-token.ts worker/lib/validation.ts worker/lib/types.ts tests/unit
git commit -m "feat(newsletter): add token and signup contracts"
```

### Task 3: Implement escaped email rendering and minimal Resend client

**Files:**
- Create: `worker/lib/newsletter-email.ts`
- Create: `worker/lib/resend.ts`
- Create: `tests/unit/newsletter-email.test.ts`

**Interfaces:**

```ts
export interface RenderedEmail { subject: string; html: string; text: string; headers: Record<string,string>; }
export function renderConfirmationEmail(input: { confirmUrl: string }): RenderedEmail;
export function renderDigestEmail(input: { manageUrl: string; unsubscribeUrl: string; opportunities: DigestOpportunity[]; periodLabel: string }): RenderedEmail;
export function renderSiteUpdateEmail(...): RenderedEmail;
export async function sendResendEmail(env: Env, message: RenderedEmail & { to: string; idempotencyKey: string }): Promise<{ id: string }>;
```

- [ ] **Step 1: Write escaping/header tests**

Use opportunity fields containing `<script>`, `&`, quotes and Unicode. Assert HTML contains escaped text, text version remains readable, URLs are HTTPS, and headers include `List-Unsubscribe` plus `List-Unsubscribe-Post: List-Unsubscribe=One-Click` for subscribed mail (not the initial confirmation email if the provider/client policy would make that misleading).

- [ ] **Step 2: Verify current Resend API contract**

Consult current official Resend docs only. Confirm endpoint, Authorization header, idempotency-header support, sender/reply-to fields, and webhook signature scheme before coding. Record any exact header names in tests/constants.

- [ ] **Step 3: Implement renderer and client**

Use a local `escapeHtml` helper with `& < > " '` escaping. Resend client sends JSON via `fetch`, redacts recipient/secret from logs, parses provider error body only into bounded non-sensitive error metadata, and throws typed transient/permanent failures by status class.

- [ ] **Step 4: Run unit tests and commit**

```bash
npx tsx --test tests/unit/newsletter-email.test.ts
git add worker/lib/newsletter-email.ts worker/lib/resend.ts tests/unit/newsletter-email.test.ts
git commit -m "feat(newsletter): render and send compliant mail"
```

### Task 4: Implement subscriber state transitions

**Files:**
- Create: `worker/lib/newsletter.ts`
- Create: `tests/unit/newsletter-state.test.ts`

**Interfaces:**

```ts
export async function beginSignup(env: Env, input: SignupInput, signals: RequestSignals): Promise<void>;
export async function confirmSignup(env: Env, rawToken: string, signals: RequestSignals): Promise<void>;
export async function readPreferences(env: Env, rawManageToken: string): Promise<NewsletterPreferences>;
export async function updatePreferences(env: Env, rawManageToken: string, input: PreferenceUpdate, signals: RequestSignals): Promise<void>;
export async function unsubscribe(env: Env, rawToken: string, scope: "opportunity_digest"|"site_updates"|"all", signals: RequestSignals): Promise<void>;
```

- [ ] **Step 1: Write state-machine tests with a fake Supabase adapter**

Cover fresh pending signup, repeated pending signup rotates confirmation token, suppression blocks silent reactivation, confirmation creates consent event and manage/unsubscribe tokens, token is one-time/purpose-bound, confirmed preference update is immediate, stream-specific unsubscribe, unsubscribe-all creates suppression, and re-subscribe from suppression requires a fresh explicit signup+confirmation flow that clears suppression only after confirmation.

- [ ] **Step 2: Verify failure**

Run: `npx tsx --test tests/unit/newsletter-state.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement state transitions**

Keep SQL/PostgREST calls in small private functions. Unconfirmed signup expiry is 7 days. Record consent wording/policy version on `confirmed` and stream opt-in/out events. Do not retain raw IP; use existing keyed fingerprint signal.

- [ ] **Step 4: Run tests and commit**

```bash
npx tsx --test tests/unit/newsletter-state.test.ts
git add worker/lib/newsletter.ts tests/unit/newsletter-state.test.ts
git commit -m "feat(newsletter): implement consent state machine"
```

### Task 5: Add public newsletter Worker routes

**Files:**
- Create: `worker/routes/newsletter.ts`
- Modify: `worker/index.ts`
- Modify: `worker/lib/types.ts`
- Modify: `worker/worker-configuration.d.ts` through `npm run worker:types`
- Modify: `.dev.vars.dev.example`
- Test: `worker/tests/newsletter.test.ts`

**Routes:**

```text
POST /api/newsletter/signup
POST /api/newsletter/confirm
POST /api/newsletter/preferences/read
POST /api/newsletter/preferences/update
POST /api/newsletter/unsubscribe
POST /api/newsletter/webhooks/resend
```

No state-changing GET route.

- [ ] **Step 1: Add failing route tests**

Assert methods, body size limits, generic non-enumerating signup response, Turnstile/rate limiting, no raw token/email logging, invalid/expired token generic response shapes, and immediate unsubscribe semantics.

- [ ] **Step 2: Implement request handlers**

Reuse existing public-error shape but do not reveal whether an address is already subscribed/suppressed. Confirmation/preferences/unsubscribe can return explicit invalid-link messages because possession of a token is already required; do not reveal email in response.

- [ ] **Step 3: Implement Resend webhook verification**

Use only the current official Resend webhook verification contract from Task 3. On verified bounce/complaint events, create/maintain suppression and mark affected pending send jobs suppressed. Reject invalid signature with 401. Ensure replay handling is idempotent by provider event id if available.

- [ ] **Step 4: Regenerate Worker types and run tests**

Run: `npm run worker:types && npx tsx --test worker/tests/*.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add worker/routes/newsletter.ts worker/index.ts worker/lib/types.ts worker/worker-configuration.d.ts .dev.vars.dev.example worker/tests/newsletter.test.ts
git commit -m "feat(newsletter): expose double opt in API"
```

### Task 6: Add static signup, confirm, manage and unsubscribe pages

**Files:**
- Create: `src/pages/newsletter/index.astro`
- Create: `src/pages/newsletter/confirm.astro`
- Create: `src/pages/newsletter/manage.astro`
- Create: `src/pages/newsletter/unsubscribe.astro`
- Modify: `src/layouts/BaseLayout.astro`
- Test: `tests/public-index.spec.ts`

**Interfaces:**
- Links carry raw token in URL fragment, e.g. `/newsletter/confirm/#token=<raw>` where email clients preserve fragments; page JS reads fragment, removes it from visible URL with `history.replaceState`, and POSTs only after explicit user action.
- If fragment preservation proves unreliable in supported email clients, fallback is a path/query opaque token with strict `Referrer-Policy: no-referrer` on these pages and immediate URL cleanup before any other request. Email is never in URL.

- [ ] **Step 1: Add failing browser flow tests**

Signup form requires email and at least one stream; category list from existing taxonomy; daily/weekly selection; site updates separate checkbox. Confirmation page GET does not mutate; clicking Confirm sends POST. Manage page can change categories/frequency/site updates. Unsubscribe page can disable one stream or all.

- [ ] **Step 2: Implement pages**

All pages use `BaseLayout noindex`; confirmation/manage/unsubscribe additionally set a prop/data flag consumed by analytics consent to guarantee no analytics. Use textContent for status. Store no email in localStorage.

- [ ] **Step 3: Run browser tests and commit**

```bash
npx playwright test tests/public-index.spec.ts --grep "newsletter"
git add src/pages/newsletter src/layouts/BaseLayout.astro tests/public-index.spec.ts
git commit -m "feat(newsletter): add passwordless subscription UI"
```

### Task 7: Implement digest selection and idempotent send jobs

**Files:**
- Modify: `worker/lib/newsletter.ts`
- Modify: `worker/lib/newsletter-email.ts`
- Modify: `tests/unit/newsletter-state.test.ts`

**Interfaces:**

```ts
export async function reconcileNewsletterDigests(env: Env, now = new Date()): Promise<{ attempted: number; sent: number; failed: number; suppressed: number }>;
```

- [ ] **Step 1: Add failing digest tests**

Fixtures include opportunities with published timestamp/category. Assert daily only selects since last successful daily boundary, weekly uses weekly boundary, zero-match sends nothing, category filtering is exact taxonomy ids, site-update opt-in independent, deterministic period idempotency key prevents duplicates, and watermark moves only after accepted send.

- [ ] **Step 2: Implement opportunity source**

Read the generated public opportunity dataset through `env.ASSETS` or existing catalogue helper rather than directly cloning GitHub at send time. Require a publication/update timestamp field; if current dataset cannot provide a reliable timestamp, use an explicit generated change feed (`/data/changes.json`) and make lack of trustworthy change metadata a hard no-send condition rather than guessing.

- [ ] **Step 3: Implement send job claim/send/finalize**

Create a unique send job before contacting Resend. Mark `sending`, increment bounded attempts, call Resend with the same idempotency key, then set `sent` and update subscriber watermark in one logical completion path. Permanent provider errors suppress or fail without endless retries; transient failures retry on later cron up to the chosen bounded count (3).

- [ ] **Step 4: Run tests and commit**

```bash
npx tsx --test tests/unit/newsletter-state.test.ts tests/unit/newsletter-email.test.ts
git add worker/lib/newsletter.ts worker/lib/newsletter-email.ts tests/unit
git commit -m "feat(newsletter): send idempotent category digests"
```

### Task 8: Wire scheduled delivery and cleanup

**Files:**
- Modify: `worker/index.ts`
- Modify: Worker configuration (`wrangler.toml` or existing config file discovered in repo)
- Test: `tests/unit/worker-config.test.ts`
- Test: `worker/tests/newsletter.test.ts`

- [ ] **Step 1: Add failing cron/config test**

Require isolated dev cron no more frequent than hourly, and ensure scheduled handler calls publication reconciliation, removal reconciliation, newsletter reconciliation, and pending-signup/token cleanup independently via `Promise.allSettled` so one failure does not skip the others.

- [ ] **Step 2: Implement cleanup function**

Delete pending unconfirmed signup/token rows older than 7 days; invalidate expired tokens; retain suppressions and consent events according to schema/legal retention policy.

- [ ] **Step 3: Wire scheduled handler**

Add newsletter jobs to the existing scheduled handler with distinct structured error event names. Do not add cron to production/official Worker config; only the isolated Next environment gets the schedule.

- [ ] **Step 4: Run tests and commit**

```bash
npm run check && npx tsx --test worker/tests/*.test.ts
git add worker/index.ts worker/lib/newsletter.ts wrangler.toml tests/unit/worker-config.test.ts worker/tests/newsletter.test.ts
git commit -m "feat(newsletter): schedule digest reconciliation"
```

### Task 9: Configure Vercel-to-Worker mutation boundary

**Files:**
- Modify: `vercel.json`
- Modify: `.env.example`
- Test: `tests/unit/vercel-site-origin.test.ts`

- [ ] **Step 1: Add failing rewrite test**

Require only mutation/private prefixes that actually live on Worker to be rewritten/proxied; static generated `/api/v1/*` remains served by the Vercel artifact unless current deployment architecture already routes all `/api/*` through Worker. Explicitly test no catch-all rewrite.

- [ ] **Step 2: Implement narrow routing**

Use an environment-configured isolated Worker origin. Never hardcode production `perkcommons.com` or official Worker route. Preserve same-origin browser URLs so confirmation/manage calls do not leak tokens via cross-origin navigation.

- [ ] **Step 3: Run config tests and build**

Run: `npx tsx --test tests/unit/vercel-site-origin.test.ts && npm run build`.

- [ ] **Step 4: Commit**

```bash
git add vercel.json .env.example tests/unit/vercel-site-origin.test.ts
git commit -m "fix(deploy): route newsletter mutations to isolated worker"
```

### Task 10: Full newsletter verification

- [ ] Verify current official Resend docs before final secrets/headers/webhook settings.
- [ ] `npm run check`
- [ ] `npm test`
- [ ] `npm run build && npm run audit:site`
- [ ] `npm run test:browser`
- [ ] Run Worker tests with mocked Resend and disposable Supabase fixtures.
- [ ] In isolated dev only, send one confirmation and one digest through a verified Resend test/domain setup after SPF/DKIM/DMARC are configured.
- [ ] Confirm link-scanner GET cannot confirm/unsubscribe.
- [ ] Confirm unsubscribe-all prevents future send selection even if subscriber profile is later recreated without a new confirmation.
- [ ] Confirm no raw token, raw IP, or private email appears in logs, public pages, URLs after cleanup, or public GitHub data.
- [ ] Do not enable real promotional/site-update delivery until the required operator physical-address/legal disclosure is resolved.
