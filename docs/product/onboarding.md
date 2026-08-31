# Dual-Layer Onboarding

Status: `IMPLEMENTED` in v0.3.0 for the public homepage, persistent Studio progress strip, skip/disable/Help restore behavior and offline demo. Provider setup remains a separate prerequisite rather than a forced tour step.

Lensflow separates product understanding from task execution. The public homepage explains the system; Studio teaches only the next action.

## Layer 1: public homepage

The first viewport must establish:

- product name: 镜序 Lensflow;
- literal category: local-first AI visual creation workspace;
- no account, BYOK, local assets and open-source inspection;
- a real Studio image rather than an abstract illustration;
- a dynamic primary action based on extension state.

Dynamic action states:

| Extension state | Primary action | Secondary action |
| --- | --- | --- |
| Not detected | Install extension | Try local example |
| Detected, compatible | Enter Studio | Open extension |
| Detected, update available | Update Lensflow | View changelog |
| Detected, bridge blocked | Reconnect extension | Troubleshoot |

Extension detection uses a narrow allowlisted handshake. Absence of a response is treated as `not detected`, not proof that the extension is uninstalled.

The rest of the homepage uses compact full-width sections:

1. Capture a reference.
2. Decompose it into five controllable axes.
3. Inspect the final prompt and capability preflight.
4. Generate, fill failures and reuse results.
5. Explain local data, Provider disclosure, open source and release integrity.

Avoid long scroll-triggered blank areas. Every viewport should contain useful information and a visible cue to the next section.

## Layer 2: Studio first-run guide

The Studio guide follows the five visible creation stages:

1. `asset`
2. `analysis`
3. `composition`
4. `preflight`
5. `result`

The guide is a slim progress strip plus an inline anchor near the current control. It does not use a full-screen modal, dark scrim or forced tour.

Required behavior:

- `Skip` hides the current guide but keeps it recoverable from Help.
- `Do not show again` switches onboarding mode off.
- `New user mode` can be toggled without deleting completed progress.
- `Use example` loads bundled, redistributable sample assets and seed keywords without making a Provider request.
- Experienced users can explore downstream controls before completing the current step.
- Completion is derived from real events, not from clicking `Next` alone.

## Completion events

| Step | Completion evidence |
| --- | --- |
| Asset | A valid local asset is selected |
| Analysis | A quick or deep analysis reaches `ready` or `partial` |
| Composition | A non-empty compiled prompt enters preflight |
| Preflight | User submits after required checks pass |
| Result | At least one ready result reaches a stable revealed state |

## Accessibility

- Guide controls have at least a 40 px target.
- Focus moves only after an explicit user action.
- Progress uses text and state icons in addition to color.
- Reduced motion is available before the first reveal animation.
- The complete workflow is operable without drag gestures.
