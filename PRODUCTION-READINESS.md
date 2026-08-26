# TAP Production Readiness

## Implemented

- Credential registration and login with salted `scrypt` password hashes.
- Thirty-day server sessions using random opaque tokens and secure HttpOnly cookies.
- Google OAuth authorization-code flow with verified-email requirement.
- Server-side creator/admin role gates.
- Membership lifecycle: `pending`, `verified`, `rejected`.
- Server-only campaign link lookup and attributed `/go/{campaignId}` redirects.
- Request sample persistence with unique request IDs and controlled status transitions.
- Admin workflows for membership and sample approvals, with append-only audit events.
- Admin attribution metrics for total opens and campaign-level counters.
- Creator profile persistence and request history.
- Rate limiting, origin checks, open-redirect prevention, security headers, robots, sitemap, privacy policy, and terms.
- `/api/health` fails with HTTP 503 until Redis, both private TikTok/Shopee campaign feeds, and the admin allowlist are ready. Its public response intentionally exposes only `status`; Google OAuth availability is passed directly from the server-rendered registration page.
- Mobile and desktop Chromium plus mobile WebKit E2E coverage, axe-core accessibility gates, and a GitHub Actions quality gate.
- Production catalog and link resolution read separate private Redis feeds for TikTok and Shopee. Catalog records exclude raw links. Individual campaign links are intentionally public for creator sharing, protected by request throttling, and attribution still passes through `/go/{campaignId}`.
- Aggregated catalog responses contain no URLs and use short CDN/browser caching. Individual campaign links are public by design, throttled, and served uncached.
- Homepage and `/deals` are server-rendered for discovery. The client receives one active catalog at a time and lazy-loads the second platform only when selected.

## Required production configuration

A dedicated Upstash Redis resource is connected to the Vercel production environment with `KV_REST_API_URL`, `KV_REST_API_TOKEN`, and `ADMIN_EMAILS`. Google sign-in is optional and requires `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` before its button appears.

Split campaign data into two security zones:

- `CAMPAIGN_CATALOG_STORAGE=redis`: required in production so the catalog is derived server-side from private storage.
- `CAMPAIGN_CATALOG_CSV_URL`: optional development/QA override; never use a public raw-link sheet in production.
- Preferred: set `CAMPAIGN_LINKS_STORAGE=redis` and import the operational CSV with `npm run sync:campaign-links -- <https-csv-url>`. The application then reads raw TAP links directly from its private Redis resource.
- Set `SHOPEE_CAMPAIGNS_STORAGE=redis` and import the Shopee CSV with `npm run sync:shopee-campaigns -- <https-csv-url>`. The Shopee feed is required by the production health gate.
- Alternative: `CAMPAIGN_LINKS_CSV_URL` may point to a private server-only feed containing TAP links. Protect it with `CAMPAIGN_LINKS_AUTH_TOKEN` when the endpoint supports bearer authentication.

The app intentionally fails closed when storage is absent: it does not create fake accounts, fake requests, or expose deal links.

## Google OAuth

Authorized JavaScript origins:

- `https://haluan-tap.vercel.app`
- `https://tap.haluandigital.agency`

Authorized redirect URIs:

- `https://haluan-tap.vercel.app/api/auth/google/callback`
- `https://tap.haluandigital.agency/api/auth/google/callback`

## Operational launch

1. Register and verify the intended operator first, sign out and sign back in to prove the email index resolves that same account, then add the address to `ADMIN_EMAILS` and redeploy. Never leave an unregistered address in the allowlist; rerun the admin audit after grant and require all eight dimensions to be zero.
2. Verify 20–30 closed-beta creators in `/admin`.
3. Confirm click attribution and request lifecycle for at least one complete campaign.
4. Verify the aggregated catalog carries no URLs, campaign-link requests are throttled, the operational feed stays server-only, and `/go/` attribution remains active.
5. Add verified campaign image, validity dates, expiry, and sample quota to the Sheet.
6. Run `npm run gate`, retain its log and SHA-256 sidecar, and confirm the GitHub Actions gate is green for the exact SHA it checked out.
7. Run a privacy and incident-response review with the operating team before paid acquisition.

After configuration, run `npm run smoke:production -- https://tap.haluandigital.agency`. The command must pass without `--allow-configuration-required` before launch. The smoke gate validates the credential sign-in entry even when Google OAuth is deferred. Incident handling, rollback, credential rotation, and operational evidence requirements are defined in `OPERATIONS-RUNBOOK.md`.
