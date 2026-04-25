# Cloudflare Deployment

## Initial Stack

- Cloudflare Workers
- Cloudflare D1
- Optional KV / R2

## Environment Direction

Secrets should never be committed.
Use Cloudflare secrets for:

- auth credentials
- deploy hooks
- provider tokens
- external API keys

## Worker Development

```bash
cd worker
npm install
npm run dev
```

## Worker Deployment

```bash
cd worker
npm run deploy
```

## Notes

- Keep deployment examples provider-safe and public-repo friendly
- Prefer documented extension points over hardcoded project-specific behavior
