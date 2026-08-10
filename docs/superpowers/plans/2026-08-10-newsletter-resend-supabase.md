# Newsletter, Resend, and Supabase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a double-opt-in, category-based daily/weekly digest system with separate site-update consent, passwordless preference management, immediate unsubscribe/suppression, and authenticated outbound delivery through Resend.

**Architecture:** Supabase stores subscriber state, preferences, consent events, hashed tokens, suppressions and idempotent send jobs. The existing Cloudflare Worker owns all newsletter mutations and scheduled delivery. Astro serves static signup/confirm/manage/unsubscribe pages. Raw tokens are never stored; durable suppression uses a keyed email fingerprint.

**Tech Stack:** Astro 7, TypeScript 6, Cloudflare Worker + `wrangler.jsonc`, Supabase/PostgREST, Resend HTTPS API, Node tests, Playwright.

## Global Constraints

- Work only in `CodWasTaken/site@next/foundation` paired with `CodWasTaken/data@next/schema-v2`.
- Sender is `PerkCommons <updates@perkcommons.com>`; Reply-To is `hello@perkcommons.com`.
- Double opt-in is mandatory.
- Opportunity digest and site updates are independent consent streams.
- Digest frequency is user-selectable `daily` or `weekly`.
- No subscriber account or password.
- Manage/unsubscribe links use opaque high-entropy tokens stored only as keyed hashes.
- GET never confirms, updates, or unsubscribes.
- Unsubscribe-all is always available and takes effect immediately.
- Suppression survives profile deletion/reimport.
- Raw IP addresses are not retained for newsletter consent evidence.
- Do not enable real promotional delivery until SPF/DKIM/DMARC and the operator physical-address legal blocker are resolved.
- Do not modify official `PerkCommons/*` repositories or production infrastructure.

---

## File Structure

- `supabase/migrations/202608100002_newsletter.sql` — newsletter schema/RLS/indexes.
- `supabase/greenfield/00000000000000_perkcommons_fork.sql` — generated baseline.
- `worker/lib/newsletter-types.ts` — newsletter types.
- `worker/lib/newsletter-token.ts` — high-entropy token/HMAC helpers.
- `worker/lib/newsletter-email.ts` — escaped HTML/text email templates.
- `worker/lib/resend.ts` — minimal Resend API client.
- `worker/lib/newsletter.ts` — state machine, cleanup and digest reconciliation.
- `worker/routes/newsletter.ts` — public newsletter endpoints/webhook.
- `worker/index.ts` — route dispatch and scheduled jobs.
- `worker/lib/types.ts` — Worker environment bindings.
- `worker/worker-configuration.d.ts` — generated Wrangler types.
- `wrangler.jsonc` — isolated dev secrets, rates and cron.
- `src/pages/newsletter/index.astro` — signup.
- `src/pages/newsletter/confirm.astro` — explicit confirmation POST.
- `src/pages/newsletter/manage.astro` — passwordless preferences.
- `src/pages/newsletter/unsubscribe.astro` — stream/all unsubscribe.
- `src/layouts/BaseLayout.astro` — newsletter footer entry.
- `.env.example` / `.dev.vars.dev.example` — non-secret configuration names.
- `tests/unit/newsletter-token.test.ts`, `newsletter-state.test.ts`, `newsletter-email.test.ts`.
- `worker/tests/newsletter.test.ts` — Worker route tests.
- `tests/public-index.spec.ts` — browser flows.

### Task 1: Add newsletter database schema

**Files:** Create `supabase/migrations/202608100002_newsletter.sql`; regenerate greenfield baseline; modify migration tests.

**Interfaces:**

