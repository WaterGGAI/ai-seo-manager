# Cloudflare Deployment

## Initial Stack

- Cloudflare Workers
- Cloudflare D1
- Optional KV / R2

## Working Package

The main deployable open-source package is [`control-plane/`](/Users/gregg/Documents/ChatGPT/ai-seo-manager/control-plane).

Use that directory for local development, tests, and deployment examples.

## Environment Direction

Secrets should never be committed.
Use Cloudflare secrets for:

- auth credentials
- deploy hooks
- provider tokens
- external API keys

## Local Development

```bash
cd control-plane
npm install
npm run dev
```

Optional checks:

```bash
cd control-plane
npm test
npm run typecheck
```

## Configure D1

Before real deployment, replace the placeholder D1 values in:

- [`control-plane/wrangler.jsonc`](/Users/gregg/Documents/ChatGPT/ai-seo-manager/control-plane/wrangler.jsonc)

Then create and migrate your database:

```bash
cd control-plane
wrangler d1 create ai_seo_control_example
npm run db:migrate:local
```

## Set Secrets

At minimum:

```bash
cd control-plane
wrangler secret put BASIC_AUTH_USERNAME
wrangler secret put BASIC_AUTH_PASSWORD
```

Optional integrations can add:

- Search Console service account secrets
- deploy hook URLs
- GitHub repository dispatch tokens
- external provider API keys

## Worker Deployment

```bash
cd control-plane
npm run deploy
```

## Notes

- Keep deployment examples provider-safe and public-repo friendly
- Prefer documented extension points over hardcoded project-specific behavior
- Keep sample site manifests sanitized if you publish your own fork
