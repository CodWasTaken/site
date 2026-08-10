# Analytics Consent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a global, privacy-preserving analytics consent system that prevents any Google Analytics request before explicit acceptance and lets visitors reject or later withdraw consent just as easily.

**Architecture:** Keep consent state entirely in the browser and load Google Analytics dynamically only after an accepted state. Implement the state machine as a pure TypeScript module, render a framework-free Astro consent component globally, and blacklist sensitive routes from analytics regardless of saved consent. No third-party CMP and no server-side visitor identity.

**Tech Stack:** Astro, TypeScript, browser localStorage/cookies, Google Analytics 4 basic consent approach, Playwright, Node tests.

## Global Constraints

- Banner appears worldwide.
- `Accept analytics` and `Reject analytics` have equal visual prominence.
- No Google tag/request before explicit acceptance.
- Rejection loads no Google tag.
- Visitors can reopen Privacy settings later.
- Sensitive confirmation/preference/moderation/takedown routes never load analytics even after acceptance.
- Consent storage contains only choice, policy version, and timestamp.
- No server-side consent identity.

---

## File Structure

- `src/lib/analytics-consent.ts` — pure state parsing/storage/route eligibility/cookie cleanup helpers.
- `src/components/AnalyticsConsent.astro` — accessible banner/dialog and dynamic GA loader.
- `src/layouts/BaseLayout.astro` — mount component and footer Privacy settings button.
- `src/styles/global.css` — only minimal existing-design-system classes if utility classes cannot express fixed dialog state.
- `src/env.d.ts` — type `PUBLIC_GOOGLE_ANALYTICS_ID`.
- `.env.example` — document the optional public GA ID.
- `tests/unit/analytics-consent.test.ts` — state-machine tests.
- `tests/public-index.spec.ts` — network-level consent tests.

### Task 1: Implement pure consent state helpers

**Files:**
- Create: `src/lib/analytics-consent.ts`
- Create: `tests/unit/analytics-consent.test.ts`

**Interfaces:**

```ts
export const ANALYTICS_CONSENT_VERSION = "2026-08-10";
export type AnalyticsChoice = "accepted" | "rejected";
export interface AnalyticsConsentRecord { choice: AnalyticsChoice; version: string; timestamp: string; }
export function parseAnalyticsConsent(raw: string | null): AnalyticsConsentRecord | null;
export function shouldShowConsent(record: AnalyticsConsentRecord | null): boolean;
export function isAnalyticsRoute(pathname: string): boolean;
export function analyticsStorageKey(): string;
export function analyticsCookieNames(cookies: string[]): string[];
```

- [ ] **Step 1: Write failing tests**

Cover malformed JSON, wrong version, accepted/rejected valid state, future/invalid timestamp rejection, and blocked paths: `/moderate`, `/moderator-login`, `/takedown`, `/newsletter/confirm`, `/newsletter/manage`, `/newsletter/unsubscribe`.

- [ ] **Step 2: Run focused tests**

Run: `npx tsx --test tests/unit/analytics-consent.test.ts`
Expected: FAIL because helper does not exist.

- [ ] **Step 3: Implement minimal pure module**

Use strict object checks and ISO timestamp parsing. Treat wrong policy version as no valid consent so the UI re-prompts after material policy changes. `analyticsCookieNames` should match `_ga`, `_ga_*` and only cookies controlled for the current hostname.

- [ ] **Step 4: Run test**

Run: `npx tsx --test tests/unit/analytics-consent.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analytics-consent.ts tests/unit/analytics-consent.test.ts
git commit -m "feat(privacy): add analytics consent state"
```

### Task 2: Add accessible global consent UI

**Files:**
- Create: `src/components/AnalyticsConsent.astro`
- Modify: `src/layouts/BaseLayout.astro`
- Test: `tests/public-index.spec.ts`

**Interfaces:**
- Banner root: `[data-analytics-consent-banner]`
- Buttons: `[data-consent-accept]`, `[data-consent-reject]`, `[data-privacy-settings]`
- `window.dispatchEvent(new CustomEvent("perkcommons:analytics-consent", { detail: record }))` after each change.

- [ ] **Step 1: Add failing browser test**

New context with cleared storage: banner visible; Accept/Reject both visible and same button class/size; reject hides banner; footer Privacy settings reopens it; stored JSON contains only `choice`, `version`, `timestamp`.

- [ ] **Step 2: Implement component**

Use a fixed bottom consent panel with heading, one-sentence explanation, Privacy link, and two equal buttons. It must be keyboard reachable, use `aria-labelledby`, and not trap focus because it is a non-modal choice panel. Footer button reopens without erasing prior choice until a new choice is selected.

- [ ] **Step 3: Run browser test**