```text
newsletter_subscribers(id uuid pk, email text, state pending|confirmed|unsubscribed, frequency daily|weekly, confirmed_at, last_digest_at, created_at, updated_at)
newsletter_category_preferences(subscriber_id, category_id, active, updated_at)
newsletter_stream_preferences(subscriber_id, stream opportunity_digest|site_updates, active, updated_at)
newsletter_consent_events(id, subscriber_id, event_type, policy_version, wording_version, stream, occurred_at, request_country_code, request_ip_hash)
newsletter_tokens(id, subscriber_id, purpose confirm|manage|unsubscribe, token_hash unique, expires_at, used_at, created_at)
newsletter_suppressions(email_hash pk, reason unsubscribe|bounce|complaint|admin, created_at, cleared_at)
newsletter_send_jobs(id, subscriber_id, kind digest|site_update, period_key, idempotency_key unique, status pending|sending|sent|failed|suppressed, resend_id, attempts, last_error, created_at, sent_at)
```

- [ ] Write failing migration assertions for RLS, no anon/authenticated direct grants, unique email/suppression/idempotency constraints, token expiry/use fields, and due-send indexes.
- [ ] Run `npx tsx --test tests/unit/migration-contract.test.ts`; expect failure because tables do not exist.
- [ ] Write the migration using check constraints and `lower(email)` uniqueness; keep suppressions independent from subscriber cascade deletion.
- [ ] Run `npm run greenfield:generate && npm run greenfield:check`.
- [ ] Run migration/greenfield tests; expect pass.
- [ ] Commit: `feat(newsletter): add consent and delivery schema`.

### Task 2: Add token and signup validation primitives

**Files:** Create `worker/lib/newsletter-types.ts`, `worker/lib/newsletter-token.ts`, `tests/unit/newsletter-token.test.ts`; modify validation/types.

**Interfaces:**

```ts
export type DigestFrequency = "daily" | "weekly";
export type NewsletterStream = "opportunity_digest" | "site_updates";
export type TokenPurpose = "confirm" | "manage" | "unsubscribe";
export async function createNewsletterToken(secret: string, purpose: TokenPurpose): Promise<{ raw: string; hash: string }>;
export async function hashNewsletterToken(secret: string, purpose: TokenPurpose, raw: string): Promise<string>;
export function validateNewsletterSignup(value: unknown): { email: string; categories: string[]; frequency: DigestFrequency; site_updates: boolean; consent_version: string; website: string; turnstile_token: string | null };
```

- [ ] Write failing tests for >=32-byte URL-safe entropy, deterministic purpose-separated HMAC, normalized email, category allowlist, daily/weekly only, site-updates-only signup, explicit consent version and honeypot.
- [ ] Run focused tests; expect failure.
- [ ] Generate tokens with Web Crypto `crypto.getRandomValues(new Uint8Array(32))`; base64url without padding. Hash HMAC-SHA-256 message `${purpose}:${raw}` using `NEWSLETTER_TOKEN_SECRET`. Never log raw tokens.
- [ ] Run tests; expect pass.
- [ ] Commit: `feat(newsletter): add token and signup contracts`.

### Task 3: Implement escaped email rendering and Resend client

**Files:** Create `worker/lib/newsletter-email.ts`, `worker/lib/resend.ts`, `tests/unit/newsletter-email.test.ts`.

**Interfaces:**

```ts
export interface RenderedEmail { subject: string; html: string; text: string; headers: Record<string,string>; }
export function renderConfirmationEmail(input: { confirmUrl: string }): RenderedEmail;
export function renderDigestEmail(input: { manageUrl: string; unsubscribeUrl: string; opportunities: DigestOpportunity[]; periodLabel: string }): RenderedEmail;
export async function sendResendEmail(env: Env, message: RenderedEmail & { to: string; idempotencyKey: string }): Promise<{ id: string }>;
```

- [ ] Write failing tests with `<script>`, ampersands, quotes and Unicode in opportunity fields; assert HTML escaping, readable text, HTTPS links, and one-click unsubscribe headers on subscribed mail.
- [ ] Verify the current Resend send endpoint, auth/idempotency headers, reply-to fields and webhook signature scheme from official Resend documentation only; encode exact names in constants/tests.
- [ ] Implement local `escapeHtml` and the minimal fetch client. Provider logs may contain bounded status/error code but never recipient or secret.
- [ ] Run unit tests; expect pass.
- [ ] Commit: `feat(newsletter): render and send compliant mail`.

