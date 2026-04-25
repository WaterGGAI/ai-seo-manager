# AI SEO Manager

AI SEO Manager is an open-source platform for managing AI-powered SEO workflows across multiple websites.

It helps small businesses, content teams, agencies, and developers centralize SEO operations such as keyword planning, topic generation, metadata generation, structured data suggestions, internal link recommendations, content gap analysis, publishing workflows, and site-level SEO automation.

The project is designed to be Cloudflare-first, lightweight, extensible, and practical for real-world multi-site operations.

## Why This Project Exists

Most small teams do not need a heavyweight enterprise SEO suite.
They need one place to manage:

- multiple websites
- keyword and topic planning
- AI-assisted content workflows
- technical SEO checks
- publishing and deployment steps
- repeatable operating procedures

AI SEO Manager is being built to solve that problem with a developer-friendly, open architecture.

## Core Goals

- Multi-site AI SEO management
- Cloudflare-first deployment
- Extensible connector model for different website types
- AI-assisted content workflow orchestration
- Search Console and ranking workflow integration
- SEO audit and repair workflow support
- Open documentation and contribution-ready project structure

## Target Users

- Small business owners
- Independent website operators
- SEO consultants
- Content teams
- Agencies managing multiple websites
- Developers building SEO tools on top of Cloudflare

## Planned Feature Areas

- Website project registry
- Connector-based site onboarding
- Keyword and topic database
- AI-generated content briefs
- Meta title and description generation
- Structured data recommendations
- Internal link suggestions
- Content gap analysis
- Technical SEO audits
- Publishing and build-sync workflows
- Search Console integration
- Multi-site automation dashboard

## Architecture Direction

This project follows a Cloudflare-first stack:

- Workers for API and orchestration
- D1 for structured control-plane data
- KV / R2 for content and asset-related storage when needed
- Pages or Worker-based delivery depending on site type

The current product direction supports multiple publish modes:

- `kv_runtime`
- `d1_override`
- `api_feed_build_sync`

## Repository Structure

- `docs/` project docs, OSS application notes, architecture, deployment guidance
- `frontend/` future operator-facing UI app
- `worker/` Cloudflare Worker control-plane service
- `schema/` shared data model and schema notes

## Current Status

This repository is the public open-source shell for the AI SEO platform effort.

The private/working implementation currently exists across real-world projects and internal operational repos. This public repo is intended to become the canonical open-source version, with documentation, examples, and deployable modules extracted into a clean contribution-friendly structure.

See:

- [ROADMAP.md](./ROADMAP.md)
- [docs/architecture.md](./docs/architecture.md)
- [docs/project-status.md](./docs/project-status.md)
- [docs/open-source-application.md](./docs/open-source-application.md)

## Quick Start

```bash
cd worker
npm install
npm run dev
```

## License

[MIT](./LICENSE)
