# Vendored img2threejs

This directory contains a complete source snapshot of the upstream
`img2threejs` project, excluding only its Git repository metadata.

- Upstream: https://github.com/img2threejs/img2threejs
- Commit: `d6673386f89673a58736f8d398dd16ece67874f5`
- Upstream version: `1.4.4`
- Retrieved: `2026-08-12`
- License: Apache License 2.0 (see `LICENSE`)

The snapshot is vendored as an offline reconstruction toolkit for Yantai.
It is not bundled into the Chrome extension runtime and is not an npm
dependency. The Python tooling requires Python 3.10 or later and uses only the
standard library for its core workflow.

To update the snapshot, export a reviewed upstream commit with `git archive`,
replace the tracked upstream files in this directory, retain this provenance
record, and run both the upstream Python tests and the Yantai checks.