### Task 4: Implement subscriber state transitions

**Files:** Create `worker/lib/newsletter.ts`, `tests/unit/newsletter-state.test.ts`.

**Interfaces:**

```ts
export async function beginSignup(env: Env, input: SignupInput, signals: RequestSignals): Promise<void>;
export async function confirmSignup(env: Env, rawToken: string, signals: RequestSignals): Promise<void>;
export async function readPreferences(env: Env, rawManageToken: string): Promise<NewsletterPreferences>;
export async function updatePreferences(env: Env, rawManageToken: string, input: PreferenceUpdate, signals: RequestSignals): Promise<void>;
export async function unsubscribe(env: Env, rawToken: string, scope: "opportunity_digest"|"site_updates"|"all", signals: RequestSignals): Promise<void>;
```

- [ ] Write failing fake-adapter tests for fresh/repeated pending signup, token rotation, suppression behavior, confirmation consent events, purpose-bound one-time tokens, immediate preferences, stream unsubscribe, unsubscribe-all, and fresh-confirmation-required resubscribe.
- [ ] Run test; expect failure.
- [ ] Implement small PostgREST helpers and state transitions. Pending signup expiry is 7 days. Store keyed request fingerprint/country only, never raw IP.
- [ ] Run tests; expect pass.
- [ ] Commit: `feat(newsletter): implement consent state machine`.

### Task 5: Add Worker routes and webhook

**Files:** Create `worker/routes/newsletter.ts`, `worker/tests/newsletter.test.ts`; modify `worker/index.ts`, `worker/lib/types.ts`, `.dev.vars.dev.example`; regenerate `worker/worker-configuration.d.ts`.

**Routes:**

```text
POST /api/newsletter/signup
POST /api/newsletter/confirm
POST /api/newsletter/preferences/read
POST /api/newsletter/preferences/update
POST /api/newsletter/unsubscribe
POST /api/newsletter/webhooks/resend
```

