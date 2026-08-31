# Lensflow Product Specification

Status: `PARTIAL` as of v0.3.0. The extension, public site, Studio bridge, local database, Provider adapters, five-axis workflow, partial batch recovery, history and backup are implemented. Live Provider compatibility remains `UNKNOWN` until an authorized smoke test passes.

## Product definition

镜序 Lensflow is a local-first visual research and image-generation workspace for independent creators. It connects browser capture, structured visual analysis, controllable prompt composition, batch generation and reusable local assets without a Lensflow account or hosted credit system.

## Audience

Primary users are designers, photographers, visual researchers and content creators who:

- already have access to an OpenAI or OpenAI-compatible API;
- want to understand and reuse visual references rather than save disconnected images;
- require visibility into prompts, reference influence and model capabilities;
- prefer local ownership over a hosted asset library.

## Goals

- Turn a page image, screenshot or local file into structured observations and editable prompt material.
- Keep style, subject, composition, color and motion independently controllable.
- Make every outbound Provider request explicit and reversible where possible.
- Preserve successful batch results and retry only failed positions.
- Make the same local projects available to the extension and the allowlisted Lensflow Studio.
- Offer a public, inspectable release and update path.

## Non-goals

- Accounts, teams, credits, subscriptions or payment processing.
- A Lensflow-hosted user database or asset cloud.
- Social feeds, public galleries or automatic publishing.
- Claiming exact visual reconstruction from one reference.
- Treating Provider connection success as full compatibility proof.

## Product surfaces

### Chrome extension

- Capture an image, visible viewport, user-selected region or explicitly selected page media.
- Show source URL, capture time and user-selected scope before analysis.
- Run analysis through the configured analysis model and validate the returned structure.
- Save references, structured observations, prompt fragments, palettes and projects locally.
- Execute allowlisted Provider requests for the public Studio without revealing the API Key.
- Check the release manifest and explain the correct update channel.

Implementation status: `IMPLEMENTED` for GitHub ZIP reminders and manual update guidance; Chrome Web Store distribution is `DEFERRED` until a verified listing exists.

### Product website

Routes planned for the first public version:

- `/`: product introduction, privacy model, workflow preview and dynamic install/open/update action.
- `/studio`: online creation space connected to the extension bridge.
- `/docs`: task-oriented usage and troubleshooting documentation.
- `/download`: Chrome Web Store and GitHub release choices with integrity information.
- `/changelog`: human-readable release history.
- `/privacy`: local data and Provider disclosure.
- `/github`: canonical repository redirect or repository page.

### Online Studio

- Reference inbox and project-local asset library.
- Weighted reference relationship editor.
- Five-axis decomposition with per-axis lock and reroll.
- Composer with final prompt, tokens, model, aspect ratio, count and palette.
- Capability preflight and outbound request disclosure.
- Batch status, targeted retry, result reveal, comparison and reuse.
- History that retains source, prompt, settings and Provider provenance.

Implementation status: `PARTIAL`. The sequential five-step desktop workflow is implemented. Exact numeric reference weights, full mobile editing, cloud sync and public community features are intentionally not implemented.

## Primary journey

1. The user installs the extension or opens a read-only example from the homepage.
2. The extension stores a Provider profile and API Key locally, then tests required capabilities.
3. The user captures or imports a reference.
4. The analysis model returns validated observations and five editable axes.
5. The user locks, edits or rerolls axes and inspects the final prompt/reference map.
6. Preflight confirms the exact image model and required operations.
7. A batch begins; each output position records queued, running, completed or failed state.
8. Completed outputs remain available. Failed positions can be filled without paying for or replacing successful outputs.
9. The user opens the result tray, compares work, saves assets and reuses an image as a new reference.

## Provider compatibility

Supported configuration classes:

- Official OpenAI endpoint.
- OpenAI-compatible endpoint whose capabilities have been verified by Lensflow probes.

The analysis model must support image understanding and a validated structured response. The image model is configured independently. `gpt-image-2` belongs to generation/editing, not strict structured analysis.

Capability states are `unknown`, `supported`, `unsupported` or `degraded`. Required checks include vision analysis, Structured Outputs, image generation, image editing and optional background tasks.

## Data ownership

- Projects and assets live in extension-origin IndexedDB.
- API credentials never enter repository files, URLs, page storage or the website JavaScript context.
- A versioned export contains non-secret settings, metadata and optionally user-selected assets.
- Deletion is available independently for assets, history, cached responses and credentials.

## Success criteria for the first runnable release

- A fresh user can install, configure one Provider, import a reference and generate a four-image batch without a Lensflow account.
- Every outbound request identifies Provider, base URL, model and payload category.
- Invalid structured responses fail validation without corrupting the project.
- A one-position batch failure can be retried without replacing completed outputs.
- Extension and Studio share project data through the versioned bridge.
- Export, reset and migration tests pass before release packaging.
