# Viko Product And Documentation Analysis

Research date: 2026-08-28

Sources:

- Product page: <https://viko.fun/product>
- Documentation: <https://viko.fun/docs>
- Studio entry: <https://viko.fun/studio>

This document records behavioral observations for independent product research. It does not grant permission to copy branding, text, screenshots, media, source code or private behavior.

## Evidence labels

- `FACT`: directly visible in the captured public page or public documentation on the research date.
- `INFERENCE`: a conclusion derived from one or more facts but not directly verified in runtime.
- `PROPOSAL`: a Lensflow design decision.
- `UNKNOWN`: unavailable or not verified.

## Public product page

- `FACT`: The captured product page presented browser capture, prompt/keyword decomposition, creation and reuse as one connected product story.
- `FACT`: The page used 13 capability entries, a three-stage narrative and eight recorded examples in the captured version.
- `FACT`: Large scroll-triggered gaps reduced information density and made later content hard to discover.
- `INFERENCE`: The page is optimized for product explanation before deep task execution.
- `PROPOSAL`: Lensflow will preserve the staged explanation but use compact full-width sections, visible next-section cues and a real Studio screenshot in the first viewport.

## Studio access boundary

- `FACT`: Opening the Studio entry while unauthenticated redirected to a login surface.
- `UNKNOWN`: The complete authenticated Studio layout and runtime behavior were not directly inspected.
- `PROPOSAL`: Lensflow will not require a Lensflow account. Provider setup and local data remain separate from website identity.

## Creation Space behavior described by documentation

- `FACT`: The documented prompt system uses five axes: style, subject, composition, color and motion.
- `FACT`: Individual axes can be locked and rerolled; the full hand can be moved into a tray.
- `FACT`: Composer controls include word cards, final prompt, model, aspect ratio, image count, palette, preflight and a session easel.
- `FACT`: Batch generation may partially succeed, and the documented recovery model fills failed positions rather than restarting completed work.
- `FACT`: The documented reveal flow uses the states `sealed`, `tearing`, `burst`, `fan`, `flipping` and `gallery`.
- `FACT`: The documented drag interaction maps about 150 px to progress and opens after about 62% progress or a fast fling.
- `FACT`: A reduced-motion path is documented.
- `INFERENCE`: The reveal sequence is intended to make batch output feel like a coherent creative object instead of a list of API responses.
- `PROPOSAL`: Lensflow will keep the state semantics and accessibility fallback while using a flatter, workspace-integrated reveal tray.

## Identified workflow gaps

- `FACT`: The public Studio route was not usable without authentication during inspection.
- `INFERENCE`: An online Studio that depends on an extension needs an explicit not-installed state; otherwise the main action can lead to a dead end.
- `INFERENCE`: A new user with no saved terms needs a starter reference or keyword extraction path; an empty card table is not sufficient onboarding.
- `INFERENCE`: A successful connection test does not establish Structured Outputs, image generation, image editing or background-task compatibility.
- `INFERENCE`: Users need to inspect the final prompt and reference relationship before sending data to a Provider.
- `PROPOSAL`: Lensflow preflight will capability-test the chosen endpoint and model combination, show the request category and preserve partial batch successes.
- `PROPOSAL`: Store/package channel changes, database migration and backup recovery are first-class workflows rather than release notes only.

## Explicit non-copy boundary

Lensflow may implement independently derived workflow ideas such as axis locking, batch recovery and staged result reveal. It must not reproduce Viko trademarks, brand identity, exact copy, proprietary imagery, page screenshots, source code or a pixel-identical layout. No Viko screenshot is stored in this repository.