- [ ] Write failing tests for method enforcement, body limits, generic non-enumerating signup response, Turnstile/rate limiting, invalid/expired token shape, immediate unsubscribe and no sensitive logs.
- [ ] Implement route handlers using existing public error/security patterns.
- [ ] Verify Resend webhook signatures exactly per current official docs; verified bounce/complaint events create/maintain suppression and suppress relevant send jobs; invalid signatures return 401; replay is idempotent by provider event id when supplied.
- [ ] Add `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `NEWSLETTER_TOKEN_SECRET` and `PUBLIC_SITE_ORIGIN` to `Env` and dev example names; no secret values in git.
- [ ] Run `npm run worker:types && npx tsx --test worker/tests/*.test.ts`; expect pass.
- [ ] Commit: `feat(newsletter): expose double opt in API`.

### Task 6: Add signup/confirm/manage/unsubscribe pages

**Files:** Create four `src/pages/newsletter/*.astro` pages; modify BaseLayout and Playwright test.

- [ ] Write failing browser flow: signup requires one stream; categories use existing taxonomy; daily/weekly selectable; site updates independent; confirmation GET does not mutate; explicit Confirm POSTs; manage changes preferences; unsubscribe can disable one stream/all.
- [ ] Implement pages with `BaseLayout noindex`. Confirmation/manage/unsubscribe are analytics-blocked. Use DOM `textContent` for status; never store email locally.
- [ ] Token URL strategy: prefer fragment `#token=<raw>`, immediately remove it with `history.replaceState` after reading. If verified email-client behavior cannot preserve fragments, use an opaque query token with page-level `Referrer-Policy: no-referrer`, remove it before any other request, and never include email in URL.
- [ ] Run `npx playwright test tests/public-index.spec.ts --grep "newsletter"`; expect pass.
- [ ] Commit: `feat(newsletter): add passwordless subscription UI`.

### Task 7: Implement digest selection and idempotent delivery

**Files:** Modify `worker/lib/newsletter.ts`, `worker/lib/newsletter-email.ts`, unit tests.

**Interface:**

```ts
export async function reconcileNewsletterDigests(env: Env, now = new Date()): Promise<{ attempted: number; sent: number; failed: number; suppressed: number }>;
```

- [ ] Write failing tests for daily/weekly windows, exact category match, zero-match no-send, independent site-update consent, deterministic period idempotency, retry and watermark advancement only after accepted send.
- [ ] Read new-opportunity data through `env.ASSETS`. Use trustworthy publication/change timestamp data from generated assets; if unavailable, use `/data/changes.json`. Lack of trustworthy change metadata is a hard no-send condition.
- [ ] Claim a unique send job before Resend; keep same idempotency key across retries; max transient attempts = 3; permanent bounce/complaint/suppression never loops.
- [ ] Run state/email tests; expect pass.
- [ ] Commit: `feat(newsletter): send idempotent category digests`.

### Task 8: Wire isolated Worker cron and cleanup

**Files:** Modify `worker/index.ts`, `worker/lib/newsletter.ts`, `wrangler.jsonc`, `tests/unit/worker-config.test.ts`, `worker/tests/newsletter.test.ts`.

- [ ] Write failing config test requiring the top-level non-dev cron to remain untouched and `env.dev.triggers.crons` to contain a newsletter-safe cadence no more frequent than hourly only when newsletter delivery is enabled. The current `env.dev.triggers.crons` is empty; this change is deliberate.
- [ ] Implement cleanup for unconfirmed signups/tokens older than 7 days and expired tokens; do not delete suppressions as routine cleanup.
- [ ] Extend scheduled handler with `Promise.allSettled([reconcilePublicationBatches, reconcileListingRemovals, reconcileNewsletterDigests, cleanupNewsletterState])` and distinct structured error event names.
- [ ] Configure the isolated `env.dev` cron to `0 * * * *` once all newsletter tests pass. Do not change official/production Worker routing.
- [ ] Run `npm run check && npx tsx --test worker/tests/*.test.ts`; expect pass.
- [ ] Commit: `feat(newsletter): schedule digest reconciliation`.

### Task 9: Configure Vercel-to-Worker newsletter mutations

**Files:** Modify/create `vercel.json`, `.env.example`, `tests/unit/vercel-site-origin.test.ts`.

- [ ] Write failing config test requiring only newsletter mutation paths (and any already-required existing private mutation prefixes) to target the isolated Worker origin; generated `/api/v1/*` remains static on Vercel. No catch-all proxy.
- [ ] Add environment-configured isolated Worker origin; never hardcode production `perkcommons.com` or official Worker URLs.
- [ ] Preserve same-origin browser calls for token-bearing POST bodies.
- [ ] Run Vercel config test and build; expect pass.
- [ ] Commit: `fix(deploy): route newsletter mutations to isolated worker`.

### Task 10: Full newsletter verification

- [ ] Re-check current official Resend docs immediately before final webhook/send configuration.
- [ ] Run `npm run check`, `npm test`, `npm run build && npm run audit:site`, and `npm run test:browser`.
- [ ] Verify Worker tests with mocked Resend and disposable Supabase fixtures.
- [ ] In isolated dev only, after SPF/DKIM/DMARC are configured, send one confirmation and one digest using a verified Resend test/domain setup.
- [ ] Confirm link-scanner GET cannot confirm or unsubscribe.
- [ ] Confirm unsubscribe-all prevents future send selection unless a new explicit signup and confirmation occurs.
- [ ] Confirm raw token, raw IP, and private subscriber email are absent from logs/public GitHub data/public URLs after token cleanup.
- [ ] Keep real site-update/promotional delivery disabled until the physical-address legal disclosure is resolved.
