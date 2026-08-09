# PerkCommons Next trust, compliance, security, and site-quality design

Date: 2026-08-10
Status: approved design, pending user review before implementation planning
Target site branch: `CodWasTaken/site@next/foundation`
Target data branch: `CodWasTaken/data@next/schema-v2`
Web deployment target: the isolated PerkCommons Next Vercel development site
Operator/controller: Nataniel Bogacki, Poland, operating PerkCommons personally without a registered business at this stage

## 1. Purpose

Build one coherent trust foundation around the existing PerkCommons Next site instead of layering isolated legal pages, newsletter code, scanner workarounds, and security patches.

The project will:

- replace the current short privacy page with a complete plain-language privacy notice;
- add electronic-service terms, community submission terms, and an illegal-content/copyright/takedown process;
- gate Google Analytics behind explicit consent for every visitor;
- add a consent-based category digest and site-update email system using Resend and Supabase;
- harden public submissions, moderation, publication, and rendering against injection and related web attacks;
- resolve or correctly classify the 19 reported technical/SEO findings;
- add tests so these properties remain true after later development;
- keep the Next web artifact on Vercel and keep official/production PerkCommons infrastructure untouched.

This design does not create paid subscriptions, checkout, user accounts, advertising, or a registered business entity.

## 2. Existing baseline

The Next branch is an Astro static site with generated sitemap support, Supabase-backed moderation, an existing Worker API, Turnstile support, static security headers, and browser/unit tests.

Several scanner findings are already false positives or incomplete observations:

- `BaseLayout.astro` already emits `lang="en"`, a required meta description, canonical URL, favicon, Open Graph metadata, and JSON-LD.
- `@astrojs/sitemap` is installed and configured.
- the site does not depend on React; Vite is used internally by Astro/Tailwind during the build.
- `robots.txt` currently permits all user agents.

Confirmed weaknesses include:

- no dedicated `404.astro` page;
- `robots.txt` hardcodes the production `perkcommons.com` sitemap;
- shared JSON-LD hardcodes production URLs rather than the configured site origin;
- the social image is an SVG wordmark rather than a purpose-built raster social card;
- the CSP is report-only and still permits inline script;
- the privacy page omits several disclosures that will be needed once analytics and newsletters exist;
- no newsletter or consent-management subsystem exists yet.

The public submission pipeline already has useful security properties: server-side field/type/length validation, HTTPS-only submitted URLs, Turnstile support, rate limiting, moderation-before-publication, and DOM preview rendering with text APIs. Those controls will be retained and regression-tested rather than replaced.

## 3. Chosen architecture

### 3.1 Hosting boundary

- **GitHub** remains the source of truth for code and review history.
- **Vercel** remains the web deployment target for the Next development site.
- The existing isolated **Cloudflare Worker** remains the mutation/private API runtime for submission, reporting, moderation, and the new newsletter endpoints for this project. This avoids rewriting the existing moderation backend merely to add compliance features.
- **Supabase** remains the system of record for private operational data.
- **Resend** handles authenticated outbound automated mail from `updates@perkcommons.com`, with `hello@perkcommons.com` as Reply-To.
- **Gmail** remains the human inbox and reply interface for PerkCommons role addresses.
- Production Cloudflare routes, official repositories, and the rollback Worker are out of scope.

If the Vercel deployment needs same-origin access to Worker mutation routes, use narrow rewrites for only those paths; do not proxy generated static/public API assets unnecessarily.

### 3.2 No subscriber accounts

Newsletter subscribers do not receive accounts or passwords. Confirmation and preference management use opaque, high-entropy tokens. Tokens are stored only as keyed hashes server-side and never expose the subscriber email in the URL.

Sensitive subscription pages use URL fragments for browser-held tokens where practical, are `noindex`, and never load analytics. Preference changes are POST operations. Email-security scanners loading a link must not be able to confirm a subscription merely by issuing a GET request.

## 4. Legal and transparency surface

