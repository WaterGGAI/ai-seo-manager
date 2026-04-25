# AI SEO Control Plane

Public Cloudflare Worker package for a multi-site AI SEO control plane.

This directory is a sanitized open-source export of the real project core:

- real customer domains were replaced with `*.example`
- local filesystem paths were replaced with `/workspace/examples/...`
- workflow modules use example source labels
- site manifests and bootstrap seeds are sample data only

Included here:

- `src/`: Worker routes, core jobs, admin UI, connector model
- `migrations/`: D1 schema for sites, settings, jobs, repairs, ranking, build sync
- `config/sites.json`: example managed-site manifest
- `test/`: worker and pipeline tests using sample site IDs

This package is meant to show the architecture and implementation approach without publishing private operating data.
