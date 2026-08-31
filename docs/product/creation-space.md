# Creation Space Specification

Status: `PARTIAL` as of v0.3.0. The shared Studio implements the five-step workflow, five axes, capability preflight, partial batch recovery and fan reveal. Advanced physical reveal states and full mobile editing are `DEFERRED`.

## Workspace model

The selected UI is a precision workbench. The implemented 1024 px layout uses two persistent regions plus contextual panels; a third Provider/inspection rail appears only when width permits:

- top command strip for project, local-save state, undo/redo and the primary generation action;
- left source sidebar for references, keywords and palettes;
- central canvas for relationships, prompt composition, five-axis control and current results;
- right inspector for generation settings, capability preflight and contextual history.

The experienced-user state uses the selected Precision Creative Workbench. The first-run state adds the slim guided progress strip from the Guided Precision Workbench revision without changing the underlying workspace.

## Five-axis model

Each project hand contains exactly five axes:

| Axis | Responsibility | Example controls |
| --- | --- | --- |
| Style | Rendering language and visual character | medium, era, finish, realism |
| Subject | Entities and semantic focus | identity, object, pose, attributes |
| Composition | Spatial and camera organization | framing, viewpoint, balance, depth |
| Color | Palette and tonal relationships | swatches, temperature, contrast |
| Motion | Movement or stillness | gesture, camera motion, environmental motion |

Each row exposes the current fragment, editable state, lock state and reroll action. `Reroll unlocked` replaces only unlocked fragments. A reroll is recorded in project history so undo restores the previous hand.

## Reference relationship

- A project can use several references with explicit roles: subject/image, face/identity, pose and palette.
- A reference may contribute subject, style, composition, color or more than one role.
- Numeric influence percentages are intentionally omitted because most Provider APIs cannot guarantee exact weighting.
- The final prompt view displays the currently selected relationship before generation.
- Missing saved terms trigger an inline action to extract starter keywords or load the bundled example.

## Composer

The Composer owns:

- editable final prompt;
- selected word fragments and exclusions;
- analysis model and image model visibility;
- aspect ratio and output count;
- palette swatches;
- reference relationship summary;
- Provider capability preflight;
- primary batch action.

Generation stays disabled only when a required capability is unsupported, configuration is invalid or the user has not acknowledged the outbound payload. Unknown optional capabilities produce a warning rather than an unrelated hard stop.

## Batch lifecycle

Each batch contains fixed output positions with independent states:

```text
queued -> running -> completed
                  -> failed -> retrying -> completed
                                      -> failed
```

Rules:

- Completed positions are immutable during a targeted retry.
- Retry requests include only failed positions.
- A cancelled batch preserves completed assets and records unfinished positions as cancelled.
- Provider request identifiers are stored when available, but never treated as portable across providers.
- Cost is not calculated unless the Provider returns authoritative usage data; otherwise it is `unknown`.

## 画函 reveal lifecycle

The result object progresses through:

```text
sealed -> tearing -> burst -> fan -> flipping -> gallery
```

Interaction defaults:

- About 150 px of drag maps to complete reveal progress.
- About 62% progress or a qualifying fast fling commits the open action.
- Releasing before the threshold returns to the previous stable state.
- Buttons provide equivalent `Open`, `Back`, `Next` and `View gallery` operations.
- Reduced motion skips tearing/burst animation and moves directly to the stable fan or gallery state.

Lensflow uses a flat reveal tray integrated into the central workspace. It must not consume the height needed for prompt editing or five-axis control.

## History and reuse

History entries retain:

- source reference identifiers and provenance;
- validated analysis payload;
- five-axis hand and lock state;
- final prompt and exclusions;
- Provider profile ID, base URL origin and models, excluding credentials;
- generation settings and per-position status;
- links to locally stored output assets.

A completed output can be dragged or explicitly sent back to the reference inbox. This creates a new reference record and preserves the parent relationship rather than mutating the original output.

## Failure handling

- Bridge unavailable: keep the Studio readable, show install/reconnect action and preserve unsent local edits in page memory only.
- Provider unreachable: distinguish network, authentication, rate limit and timeout states.
- Capability mismatch: name the missing operation and offer model/profile changes.
- Invalid structured response: keep raw response in a bounded diagnostic record, mark validation failure and do not populate project fields.
- Storage quota: stop new writes, offer export and cleanup, and never silently evict user assets.
- Migration failure: roll back to the previous schema when possible and offer the pre-migration backup.
