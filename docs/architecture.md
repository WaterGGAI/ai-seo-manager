# Architecture

## Product Shape

AI SEO Manager is designed as:

- one control plane
- many managed websites
- one shared SEO data model
- multiple publish adapters

## Main Building Blocks

### Control Plane

The control plane is responsible for:

- managed site registration
- connector-based onboarding
- keyword and topic planning
- SEO workflow state
- audit and repair coordination
- publishing and build-sync orchestration

### Connectors

Different websites need different publishing models.
The system is designed to support connectors such as:

- runtime-published content sites
- structured-override programmatic SEO sites
- API-feed build-sync sites

### Workflow Modules

Reusable modules should eventually cover:

- keyword planning
- topic generation
- AI content generation
- metadata generation
- internal link recommendations
- structured data suggestions
- audit summaries
- publishing triggers

## Cloudflare-First Direction

The initial open-source architecture assumes:

- Cloudflare Workers for orchestration
- D1 for structured site and workflow state
- optional KV / R2 for content or assets
- Pages or Worker-based delivery depending on the site connector

## Intended Open Boundaries

The project should stay open to:

- alternative LLM providers
- additional publish adapters
- external CMS inputs
- site-specific routing strategies
- third-party SEO data providers
