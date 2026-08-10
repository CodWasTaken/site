# Legal, UGC, and Takedown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the incomplete legal surface with accurate privacy/terms/submission disclosures and add a durable, moderated notice-and-action workflow for illegal-content, privacy, copyright, scam, and impersonation reports.

**Architecture:** Keep legal copy as static Astro pages, but model formal content notices as a distinct Supabase workflow rather than overloading ordinary listing-correction reports. Public notice intake is a validated Worker endpoint; moderator access remains authenticated and private. The unresolved Polish physical-address requirement is surfaced as an explicit dev-only launch blocker and never silently filled with a home address.

**Tech Stack:** Astro, TypeScript, Cloudflare Worker, Supabase/PostgREST, existing moderator auth, Playwright, Node tests.

## Global Constraints

- Operator/controller: Nataniel Bogacki, Poland, operating personally without a registered business.
- Do not publish a home address or invent a service address. Production legal launch remains blocked until a compliant address arrangement is resolved.
- Do not claim a specific DSA classification without legal confirmation.
- Keep optional submitter/reporter identities private.
- No official `PerkCommons/*` repository or production infrastructure changes.

---

## File Structure

- `src/pages/privacy.astro` — complete plain-language privacy notice.
- `src/pages/terms.astro` — Terms of Use/electronic-service regulations.
- `src/pages/submission-terms.astro` — community contribution terms/license/behavior.
- `src/pages/takedown.astro` — public notice-and-action form and guidance.
- `src/pages/submit.astro` — concise submission-terms acknowledgment and privacy links.
- `src/layouts/BaseLayout.astro` — footer links to legal/takedown pages.
- `worker/lib/validation.ts` — content-notice validation.
- `worker/routes/public.ts` — public content-notice intake.
- `worker/routes/moderation.ts` — moderator list/detail/resolve actions for content notices.
- `worker/index.ts` — route dispatch.
- `worker/lib/types.ts` — notice types.
- `supabase/migrations/202608100001_content_notices.sql` — notice tables, indexes, RLS/grants/retention fields.
- `supabase/greenfield/00000000000000_perkcommons_fork.sql` — regenerated baseline via existing generator, never hand-diverged.
- `tests/unit/validation.test.ts` — notice payload tests.
- `tests/moderation.spec.ts` — notice intake/moderation privacy tests.
- `tests/public-index.spec.ts` — legal-page navigation/accessibility assertions.

### Task 1: Add content-notice validation contract

**Files:**
- Modify: `worker/lib/validation.ts`
- Modify: `worker/lib/types.ts`
- Modify: `tests/unit/validation.test.ts`

**Interfaces:**

```ts
export type ContentNoticeReason = "illegal_content" | "copyright" | "privacy" | "impersonation" | "scam" | "other";
export interface ContentNoticeInput {
  target_url: string;
  listing_id: string | null;
  reason: ContentNoticeReason;
  explanation: string;
  notifier_name: string | null;
  notifier_email: string | null;
  good_faith_confirmed: true;
  website: string;
  turnstile_token: string | null;
}
export function validateContentNotice(value: unknown): ContentNoticeInput;
```

- [ ] **Step 1: Write failing validation tests**

Test valid listing URL, valid non-listing PerkCommons URL, invalid external target URL, explanation under 40 chars, unsupported reason, invalid email, and missing `good_faith_confirmed`.

- [ ] **Step 2: Run focused tests**

Run: `npx tsx --test tests/unit/validation.test.ts`
Expected: FAIL because `validateContentNotice` is absent.

- [ ] **Step 3: Implement validation**

Require target URL to be HTTPS and hostname equal to the configured public PerkCommons host at request handling time; the pure validator validates URL shape and returns it, while the route enforces host. Explanation length: 40–5000. Name max 100. Email normalized through existing `normalizeEmail`. Honeypot max 200. Good-faith checkbox must be `true`.

- [ ] **Step 4: Run unit tests**

Run: `npx tsx --test tests/unit/validation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add worker/lib/validation.ts worker/lib/types.ts tests/unit/validation.test.ts
git commit -m "feat(trust): validate formal content notices"
```

### Task 2: Add Supabase notice-and-action schema

**Files:**
- Create: `supabase/migrations/202608100001_content_notices.sql`
- Modify/generated: `supabase/greenfield/00000000000000_perkcommons_fork.sql`
- Modify: `tests/unit/migration-contract.test.ts`
- Modify: `tests/unit/greenfield-migration.test.ts`