Run: `npx playwright test tests/public-index.spec.ts --grep "analytics consent"`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/AnalyticsConsent.astro src/layouts/BaseLayout.astro tests/public-index.spec.ts
git commit -m "feat(privacy): add global analytics choices"
```

### Task 3: Load GA only after explicit acceptance

**Files:**
- Modify: `src/components/AnalyticsConsent.astro`
- Modify: `src/env.d.ts`
- Modify: `.env.example`
- Test: `tests/public-index.spec.ts`

**Interfaces:**
- Reads `import.meta.env.PUBLIC_GOOGLE_ANALYTICS_ID`.
- Dynamically creates `https://www.googletagmanager.com/gtag/js?id=<encoded id>` only after accepted state and route eligibility.
- Initializes `window.dataLayer`/`gtag` only at load time; there is no pre-consent Google bootstrap.

- [ ] **Step 1: Add failing network tests**

Intercept requests whose host ends in `googletagmanager.com`, `google-analytics.com`, or `analytics.google.com`.

Cases:
1. fresh visitor before choice: zero requests;
2. reject: zero requests after navigation;
3. accept: loader request occurs when GA ID test env is present;
4. accepted visitor on `/moderator-login/` and `/takedown/`: zero Google requests.

- [ ] **Step 2: Implement lazy loader**

Guard against duplicate script insertion. Configure only after script insertion:

```js
window.dataLayer = window.dataLayer || [];
function gtag(){ window.dataLayer.push(arguments); }
gtag('js', new Date());
gtag('config', measurementId, { anonymize_ip: true });
```

Do not call `gtag('consent', 'default', ...)` before acceptance because the chosen design is basic/no-tag-before-consent.

- [ ] **Step 3: Run network tests**

Run: `PUBLIC_GOOGLE_ANALYTICS_ID=G-TEST123 npx playwright test tests/public-index.spec.ts --grep "Google|analytics consent"`
Expected: PASS; tests may route the Google loader to a local fulfilled response to avoid real external traffic while still asserting attempted network behavior.

- [ ] **Step 4: Commit**

```bash
git add src/components/AnalyticsConsent.astro src/env.d.ts .env.example tests/public-index.spec.ts
git commit -m "feat(analytics): load Google only after consent"
```

### Task 4: Implement withdrawal and cookie cleanup

**Files:**
- Modify: `src/components/AnalyticsConsent.astro`
- Modify: `src/lib/analytics-consent.ts`
- Test: `tests/public-index.spec.ts`

- [ ] **Step 1: Add failing withdrawal test**

Seed accepted consent and `_ga`/`_ga_TEST` cookies, load page, reopen Privacy settings, reject, then assert local record is rejected and first-party GA cookies are expired/absent after reload. Assert no new Google request occurs on later navigation.

- [ ] **Step 2: Implement cleanup**

Expire matching cookies for current hostname/path `/`; attempt host-only and dot-domain variants without touching unrelated cookies. Remove injected GA script nodes and clear locally created `window.google_tag_manager`/`dataLayer` references only where safe; the critical requirement is stopping future requests and deleting controllable cookies, not pretending already-sent data can be recalled.

- [ ] **Step 3: Run tests**

Run: `PUBLIC_GOOGLE_ANALYTICS_ID=G-TEST123 npx playwright test tests/public-index.spec.ts --grep "withdraw|analytics"`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/AnalyticsConsent.astro src/lib/analytics-consent.ts tests/public-index.spec.ts
git commit -m "fix(privacy): honor analytics withdrawal"
```

### Task 5: Align CSP with consented analytics

**Files:**
- Modify: `vercel.json`
- Modify: `public/_headers`
- Test: `tests/unit/vercel-site-origin.test.ts`

- [ ] **Step 1: Add failing CSP assertions**

Require report-only/full policy to allow only exact Google hosts needed by GA after consent while enforced baseline remains unchanged. Do not add wildcards broader than required.

- [ ] **Step 2: Verify current official Google host requirements**

Before changing CSP, consult current official Google Analytics/Tag docs and record the exact hosts in a code comment/test fixture. Use primary documentation only.

- [ ] **Step 3: Update CSP**

Add script/connect hosts required by the actual GA loader and collection endpoint, leaving the tag unloaded before consent. Preserve Turnstile and Supabase hosts.

- [ ] **Step 4: Run config/unit/build tests**

Run: `npm run check && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add vercel.json public/_headers tests/unit/vercel-site-origin.test.ts
git commit -m "fix(security): scope analytics CSP origins"
```

### Task 6: Full cycle verification

- [ ] `npm run check`
- [ ] `npm test`
- [ ] `npm run build && npm run audit:site`
- [ ] `PUBLIC_GOOGLE_ANALYTICS_ID=G-TEST123 npm run test:browser`
- [ ] Verify fresh/rejected users generate zero Google requests.
- [ ] Verify accepted users generate requests only on eligible public routes.
- [ ] Verify privacy settings remain usable with JavaScript enabled and site content remains usable with JavaScript blocked (analytics simply stays off).
