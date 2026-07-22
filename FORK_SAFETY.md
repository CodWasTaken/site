# PerkCommons Next fork safety record

Recorded on 2026-07-22 before source implementation.

## Repository map

| Local repository | Fork owner | Fork (`origin`) | Official read-only source (`upstream`) | Active branch |
| --- | --- | --- | --- | --- |
| `site/` | `CodWasTaken` | <https://github.com/CodWasTaken/site> | <https://github.com/PerkCommons/site> | `next/foundation` |
| `site/.data/` | `CodWasTaken` | <https://github.com/CodWasTaken/data> | <https://github.com/PerkCommons/data> | `next/schema-v2` |
| `data/` | `CodWasTaken` | <https://github.com/CodWasTaken/data> | <https://github.com/PerkCommons/data> | `next/schema-v2` |
| `docs/` | `CodWasTaken` | <https://github.com/CodWasTaken/docs> | <https://github.com/PerkCommons/docs> | `next/governance` |
| `branding/` | `CodWasTaken` | <https://github.com/CodWasTaken/branding> | <https://github.com/PerkCommons/branding> | `next/accessibility` |

GitHub reported each `CodWasTaken/*` repository as a fork whose parent is the corresponding `PerkCommons/*` repository. In every local clone, `origin` points to the fork. The official repository is configured as `upstream` for fetching, while its push URL is set to the invalid value `DISABLED`.

## Safety commitments

- The official PerkCommons repositories are read-only and will not receive branches, commits, pushes, pull requests, settings changes, or workflow triggers.
- No pull request will be opened against an official PerkCommons repository.
- Production systems—including the production Cloudflare Worker, Supabase database, GitHub Actions configuration, secrets, and `perkcommons.com`—are untouched.
- No production deployment will be triggered.
- Development uses local mocks, placeholders, dry runs, and fork-isolated workflows only. Production credentials must not be used or copied into files, logs, fixtures, screenshots, commits, or documentation.
- Transfer to an official repository requires a later, explicit authorization from the owner after Build Week.

## Initial safety evidence

Before source changes, `git remote -v`, `git status`, and `git branch --show-current` were run in all five clones. Each working tree was clean. The original official `origin` remotes were renamed to `upstream`, their push URLs were disabled, fork-owned `origin` remotes were added, and focused branches were created from the fork `main` branches.
