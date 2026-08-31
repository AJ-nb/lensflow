# Lensflow Architecture

Status: `PARTIAL` as of v0.3.0. The MV3 extension, Astro site, shared UI/contracts, IndexedDB, Provider adapters and v2 bridge are implemented and tested. Live third-party Provider behavior and Viko private internals remain `UNKNOWN`.

## Monorepo boundaries

```text
apps/extension  -> Chrome MV3 capture, local data, Provider execution, bridge
apps/site       -> Astro product/docs shell and React Studio islands
packages/core   -> Provider-neutral domain logic and state transitions
packages/ui     -> shared tokens and accessible controls
packages/contracts -> JSON Schema contracts for storage, bridge and releases
```

The website does not become a general proxy. Provider credentials and authenticated requests remain inside the extension origin.

## Runtime topology

```text
Public page / Studio
        |
        | allowlisted, versioned message bridge
        v
Chrome MV3 extension
        |-- extension-origin IndexedDB
        |-- Provider adapters
        |-- release manifest checker
        `-- import/export and migrations
```

Without the extension, the website can render product information, documentation and a bundled local example. It cannot perform credentialed Provider operations.

## Local storage

Planned IndexedDB stores:

| Store | Purpose | Contains secrets |
| --- | --- | --- |
| `providerProfiles` | Provider names, base URLs, models and capabilities | No |
| `providerSecrets` | API credentials referenced by opaque IDs | Yes |
| `projects` | Project metadata and current composition | No |
| `references` | Source provenance and local blob references | No |
| `assets` | Imported and generated blobs plus metadata | No |
| `jobs` | Batch and per-position state | No |
| `history` | Reversible user actions and generation provenance | No |
| `preferences` | UI and onboarding state | No |
| `databaseMeta` | Schema and migration history | No |

Secrets are never returned through the bridge, included in exports by default or written to logs. Browser-local storage is a privacy boundary, not cryptographic protection against a compromised extension profile.

## Provider adapters

Each adapter exposes separate operations:

- `probeCapabilities`
- `analyzeReference`
- `generateImages`
- `editImage`
- `getBackgroundJob`
- `cancelBackgroundJob`

An adapter cannot declare a capability based only on a successful base-URL request. Capability probes record model, operation, timestamp, result and bounded diagnostic detail.

Structured analysis uses a vision-capable language model and validates the response before domain objects are stored. `gpt-image-2` is an image generation/editing path and is not used as a substitute for strict Structured Outputs analysis.

## Site bridge

The bridge contract requires:

- protocol version;
- unique request ID;
- verified page origin;
- enumerated action;
- schema-validated payload;
- bounded response and error envelope.

Allowed production origins are compiled into the extension and reviewed for every release. Development origins are available only in development builds.

Forbidden bridge behavior:

- read or return a raw API Key;
- arbitrary authenticated `fetch`;
- arbitrary filesystem or browser-profile access;
- wildcard production origins;
- executing payload code;
- accepting unversioned messages.

## Job recovery

Every generation batch owns stable position IDs. A retry references failed position IDs and creates a new attempt under the same batch. Completed positions are never regenerated implicitly.

Provider background jobs are polled by their original response ID when supported. A browser timeout does not create a replacement paid generation. A synchronous fallback is allowed only after the Provider explicitly rejects background execution and before any billable job was accepted.

## Asset provenance

Each reference or generated asset records:

- stable local ID;
- source kind and optional source URL;
- capture/import time;
- MIME type, dimensions and SHA-256;
- project and parent asset relationships;
- Provider/model provenance for generated assets;
- user labels and axis roles.

Observed and measured properties remain separate from inferred semantic properties. Unknown fields remain unknown rather than receiving plausible defaults.

## Security and privacy controls

- Content Security Policy appropriate for MV3 and the static site.
- Minimal extension permissions with optional host permissions for configured Providers.
- Redacted errors and logs.
- Schema validation at storage, bridge and Provider boundaries.
- Explicit outbound payload preview.
- Export/import checksum and schema version.
- Migration backup before a destructive schema change.

## UI architecture

The selected Studio layout uses stable sidebars and a flexible center track. Desktop is the primary creation surface. Narrow viewports use sequential views rather than shrinking the full workbench below usable control sizes.

The public site uses Astro for static product/docs routes and React only for extension detection, interactive workflow examples and Studio. Shared UI must preserve the Lensflow warm-paper, ink, rose and jade token system without copying the target brand.