**Interfaces:**

`content_notices` columns: UUID id, target_url, nullable listing_id, reason enum/check, explanation, notifier_name/email, notifier_email_hash, reporter_ip_hash, country_code, status (`open|reviewing|actioned|rejected|withdrawn`), decision_code, decision_note, assigned_to, created_at, reviewed_at, resolved_at. Public/anon receives no table grants; service role only. Moderator RPC/view exposes identity only in authenticated detail, not queue summary.

- [ ] **Step 1: Add failing migration contract assertions**

Assert migration includes table, allowed status/reason checks, RLS enabled, no anon/authenticated direct grants, indexes on status/created_at/listing_id, and retention-safe timestamps.

- [ ] **Step 2: Run contract tests**

Run: `npx tsx --test tests/unit/migration-contract.test.ts`
Expected: FAIL before migration exists.

- [ ] **Step 3: Write migration**

Use existing moderation schema conventions for UUID/default timestamps and moderator foreign keys. Do not create a public SELECT policy. Add a private moderator queue function/RPC only if the existing service-role Worker query pattern cannot satisfy least privilege.

- [ ] **Step 4: Regenerate greenfield baseline**

Run: `npm run greenfield:generate && npm run greenfield:check`
Expected: baseline includes the new schema once, with no manual duplicate definitions.

- [ ] **Step 5: Run migration tests**

Run: `npx tsx --test tests/unit/migration-contract.test.ts tests/unit/greenfield-migration.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/202608100001_content_notices.sql supabase/greenfield/00000000000000_perkcommons_fork.sql tests/unit/migration-contract.test.ts tests/unit/greenfield-migration.test.ts
git commit -m "feat(trust): add content notice workflow schema"
```

### Task 3: Add public notice intake endpoint

**Files:**
- Modify: `worker/routes/public.ts`
- Modify: `worker/index.ts`
- Test: `worker/tests/public-routes.test.ts` or the existing public-route test file in `worker/tests/`.

**Interfaces:**
- Route: `POST /api/notices`
- Response: generic `201 { message: "Notice received for review." }` on accepted and honeypot-blocked requests.
- Uses existing Turnstile and keyed fingerprint utilities.

- [ ] **Step 1: Add failing route tests**

Cover method rejection, invalid payload 400, Turnstile failure, external target host rejection, successful insert with hashed IP/email and no raw IP, and honeypot generic success without insert.

- [ ] **Step 2: Run Worker tests**

Run: `npx tsx --test worker/tests/*.test.ts`
Expected: FAIL for missing route.

- [ ] **Step 3: Implement handler**

Reuse `requestSignals`, Turnstile and rate-limit patterns from submissions/reports. Add notice-specific rate limiting using the existing report limiter initially unless a dedicated binding is added in the same change. If using the report limiter, use a distinct key prefix (`notice:`) so quotas do not collide.

Enforce `new URL(input.target_url).origin === new URL(request.url).origin` for the same-origin public site path presented through the Worker; when Vercel proxies the endpoint, allow an explicit `PUBLIC_SITE_ORIGIN` env value and compare against that exact origin.

- [ ] **Step 4: Run Worker tests**

Run: `npx tsx --test worker/tests/*.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add worker/routes/public.ts worker/index.ts worker/tests
git commit -m "feat(trust): accept formal content notices"
```

### Task 4: Add moderator queue/detail/resolution actions

**Files:**
- Modify: `worker/routes/moderation.ts`
- Modify: `worker/index.ts`
- Modify: `src/pages/moderate.astro`
- Modify: `tests/moderation.spec.ts`

**Interfaces:**
- `GET /api/moderation/notices?status=open|reviewing|...` returns minimized queue rows without notifier identity.
- `GET /api/moderation/notices/:id` returns full detail to moderator.
- `POST /api/moderation/notices/:id/resolve` accepts `{ status: "actioned"|"rejected", decision_code: string, decision_note?: string }`.

- [ ] **Step 1: Write failing privacy/authorization tests**

Assert unauthenticated requests fail, list rows omit notifier email/name, detail contains them for moderators, and resolution records moderator/timestamps.

- [ ] **Step 2: Run tests**

Run: `npm run test:unit && npx playwright test tests/moderation.spec.ts`
Expected: FAIL for absent routes/UI.

- [ ] **Step 3: Implement API and a focused moderation section**

Do not expand the already-large page with unrelated refactoring. Add a contained `Content notices` section using the existing authenticated fetch patterns. Queue list shows reason, target, age/status; detail reveal is explicit.

