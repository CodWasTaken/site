# Deployment version 2

The only workflow on this branch is a fork dry run. It must not be configured with production Cloudflare credentials and never calls a live deploy command.

## Required immutable inputs

Every build records site commit SHA, data commit SHA, schema version, taxonomy version and generated timestamp. A future deployment record must also persist minimum migration and exact artifact digest. `data/opportunities.json` exposes the current metadata for smoke verification.

The fork workflow accepts an exact `CodWasTaken/data` SHA, checks out the triggering site SHA, builds, runs `wrangler deploy --dry-run`, verifies required assets and expected metadata, and uses concurrency group `perkcommons-production` with cancellation. The production-like group name tests ordering semantics only; the job has no credentials and cannot deploy.

## Target state machine

`data_merged → deployment_queued → deployment_running → deployment_succeeded → verification_succeeded`, with `deployment_failed` possible from every active state. Persist run ID, started/completed times, site/data SHA, schema/taxonomy versions, artifact digest, verification time and structured failure reason. A newer run must never be overwritten by an older completion.

Publication and removal reconciliation are independent and use `Promise.allSettled`. Retrying one process must not block the other. Individual records and moderate batches require separate retry controls.

## Required smoke checks for a future isolated preview

- homepage 200;
- changed listing 200;
- tombstoned listing 410;
- catalogue/facet/provider assets exist;
- sitemap index and split sitemaps exist;
- public export exposes expected data/site SHA and schema/taxonomy versions;
- `/api/v1/opportunities` paginates deterministically;
- security headers are present.

## GitHub App proposal

Replace personal tokens with installation tokens. Proposed fork permissions: data contents read/write, pull requests read/write, checks read, metadata read; site Actions write only if exact-SHA dispatch remains necessary. No organization administration, secrets, deployments or member permissions. Installation in the official organization is forbidden without later explicit owner authorization.

## Later official adoption

Official adoption must use reviewed commits selected from the forks, a new production migration plan, a production KV namespace, GitHub App review, secret rotation, staging smoke tests and owner authorization. Do not change repository constants, workflow credentials or Worker name as an incidental cherry-pick.
