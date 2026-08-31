# Release, Update And Migration Plan

Status: `PARTIAL` as of v0.3.0. GitHub Releases, GitHub Pages, SHA-256, build provenance, stable/beta feeds and manual ZIP reminders are implemented. Chrome Web Store publication is `DEFERRED`.

## Distribution channels

### Chrome Web Store

- Store installations use the browser's signed automatic update mechanism.
- The website links to the verified listing and displays the installed version when the bridge is available.
- The extension must not replace or bypass the store updater.

### GitHub Releases

- Each release contains a reviewed MV3 ZIP, `release-manifest.json`, `SHA256SUMS.txt` and human-readable notes.
- GitHub ZIP users receive an in-product version notice and manual update instructions.
- A normal unpacked/ZIP installation is not advertised as automatically self-updating.

### GitHub Pages

- Pages will host the static product website, documentation, download metadata and online Studio shell.
- Pages remains disabled until the web build, route fallback and extension handshake pass production-origin tests.

## Release manifest

The manifest follows `packages/contracts/schemas/release-manifest.schema.json` and records:

- schema version and product version;
- stable or beta channel;
- publication time and changelog URL;
- minimum supported database schema version;
- one or more browser/distribution artifacts;
- artifact URL, byte size and SHA-256.

The extension validates schema, channel, semantic version and checksum metadata before displaying an update. It never executes or silently installs a downloaded artifact.

## Release gates

A release cannot be created until all of the following pass:

- unit, integration and end-to-end tests;
- MV3 manifest and permission review;
- production build and package-content allowlist;
- fresh-profile install and upgrade tests;
- Provider contract fixtures and at least one authorized live smoke test per claimed Provider class;
- IndexedDB migration, backup and restore tests;
- desktop and narrow-view visual regression tests;
- accessibility checks for keyboard, focus, contrast and reduced motion;
- secret scan and dependency audit;
- remote ZIP hash verification.

## Database migration

Every database change increments `schemaVersion` and defines:

- source and target versions;
- preconditions;
- forward migration;
- rollback or recovery behavior;
- backup requirements;
- post-migration validation.

Migration sequence:

1. Acquire an application-level migration lock.
2. Export metadata and affected records to a local pre-migration backup.
3. Apply migrations one version at a time in a transaction where supported.
4. Validate required stores, indexes, counts and representative records.
5. Record the migration result in `databaseMeta`.
6. On failure, abort and restore the prior stable state or offer the backup for manual recovery.

## Import and export

- Export format includes a manifest, database schema version, record counts and SHA-256 entries.
- Credentials are excluded by default and require a separate explicit workflow if ever supported.
- Asset blobs are optional so users can choose a metadata-only or full backup.
- Import performs a dry validation before writing and reports conflicts, unsupported versions and required disk space.

## Current release state

- `IMPLEMENTED`: tagged GitHub releases, reviewed MV3 ZIP, SHA-256, GitHub artifact attestation, Pages deployment and manual ZIP installation instructions.
- `IMPLEMENTED`: `ReleaseManifestV2` with bridge/data versions, migration requirement and channel-specific artifacts.
- `IMPLEMENTED`: separate `latest.json` and `beta.json`; ZIP checks run at most once every 24 hours and never install automatically.
- `DEFERRED`: Chrome Web Store listing and browser-managed store updates.
- `UNKNOWN`: real Provider compatibility until an authorized live smoke test passes.
