# Lensflow Implementation Status

Status date: 2026-08-31

The labels in this repository have strict meanings:

- `IMPLEMENTED`: source and automated verification exist in this repository.
- `PARTIAL`: a usable implementation exists, but a documented part is incomplete or unverified.
- `DEFERRED`: intentionally outside the current release.
- `UNKNOWN`: available evidence cannot establish the behavior.

| Area | Status | Evidence or boundary |
| --- | --- | --- |
| Public product site and docs | `IMPLEMENTED` | Astro production build and route E2E |
| MV3 extension and restricted site bridge | `IMPLEMENTED` | protocol v2 contracts, origin/method allowlists and E2E |
| Mobile web write protection | `IMPLEMENTED` | centralized Runtime rejection plus enumerated write-method regression |
| Five-axis Studio, preflight and partial batch recovery | `IMPLEMENTED` | shared UI, core state tests and browser scenarios |
| Persistent first-run guide | `IMPLEMENTED` | event-derived progress, skip, disable, Help restore and refresh tests |
| Offline local demo | `IMPLEMENTED` | original WebP, precomputed analysis, read-only Runtime and zero-bridge E2E |
| Release Manifest v2 and update channels | `IMPLEMENTED` | schema tests, stable/beta feeds, size/hash/data/migration fields |
| GitHub ZIP update flow | `IMPLEMENTED` | 24-hour check, reminder only, manual update page |
| Chrome Web Store | `DEFERRED` | no verified listing URL is published |
| Full mobile editing | `DEFERRED` | mobile website remains read-only |
| Accounts, credits, payments, cloud sync, teams, community | `DEFERRED` | local-first personal-use boundary |
| Advanced OCR, segmentation, SVG, Eagle and legacy workbench | `PARTIAL` | implemented as optional tools; live external integration is not universally verified |
| 彼源, OpenAI-compatible and ComfyUI compatibility | `UNKNOWN` | adapters and mock contracts exist; live smoke tests require explicit user authorization |
| Viko authenticated Studio and server logic | `UNKNOWN` | not inspected; no private behavior is claimed or copied |

The canonical implementation path remains npm workspaces with Node.js `24.14.1` and npm `11.11.0`.
