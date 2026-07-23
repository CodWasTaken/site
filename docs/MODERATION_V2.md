# Moderation workspace version 2

The current workspace remains functional but is not yet the complete target implementation. Approval means creating a normalized public proposal; publication is a separate administrator decision. The approval editor now requires explicit v2 choices for resource type, availability, deadline type, URL purposes, geography, sponsorship and claims checked. It does not silently assign active/global/community/non-sponsored defaults.

## Target modules and state

Split the existing monolith into API, explicit state/reducer, queue, queue filters, submission view, approval editor, reports, publications, deployments, duplicate check, assignments, research, dialogs, shortcuts and accessibility modules. One state model should own selected item, revision, assignment, unsaved edits, dialog and request state.

## Data minimization

Queue summaries contain only ID, provider/title, primary category, status, risk/flag summary, assignment, age, revision and private-data-presence booleans. Opening an item fetches private detail. Email is masked by default; reveal requires a deliberate action, reason and audit event. Reporter email is omitted unless a specific workflow needs it.

## Concurrency and review integrity

Every mutable item has revision, assigned moderator, claimed/review-start times and conflict-of-interest state. Mutations include expected revision and return 409 on stale data. A second-review requirement records first reviewer and requires a different active reviewer; the database RPC—not only the UI—enforces separation.

## Approval editor

Show submitted and normalized public versions side by side, exact changed fields, copy/reset controls, evidence checklist, duplicate candidates, validation errors, generated JSON and shared public-card/page preview. Status, URL purpose, deadline, geography, resource type, default-search eligibility, sponsorship and public provenance require explicit editorial choices. No implicit `active`, `Global`, `community` or `sponsor=false` values.

## Existing-listing review

The workspace now has a dedicated **Unconfirmed listings** queue backed by the
build-generated public catalogue rather than private submission rows. It
supports exact totals, category and text filtering, stable oldest-review-first
ordering, and incremental loading. Queue summaries contain only public listing
fields.

**Review and edit** loads the canonical public record into the same explicit v2
editor used for approvals. Saving does not mutate Git or publish a factual
claim. It calls the transactional `create_listing_update` RPC, which stores an
audited pending `listing_update` submission and normalized draft against the
existing stable listing ID. A unique partial index prevents overlapping active
updates for one listing. The normal human approval and administrator
publication steps remain mandatory; publication overwrites the stable file
path and preserves its original creation timestamp.

Apply `202607240001_listing_update_workflow.sql` to an existing isolated fork
database before using the edit action. New empty fork projects should instead
use the regenerated greenfield baseline. Neither file is authorized for the
official or production database.

## Reports and removals

Decisions include dismiss, correct, expire, dispute, temporarily suppress, permanently remove, merge duplicate, escalate and require second reviewer. Store affected field, evidence, related group, research notes, correction, appeal and conflict state. Sensitive scam/malware/privacy/security removals write a fail-closed edge tombstone first.

## Publication

Administrators select records, preview files, validate, split moderate batches, exclude/retry individual records and see PR/deployment state. The archive shows provider, title, reason, reviewers, date, batch, PR, listing route, deployment and undo eligibility.

The isolated migration `202607220002_publication_semantics.sql` adds the normalized v2 publication fields and updates the moderation/publication RPC contracts. It has not been applied anywhere. Existing approved rows remain incomplete by design and must return to human review before publication; the Worker rejects such rows with `publication_requires_review` instead of inventing facts.

## Operations

Dashboard metrics include queue age, median review time, decisions/reasons, flag/undo/report-uphold rates, review-due records, failed publication/removal, deploy delay, retention run and migration status. Aggregate reports must avoid exposing private identities or small-group personal data.

## Current gaps

The minimized private-submission queue-summary endpoint supports cursor paging,
while the unconfirmed public-listing queue has working incremental controls and
lives in its own `src/scripts/moderation/unconfirmed.ts` module. The remaining
submission/report/archive views still lack page controls, saved views and a
dedicated private reveal API. The proposed revision, second-review and
listing-update database contracts remain isolated migrations and have not been
exercised against a hosted Supabase instance. Selectable batches, field-level
diff/preview, assignments, richer report decisions and operational analytics
remain deferred.
