# Gutterbugs Form Worker

Cloudflare Worker that proxies contact form submissions to Mission Control.

## Setup

1. Install wrangler: `npm install -g wrangler`
2. Login: `wrangler login`
3. Deploy: `cd worker && wrangler deploy`

## Environment Variables

Set in Cloudflare dashboard or wrangler.toml:

- `MISSION_CONTROL_URL` — Mac Mini Mission Control API (default: http://100.90.199.12:3000)
- `ALLOWED_ORIGINS` — Comma-separated allowed origins for CORS

## Flow

```
gutterbugs.co.uk form → Cloudflare Worker → Mission Control API
                                              ├── SQLite DB
                                              ├── Xero contact
                                              ├── iCloud contact
                                              └── gclid resolution
```

## After Deploy

The worker URL will be something like:
`https://gutterbugs-form.<your-subdomain>.workers.dev`

Set this as `PUBLIC_FORM_ENDPOINT` in the Astro site's environment,
or use a custom route in Cloudflare (e.g. gutterbugs.co.uk/api/contact).
