# Search version 2

The public directory is static-first. Initial HTML contains 24 cards and works without an API or database. `catalog-index.json` loads only when a user filters, searches or requests more. Category and audience shards permit future constrained loading. Static detail pages remain crawlable and Pagefind-indexed for resilience, but public search entry points route to the directory implementation.

Field priority is exact title, title, provider, aliases, benefit, category/resource type, tags/audience hints, eligibility, then description. Quoted text is treated as a required phrase. Synonyms cover common grant/funding, startup/founder, student/education, nonprofit/NGO, remote/online and credit/compute language. One-edit typo tolerance applies to important title/provider words.

Available controls are query, category, resource type, status, region, archived opt-in and sort. The URL retains filter state. Default results exclude expired, disputed and archived statuses and prioritize opportunity-like resource types without deleting or hiding records from explicit searches.

The current v1 dataset cannot accurately support country, remote, deadline, rolling application, organization stage, reviewed provenance or structured benefit amount filters. Those controls must use reviewed v2 fields; heuristics must not masquerade as facts.

## Generated assets

- `/catalog-index.json`
- `/facet-counts.json`
- `/provider-index.json`
- `/catalog/category/<category>.json`
- `/catalog/audience/<audience>.json` (explicitly marked legacy inference)

The 2026-07-22 build produced an 86 KB directory HTML file with 24 cards and a 931 KB uncompressed lazy index for 1,068 records. Compression and shard-first loading are next performance steps.

## Tests still required

Add stable ranking fixtures for exact-title precedence, provider matching, phrases, synonyms, typos and ties; filter/pagination URL tests; archived opt-in; keyboard/assistive announcements; and low-end mobile profiling. Search tests must not depend on catalogue ordering that editorial changes can legitimately alter.