- [ ] **Step 4: Re-run tests**

Run: `npx playwright test tests/moderation.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add worker/routes/moderation.ts worker/index.ts src/pages/moderate.astro tests/moderation.spec.ts
git commit -m "feat(moderation): review content notices"
```

### Task 5: Replace privacy notice with actual data-flow disclosures

**Files:**
- Modify: `src/pages/privacy.astro`
- Test: `tests/public-index.spec.ts`

- [ ] **Step 1: Add failing content assertions**

Assert page names `Nataniel Bogacki`, `privacy@perkcommons.com`, submissions/reports, abuse fingerprints, Vercel, Supabase, Cloudflare, GitHub, and conditional Google Analytics/Resend processing; assert it contains an explicit production-launch notice that the required postal/service address is unresolved and is not a fake address.

- [ ] **Step 2: Rewrite privacy page**

Use plain language and headings for controller/contact, data collected, purposes/legal bases, recipients/processors, international transfers, retention, analytics consent, newsletter consent, public records, rights, complaints, automated decision-making, changes/effective date. Do not state retention periods that the schema does not actually implement; use criteria where exact periods are not yet encoded.

- [ ] **Step 3: Run browser test**

Run: `npx playwright test tests/public-index.spec.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/pages/privacy.astro tests/public-index.spec.ts
git commit -m "docs(legal): expand privacy notice"
```

### Task 6: Add Terms and Submission Terms

**Files:**
- Create: `src/pages/terms.astro`
- Create: `src/pages/submission-terms.astro`
- Modify: `src/layouts/BaseLayout.astro`
- Modify: `src/pages/submit.astro`
- Test: `tests/public-index.spec.ts`

- [ ] **Step 1: Add failing navigation/form assertions**

Require footer links to Privacy, Terms, Submission Terms, Takedown; require submit form to link Terms/Submission Terms/Privacy before the final submit button.

- [ ] **Step 2: Write Terms page**

Include operator identity, service descriptions, technical requirements, prohibited use/illegal content, service relationship and termination, complaints, availability/changes, IP boundaries, third-party opportunity disclaimer, and conservative Polish-law language. Include the same unresolved-address launch blocker instead of an invented address.

- [ ] **Step 3: Write Submission Terms page**

Cover lawful-right-to-submit warranty, no malware/executable content/secrets/sensitive personal data/impersonation/deception, affiliation disclosure, non-exclusive license for review/edit/publication/archive/removal, moderator discretion, no publication guarantee, takedown/correction path.

- [ ] **Step 4: Add explicit form acknowledgment**

Replace the single affiliation-only requirement with two independent required confirmations: existing affiliation disclosure and `I agree to the Community Submission Terms and understand submitted public listing information may be edited and published.` Do not bundle newsletter consent.

Update request payload and server validation with `submission_terms_confirmed: true`.

- [ ] **Step 5: Run unit/browser tests**

Run: `npm run test:unit && npx playwright test tests/public-index.spec.ts tests/moderation.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/pages/terms.astro src/pages/submission-terms.astro src/layouts/BaseLayout.astro src/pages/submit.astro worker/lib/validation.ts worker/lib/types.ts tests
git commit -m "feat(legal): add service and submission terms"
```

### Task 7: Add public takedown page

**Files:**
- Create: `src/pages/takedown.astro`
- Test: `tests/public-index.spec.ts`

- [ ] **Step 1: Add failing form test**

Assert target URL, reason, explanation, optional name/email, good-faith checkbox, honeypot, Turnstile when configured, privacy link, and successful generic confirmation message.

- [ ] **Step 2: Implement form**

Use DOM-safe status updates and the same Turnstile controller pattern as `submit.astro`. Pre-fill `target_url` from a safe same-origin `?url=` query parameter only after verifying origin in client code; the Worker remains authoritative.

- [ ] **Step 3: Run test**

Run: `npx playwright test tests/public-index.spec.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/pages/takedown.astro tests/public-index.spec.ts
git commit -m "feat(trust): add takedown notice form"
```

### Task 8: Full cycle verification

- [ ] `npm run check`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] `npm run test:browser`
- [ ] Confirm legal pages have exactly one H1, unique titles/descriptions/canonicals and no analytics on moderator/takedown-sensitive routes once analytics cycle lands.
- [ ] Confirm public notice queue never exposes notifier identity.
- [ ] Confirm no production-ready legal page contains a fabricated postal address.
