# TAP by Haluan

Mobile-first creator platform for Haluan Digital Network: extra affiliate commission, attributed campaign links, creator membership, product sample requests, and internal operations.

## Local development

```bash
cp .env.example .env.local
npm install
npm run dev
```

The public catalog works without credentials. Account, request, and admin flows intentionally fail closed until a dedicated Redis datastore is configured.

## Quality commands

```bash
npm test
npm run lint
npm run build
npm audit
npm run test:e2e
# one complete local quality pass
npm run qa
# five-pass release evidence; log + SHA-256 sidecar go to ignored outputs/
npm run gate
# after production services are configured
npm run smoke:production -- https://tap.haluandigital.agency
```

`npm run gate` checks the exact unit/contract and E2E cardinalities committed in `release-gate-baseline.json`. An intentional test addition updates that baseline in the same review; unexpected test-discovery shrinkage fails the gate. The unit suite emits TAP explicitly, and the gate forces Playwright's line reporter while retaining its HTML report, so local and CI evidence use the same parseable summary contract without dropping the browser artifact.

## Architecture

- Next.js App Router on Vercel.
- In production, Redis holds separate private TikTok and Shopee campaign feeds; the public API derives sanitized platform catalogs that carry no URLs. Sheet exports remain sync/development inputs only.
- Individual campaign links are public by design so creators can share them, served through throttled endpoints, with attribution recorded on `/go/{campaignId}`. The operational feed behind them stays server-only.
- Upstash Redis stores users, opaque sessions, profiles, sample requests, attribution events, rate-limit counters, and audit events.
- Passwords use salted `scrypt`; browser cookies contain only random session tokens.
- Admin and creator access are enforced server-side.

See [PRODUCT-AND-CONTENT.md](./PRODUCT-AND-CONTENT.md), [PRODUCTION-READINESS.md](./PRODUCTION-READINESS.md), [OPERATIONS-RUNBOOK.md](./OPERATIONS-RUNBOOK.md), and the combined TikTok/Shopee handoff checklist [BRAND-LOGO-GAPS.md](./BRAND-LOGO-GAPS.md).

## Link exposure classification

One classification, used by every document, alert, and incident call:

| Tier | Contents | Exposure |
|---|---|---|
| Aggregated catalog | Brand, category, rate, benefits — no URLs | Public, CDN-cached |
| Individual campaign link | One affiliate URL for one brand | Public but throttled; attribution runs through `/go/{campaignId}` |
| Operational feed | Master CSV/Redis feed, worksheet links, ops notes, PIC and creator PII | Private, server-only |

A public individual affiliate URL is intended behaviour, not an incident. An exposed **operational feed** — or any creator PII — is.
