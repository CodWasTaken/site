# Migration from v1 to v2

Run in the data fork:

```sh
npm ci
npm run generate:check
npm run migrate:v2
```

The default is a dry run. It validates every migrated object and writes only `reports/migration-results.json`. To inspect files without touching published v1 data, pass an explicit temporary output directory:

```sh
npm run migrate:v2 -- --output /absolute/path/to/isolated-v2-review
```

Never point `--output` at `opportunities/`.

## Preservation rules

- `id`, provider, title and description are copied.
- `officialUrl` becomes `canonicalUrl` but provider/program/application purpose remains unresolved.
- `sourceUrl` becomes overview evidence with the legacy review timestamp.
- Supported v1 status meanings are retained; ambiguous `active` becomes `unconfirmed` while `migration.legacyStatus` remains `active`.
- Free-text regions remain in `migration.legacyRegions`. `Global` does not set `geography.global=true` without evidence.
- Benefit and topic suggestions are derived but the record remains `needs-human-review`.
- Existing sponsor boolean is preserved; no new sponsorship value is invented.
- Missing creation time, reviewer, evidence claims, application URL, deadline and structured geography stay null/empty and appear in `unresolvedFields`.

## Review/adoption procedure

1. Pin the v1 data commit and generator version.
2. Run the dry run and require zero schema failures.
3. Create a human review queue prioritized by scope/quality reports.
4. Inspect current provider evidence and distinguish provider, program, application and claim URLs.
5. Confirm resource type, default-search eligibility, status, deadline and geography.
6. Record public-safe review provenance and next review target.
7. Publish small v2 batches alongside v1 fixtures.
8. Run site/data compatibility tests and compare preserved URLs, availability, geography and canonical routes.
9. Retire v1 writing only after every active consumer supports v2; preserve v1 Git history indefinitely.

The 2026-07-22 dry run validated 1,068/1,068 records and retained 10,737 unresolved-field markers. That is migration evidence, not human factual verification.