The legal copy is a technical implementation based on current requirements and best practices, not a substitute for advice from a Polish lawyer. The implementation must avoid claiming a particular DSA classification unless that classification has been professionally confirmed.

### 4.1 Operator identity and unresolved address requirement

Public legal pages identify the operator/data controller as **Nataniel Bogacki**, operating PerkCommons personally from Poland.

A legal launch blocker remains: Article 5 of the Polish Act on Providing Services by Electronic Means requires an individual service provider to make their name, place of residence/address, and electronic addresses directly accessible. The project must not silently publish a home address or pretend an email address alone satisfies this. Before public production launch, obtain Polish legal advice on the exact address disclosure required for this service and choose an appropriate compliant address arrangement.

The Next-dev legal page may contain a clearly marked internal placeholder for the address, but a public production legal notice must not ship with a placeholder.

### 4.2 Privacy notice

Replace the short privacy page with a structured notice covering:

- controller identity and contact details;
- categories of personal data;
- purposes and legal bases;
- public submission/report data versus private contributor information;
- abuse-prevention fingerprints and approximate country information;
- newsletter signup, confirmation, preferences, suppression, and consent evidence;
- Google Analytics only after consent;
- processors/recipients, including Vercel, Supabase, Resend, Google when analytics is accepted, Cloudflare where Worker/Turnstile services are used, and GitHub only for moderated public listing data;
- international-transfer safeguards where relevant;
- retention periods or retention criteria;
- GDPR rights, withdrawal of consent, objection to direct marketing, complaint rights, and how to exercise them;
- automated decision-making statement (none for editorial publication decisions; automated anti-abuse signals do not auto-publish content);
- policy version/effective date and material-change handling.

### 4.3 Electronic-service terms / Terms of Use

Add a directly accessible Terms page that also functions as the Polish electronic-service regulations. It covers:

- operator details;
- services provided: browsing/search, submissions, reports, newsletter subscriptions/preferences, and moderator-only functionality where relevant;
- technical requirements;
- prohibition on illegal content and abuse;
- formation and termination of the free electronic-service relationship;
- complaint/contact process;
- service availability and reasonable changes;
- intellectual-property boundaries;
- disclaimers appropriate to an evidence-led directory without pretending to guarantee third-party opportunities;
- governing-law/jurisdiction language drafted conservatively for a Polish individual operator.

### 4.4 Community Submission Terms

Submission-specific terms state that contributors:

- may submit only information they have a lawful right to provide;
- must not submit malware, executable code, unlawful content, secrets, sensitive personal data, impersonation, deceptive material, or undisclosed conflicts/affiliations;
- retain their underlying rights but grant PerkCommons a non-exclusive license needed to review, edit, reproduce, publish, distribute, archive, and remove the submitted directory material;
- acknowledge moderator editing, rejection, correction, or removal;
- understand that submission does not guarantee publication.

The submission form includes a concise summary and links to the full terms before submission.

### 4.5 Notice-and-action / takedown

Add an accessible report/takedown surface for alleged illegal content, privacy violations, copyright issues, impersonation, scams, and other serious issues. It should collect enough information to identify the exact content and assess the claim, including the specific URL/listing, explanation, contact information where appropriate, and a good-faith accuracy statement.

The workflow records receipt, status, moderator decision, timestamps, and a non-sensitive reason code. Where contact information is available, send receipt and decision notifications. Do not expose notifier identity to public users.

This mirrors the useful elements of DSA Article 16 notice-and-action even while the exact legal classification of PerkCommons remains a legal-review item.

## 5. Analytics and consent

### 5.1 Global banner

Show the same consent interface worldwide. The initial choice presents **Accept analytics** and **Reject analytics** with equal visual prominence. No preselected consent and no dark-pattern treatment.

A persistent **Privacy settings** control in the footer allows the choice to be changed later.

### 5.2 Basic Google Consent Mode

Use the strict/basic model:

