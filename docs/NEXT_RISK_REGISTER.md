# PerkCommons Next risk register

| ID | Risk | Likelihood / impact | Current control | Remaining action |
| --- | --- | --- | --- | --- |
| R1 | Accidental official repository mutation | Low / critical | Fork-only origins, disabled upstream push URLs, automation constants point to fork, dry-run workflow | Keep a preflight allow list and require explicit post-Build-Week authorization |
| R2 | Production credential use in fork | Low / critical | Tracked production env replaced with placeholders; workflow has no deploy secrets | Secret scanning and isolated preview account before any hosted preview |
| R3 | V1 migration invents facts | Medium / high | Ambiguous fields are null/unconfirmed and listed in `unresolvedFields`; every migration needs human review | Editorial migration queue and evidence checklist |
| R4 | Scope heuristics wrongly remove valid records | Medium / high | Reports only; no automatic mutation | Human reclassification, appeals and preserved Git history |
| R5 | Generic records create misleading confidence | High / high | Quality report exposes 93.16% generic text and zero public provenance | Provider-specific source review before v2 publication |
| R6 | Search ranking disadvantages resource types | Medium / medium | Resource-type filtering, stable URL state, transparent field priorities | Relevance fixtures and user testing with representative queries |
| R7 | Search index is still large on constrained networks | Medium / medium | Lazy load; 24-card first page; shards available | Compress/minify index, optionally load shard before full index |
| R8 | Supabase outage re-exposes a removed listing | Low / critical | Edge tombstone checked before cache and Supabase | Require configured tombstone binding in production and reconcile audit state to KV |
| R9 | Tombstone write succeeds but Git/deploy fails | Medium / medium | Tombstone is retained and route stays 410 | Operational retry dashboard, exact state machine and alerting |
| R10 | Tombstone store outage blocks safe content | Medium / medium | Failure is explicit rather than silently bypassed | Reason-specific fail-closed/open policy with cached signed snapshot |
| R11 | Publication deploys wrong data revision | Medium / high | Dry-run workflow requires exact data SHA and exports expose both SHAs | Persist SHA state in Supabase and verify hosted header before success |
| R12 | Older workflow overwrites newer deployment | Low / high | Fork workflow concurrency cancels older runs | Deployment monotonicity test and hosted reconciliation |
| R13 | Personal token compromise | Medium / critical | No tokens used in this work; code targets forks | GitHub App with minimal permissions and short-lived installation tokens |
| R14 | Queue endpoint exposes private contributor data | High / high | Auth and private Supabase boundary exist | Split minimized summary from detail; audit email reveal |
| R15 | Two-review policy bypass | Medium / high | Policy documented only | Database constraint/RPC enforcing distinct first and second reviewer |
| R16 | Reusable Supabase access token stolen from app session | Medium / high | HttpOnly, Secure, SameSite=Strict, one-hour cookie | Worker-signed opaque session with rotation/revocation design |
| R17 | CSP report-only hides blocking regressions | Medium / medium | Central policy and tests | Collect fork reports, remove inline scripts/nonces, then enforce |
| R18 | Programmatic pages become thin SEO content | Medium / medium | Only shards generated; no thin public landing pages created | Content threshold and human editorial copy gate |
| R19 | Branding diverges across repositories | Medium / medium | Canonical fork SVG assets used | Token generation/package strategy and visual regression tests |
| R20 | Browser/accessibility gaps outside Chromium | Medium / high | Keyboard semantics, reduced motion and Chromium desktop/mobile tests | Firefox/WebKit, Axe, forced colors, zoom and screen-reader manual validation |
| R21 | Wrangler development dependency inherits a vulnerable `sharp` build | Medium / medium | Runtime application does not import `sharp`; advisory is confined to build/local tooling and dry-run succeeded | Upgrade when Wrangler/Miniflare ships a fixed dependency; do not accept npm's suggested old Wrangler downgrade without compatibility review |
| R22 | Previously approved rows lack v2 editorial semantics | High / high | Publication readiness check rejects incomplete rows; additive migration does not backfill facts | Re-review old approvals in a disposable fork database before any v2 publication |

Risks are reviewed per phase. A deferred control cannot be treated as implemented merely because it appears in this register.
