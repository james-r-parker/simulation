### 2026-11-08 - The preview pipeline checked by hand on Cloudflare (deployment T5, partly)

- `wrangler d1 migrations apply blob-library-preview --env preview --remote` applied 0001 and 0002. A `wrangler pages deploy dist --branch verify-375` preview read the preview database: `/api/champions` answered `{"items":[],"next":null}` while the production database still had no tables, so the `[env.preview]` binding is the one a preview branch uses.
- `GET /api/seasons` answered `cache-control: public, s-maxage=300` and `cf-cache-status: HIT` on a repeat, so the Cache API path works on a deployed Function. A HEAD request shows `max-age=0, must-revalidate`: read the cache headers with GET.
- A deploy with `--branch next` serves at `next.matrix-6be.pages.dev`, and `/next` on another deployment proxies to it with a 200.
- Not checkable before a release: `/v/<version>/`, whether the `v6-0-0` branch deployment persists, a second workflow from the App-token release, and the rollback.