- no Google Analytics tag or Google request is loaded before explicit Analytics consent;
- rejection means no Google tag is loaded and no analytics data is sent;
- acceptance loads analytics and records only the local consent state needed to respect the choice;
- withdrawal stops future analytics loading and removes PerkCommons-controlled analytics cookies where possible;
- sensitive confirmation/preference/moderation routes never load analytics even for a previously consenting visitor.

The consent record stored in the browser contains only the choice, policy/version identifier, and timestamp. Do not create a server-side identity merely to remember cookie consent.

## 6. Newsletter design

### 6.1 User-facing behavior

Subscribers can independently choose:

- one or more opportunity categories;
- **daily** or **weekly** digest frequency;
- a separate **PerkCommons site updates** opt-in.

Site updates are not bundled into opportunity consent. Every email provides:

- a passwordless Manage preferences link;
- an unsubscribe control for the relevant stream;
- **Unsubscribe from all PerkCommons emails**;
- clear sender identity and contact information.

Preference changes take effect immediately after an already-confirmed subscriber uses a valid management token.

### 6.2 Double opt-in

Flow:

1. Visitor enters email, categories, digest frequency, and optionally opts into site updates.
2. Server validates and normalizes input, checks suppression state, rate limits, and creates/updates a pending signup.
3. Resend sends a confirmation email from `updates@perkcommons.com`.
4. Confirmation link opens a noindex/no-analytics page. A human click on a confirmation button performs the state-changing POST, preventing automatic email-link scanners from confirming subscriptions.
5. Server records the consent text/version and confirmation timestamp and marks the requested streams active.
6. Confirmation token becomes unusable.

Unconfirmed signup records expire and are deleted after a short retention window (recommended default: 7 days), while rate-limit/abuse records follow their separate retention policy.

### 6.3 Supabase model

Use narrowly scoped tables rather than one overloaded subscriber row:

- `newsletter_subscribers`: normalized email, state, selected frequency, confirmed timestamp, created/updated timestamps;
- `newsletter_category_preferences`: subscriber/category relationship;
- `newsletter_stream_preferences`: site-update and opportunity-digest consent state if not represented through an enum relationship;
- `newsletter_consent_events`: append-only consent/audit events with policy/wording version and timestamps;
- `newsletter_tokens`: hashed confirmation/manage/unsubscribe tokens with purpose, expiry, and rotation metadata;
- `newsletter_suppressions`: durable HMAC/email fingerprint sufficient to prevent accidental re-mailing after unsubscribe without retaining unnecessary profile data.

Raw IP addresses are not retained for newsletter consent evidence. If abuse/consent evidence requires a network signal, reuse the existing keyed fingerprint approach rather than storing the raw address.

RLS denies direct public table access. Browser clients communicate through validated server endpoints only.

### 6.4 Email delivery and compliance behavior

- Sender: `PerkCommons <updates@perkcommons.com>` through Resend.
- Reply-To: `hello@perkcommons.com`.
- Configure SPF/DKIM and DMARC for `perkcommons.com` before real delivery.
- Include standard unsubscribe metadata, including one-click HTTPS unsubscribe support where appropriate.
- Honor opt-outs immediately in PerkCommons even where a jurisdiction would permit a longer processing window.
- Keep a suppression record so deleted/reimported data cannot accidentally re-subscribe someone.
- Do not purchase or import third-party mailing lists.

Before sending email whose primary purpose may trigger US CAN-SPAM physical-address requirements, resolve the same operator-address legal/privacy blocker described above rather than publishing a home address by accident.

### 6.5 Digest generation

A scheduled job runs in the isolated API runtime. It:

1. selects confirmed, non-suppressed subscribers due for a daily/weekly digest;
2. matches only newly published opportunities against opted-in categories since that subscriber's last successful digest boundary;
3. creates deterministic send jobs/idempotency keys so a retry cannot duplicate the same digest;
4. renders plain-text and HTML variants from escaped structured data;
5. sends through Resend;
6. records success/failure and advances the digest watermark only after successful accepted delivery;
7. retries transient failures with a bounded policy and never endlessly retries permanent suppression/bounce outcomes.

