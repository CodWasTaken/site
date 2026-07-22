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

## Reports and removals

Decisions include dismiss, correct, expire, dispute, temporarily suppress, permanently remove, merge duplicate, escalate and require second reviewer. Store affected field, evidence, related group, research notes, correction, appeal and conflict state. Sensitive scam/malware/privacy/security removals write a fail-closed edge tombstone first.

## Publication

Administrators select records, preview files, validate, split moderate batches, exclude/retry individual records and see PR/deployment state. The archive shows provider, title, reason, reviewers, date, batch, PR, listing route, deployment and undo eligibility.

The isolated migration `202607220002_publication_semantics.sql` adds the normalized v2 publication fields and updates the moderation/publication RPC contracts. It has not been applied anywhere. Existing approved rows remain incomplete by design and must return to human review before publication; the Worker rejects such rows with `publication_requires_review` instead of inventing facts.

## Operations

Dashboard metrics include queue age, median review time, decisions/reasons, flag/undo/report-uphold rates, review-due records, failed publication/removal, deploy delay, retention run and migration status. Aggregate reports must avoid exposing private identities or small-group personal data.

## Current gaps

The minimized queue-summary endpoint supports cursor paging, but the browser workspace still lacks page controls, saved views and a dedicated detail/reveal API. The proposed revision and second-review database contracts are isolated migrations and have not been exercised against a Supabase instance. Selectable batches, field-level diff/preview, assignments, richer report decisions and operational analytics remain deferred.