The first version sends no email when there are zero matching opportunities unless the subscriber separately opted into a site update being sent that period.

## 7. Injection and application security

### 7.1 Trust boundary

Moderation is an editorial gate, not a security boundary. All user-controlled values remain untrusted at every stage: intake, Supabase storage, moderator display, publication transformation, generated data, Astro rendering, emails, and exports.

### 7.2 Input and URL validation

Keep the current server-side validation and strengthen tests around it:

- explicit type and length constraints;
- allowlisted category/subcategory values;
- HTTPS-only external URLs with no credentials;
- no `javascript:`, `data:`, or other executable schemes for submitted destinations;
- normalized emails;
- bounded request bodies;
- Turnstile, honeypot, and rate limiting for public mutation endpoints.

Client-side validation is convenience only.

### 7.3 Output encoding and dangerous sinks

- Use Astro's normal escaped interpolation for untrusted text.
- Use DOM `textContent`/element construction for browser-rendered user data.
- Prohibit `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `eval`, dynamic `Function`, and unreviewed `set:html` for user-controlled data.
- Centralize safe JSON-LD serialization so `<`, script-closing sequences, and relevant Unicode separators cannot break out of the structured-data block if dynamic values are added later.
- Audit moderator views and publication tooling as carefully as public pages.

### 7.4 XSS regression corpus

Add automated payloads covering at least:

- `<script>alert(1)</script>`;
- `</script><script>...`;
- `<img src=x onerror=...>`;
- SVG/event-handler payloads;
- `javascript:`/encoded URL variants;
- quotes, angle brackets, ampersands, and template-looking input;
- payloads in every public text field and moderator-only notes.

Tests assert payloads remain data, no injected node/event executes, published links retain safe protocols, and generated JSON remains valid.

### 7.5 CSP and browser headers

Keep the existing strong baseline headers, then move toward enforcement rather than treating report-only CSP as completion.

Implementation sequence:

1. externalize executable inline scripts where practical;
2. keep a report-only detailed policy while tests identify required origins;
3. add an immediately enforced baseline for `base-uri`, `object-src`, `frame-ancestors`, and `form-action`;
4. once inline-script dependencies are removed/hashed and Turnstile/analytics origins are explicit, promote the full script/style/connect policy to enforcement;
5. add automated header tests on Vercel and the isolated API origin.

Do not weaken CSP merely to make analytics work.

### 7.6 Moderator/API protections

- retain secure/HttpOnly/SameSite session cookies;
- verify same-origin/Origin on state-changing authenticated requests;
- preserve role checks and service-role separation;
- ensure private submitter/reporter data is never returned by public queue endpoints;
- keep generic public success responses where they prevent enumeration;
- rate-limit newsletter signup, confirmation attempts, preference-token attempts, and takedown reports.

## 8. The 19-site-quality findings

Each scanner item gets a reproducible acceptance check instead of being marked fixed because a tag exists somewhere.

1. **View-source empty** — Vercel responses for representative HTML routes must contain meaningful prerendered HTML without requiring JavaScript.
2. **No 404 page** — add a branded, useful `404.astro`, with navigation/search recovery and noindex behavior.
3. **Vite + React page** — no React runtime is introduced; verify production has no Vite dev client or development error shell. Astro/Vite build tooling is not presented as a React application.
4. **Same page titles** — audit generated HTML for duplicate titles; route/detail titles must be descriptive and unique where content differs.
5. **No meta description** — every indexable HTML route must provide a useful non-empty description through `BaseLayout`.
6. **No `og:image`** — replace the SVG wordmark with a dedicated raster social card (1200x630) and appropriate Open Graph/Twitter metadata.
7. **No structured data** — retain JSON-LD but make origin/environment dynamic and add relevant page-level structured data without inventing business claims.
8. **Multiple H1s** — enforce exactly one main H1 on ordinary HTML content pages.
9. **No H1s** — same route audit catches zero-H1 pages; API/JSON assets are excluded.
10. **No canonical tag** — retain the shared canonical and verify it resolves against the configured deployment origin, not hardcoded production.
11. **No `llms.txt`** — add a concise `llms.txt` describing the project, canonical public data/API/docs entry points, and content provenance.
12. **AI blocked `robots.txt`** — wildcard `Allow: /` already permits crawlers; keep that policy while making the sitemap origin environment-aware. Do not add a redundant list of vendor-specific bots merely to satisfy a scanner.
13. **No favicon** — favicon already exists; verify it is returned successfully and referenced from every HTML page.
14. **No `sitemap.xml`** — Astro currently generates a sitemap index; verify generated sitemap files and make robots reference the deployment's actual sitemap. If a scanner specifically requires `/sitemap.xml`, add a standards-safe compatibility endpoint/redirect without duplicating conflicting sitemap data.
15. **No lang attribution** — `html lang="en"` already exists; retain and test it.
16. **Missing alt text** — audit all meaningful images for useful alt text; decorative brand marks keep `alt=""` when adjacent text already conveys the same information.
17. **Source maps** — production build/deployment must not expose browser or Worker source-map files unless intentionally access-controlled for debugging; add an artifact scan.
18. **Console errors** — Playwright fails on unexpected `console.error`, uncaught page errors, failed resource requests attributable to PerkCommons, and hydration/runtime exceptions on representative desktop/mobile routes.
19. **Massive JS bundle** — measure actual production JavaScript and search assets first, preserve Astro's static-first architecture, keep search/index loading lazy, split oversized page modules, and add a regression budget based on the cleaned baseline rather than an arbitrary scanner number.

## 9. Testing and verification

### 9.1 Unit/contract tests

Add tests for:

- newsletter input validation and normalization;
- token hashing, expiry, purpose separation, and rotation;
- consent-state transitions;
- suppression behavior and re-subscription flow;
- digest category matching, daily/weekly windows, idempotency, and zero-match behavior;
- email rendering/escaping and unsubscribe metadata;
- analytics-consent state machine;
- safe JSON-LD serialization;
- XSS/unsafe URL corpus;
- takedown payload validation.

### 9.2 Browser tests

Playwright covers:

- consent accept/reject/change and proof that no Google request occurs before acceptance;
- signup -> confirmation page -> explicit confirmation -> preference management -> unsubscribe;
- independent site-update and opportunity-digest controls;
- submission malicious-payload previews and publication fixtures;
- 404, titles, descriptions, canonical, H1, favicon, social/structured metadata;
- console/page errors;
- mobile navigation and consent usability.

External email delivery is mocked in CI; a narrowly scoped Resend sandbox/test-domain smoke test is used only in the isolated dev environment.

### 9.3 Build/artifact checks

After a clean build:

- confirm sitemap and `llms.txt` output;
- scan HTML metadata across generated pages;
- scan for exposed `.map` artifacts;
- measure initial JS and search-index sizes;
- scan source for dangerous DOM/eval sinks and require explicit review for any exception;
- run dependency audit and record unresolved tooling-only advisories separately from runtime vulnerabilities.

### 9.4 Hosted Vercel verification

On the isolated Next Vercel deployment, verify representative routes, headers, metadata, static HTML, no console errors, consent network behavior, API rewrites, and exact site/data SHAs. No production alias or official infrastructure is changed as part of this verification.

The currently connected Vercel tool does not expose the previously verified project. That connector/project-visibility mismatch is a deployment gate, not a reason to invent a new project or overwrite an unknown deployment.

## 10. Data retention defaults

Implementation should encode explicit retention rather than indefinite storage. Initial recommended defaults, subject to final legal review:

- unconfirmed newsletter signup: 7 days;
- expired one-time tokens: delete or irreversibly invalidate promptly, with short operational logs;
- active subscriber profile/preferences: while subscribed;
- suppression fingerprint: retained while needed to honor the opt-out, with a documented re-subscription mechanism;
- consent event evidence: retained for the period reasonably necessary to demonstrate consent/compliance, then minimized/deleted according to the legal retention schedule;
- public submission/report private contact fields and abuse fingerprints: use the existing moderation/retention design and document the actual periods in the privacy notice once confirmed from schema/jobs;
- analytics consent choice in browser: versioned and periodically re-prompted only when materially necessary, not on every visit.

## 11. Failure handling

- Newsletter signup returns non-enumerating responses where practical so attackers cannot reliably discover subscriber status.
- Resend failure does not activate an unconfirmed subscription.
- Digest retries are idempotent and bounded.
- A failed preference/unsubscribe write returns a clear retry path; unsubscribe operations receive higher reliability priority than preference additions.
- Analytics failure never blocks site use.
- Takedown/report failures preserve user-entered text locally only when safe and do not silently report success if the notice was not recorded.
- CSP/metadata/site-quality work must not weaken submission/moderation controls.

## 12. Rollout order

1. Establish tests/audit fixtures and resolve the Vercel project visibility/deployment identity.
2. Implement site-quality metadata/404/robots/sitemap/llms/social-card fixes that do not depend on private infrastructure.
3. Implement consent UI and analytics gating, with analytics disabled until verified.
4. Implement legal/trust pages and submission/takedown disclosures, leaving the physical-address item explicitly blocked for production legal launch.
5. Add Supabase newsletter schema and Worker endpoints.
6. Add Resend double-opt-in, preference, suppression, and email templates.
7. Add scheduled daily/weekly digest generation and idempotent delivery.
8. Complete XSS/CSP hardening and regression coverage across submission/moderation/publication.
9. Run clean build/unit/browser/security/site-quality checks.
10. Deploy only to the isolated Vercel Next-dev target and run hosted verification.

## 13. Success criteria

The project is complete when:

- Google Analytics makes no network request before explicit Analytics consent;
- consent can be rejected as easily as accepted and changed later;
- newsletter enrollment requires human double opt-in;
- daily/weekly category digests and separately opted-in site updates work without accounts;
- every automated email has functioning manage/unsubscribe behavior and suppression is enforced;
- legal pages identify Nataniel Bogacki and accurately document the actual data flows, with the unresolved Polish physical-address requirement blocked rather than concealed;
- public UGC cannot execute script through intake, moderation preview, publication, public rendering, structured data, or emails in the regression corpus;
- all 19 scanner issues are either demonstrably fixed or documented as false positives with reproducible checks;
- CSP/header posture is stronger than the current report-only baseline without breaking Turnstile/analytics;
- the full test/build suite passes from a clean checkout;
- the hosted Vercel Next-dev deployment passes smoke/security/metadata/network checks and remains paired with the intended Next data branch;
- no official `PerkCommons/*` repository, production Cloudflare Worker, production Supabase project, or `perkcommons.com` deployment is modified.

## 14. Legal verification basis recorded for implementation

The implementation plan should re-check these official sources immediately before legal copy is finalized because law/guidance can change:

- GDPR Regulation (EU) 2016/679, especially Articles 7, 13, 17 and 21;
- Polish Act on Providing Services by Electronic Means, especially Articles 5 and 8;
- Polish Electronic Communications Law of 12 July 2024, especially Articles 398 and 399;
- Digital Services Act Regulation (EU) 2022/2065, especially Article 16 and the small/micro-enterprise exclusions for later platform-specific obligations;
- Google Analytics official Basic Consent Mode documentation;
- UK ICO PECR/direct-marketing guidance for individual email subscribers;
- US FTC CAN-SPAM guidance where a message's primary purpose brings it within that regime.
