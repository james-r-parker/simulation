# Deploying Blob Evolution

The site runs on Cloudflare Pages (project `matrix`, domain `matrix.dotnethelp.co.uk`), deployed by GitHub Actions. The
design is [docs/designs/deployment-and-community.md](docs/designs/deployment-and-community.md); this page is the
operator's view. Cloudflare's own Git integration is switched off, so nothing deploys twice.

## What deploys what

| Event                                         | Workflow                           | Result                                                                                    |
| --------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------- |
| Merge of the Release Please PR                | `release-please.yml`, `deploy.yml` | Production: `/` serves the new release, `/v/<version>/` serves it forever                 |
| Push to `main` (or `season/next`), check green | `preview.yml`                      | `/next/` (Pages branch `next`; `main-latest` while `season/next` exists)                  |
| Pull request from this repo, check green      | `preview.yml`                      | A preview URL, commented on the PR; it reads the `-preview` database                      |
| Pull request from a fork                      | none                               | Skipped (`DeploySkipped`, reason `fork`)                                                  |
| `gh workflow run deploy.yml -f tag=v<x.y.z>`  | `deploy.yml`                       | Rebuilds that tag and redeploys it to `/` (rollback); the version and `releases` row are no-ops |

A merge to `main` never changes production. Production changes only when the release PR is merged (or `deploy.yml` is
dispatched by hand).

## One-time setup

The numbered steps are in the design doc, "Phase 1 setup checklist (user)". In short:

1. GitHub, Settings, Environments: `preview` and `production` each hold secrets `CLOUDFLARE_API_TOKEN` and
   `CLOUDFLARE_ACCOUNT_ID`; `release` holds the Release App (`RELEASE_CLIENT_ID` variable, `RELEASE_APP_PRIVATE_KEY` secret).
   Repository variables: `PAGES_PROJECT` (`matrix`) and `SITE_DOMAIN` (`matrix.dotnethelp.co.uk`).
2. Both tokens need `Account / Cloudflare Pages / Edit` and `Account / D1 / Edit`. Keep the preview and production tokens
   separate: a pull request deploy must not reach production.
3. In the Cloudflare dashboard, set automatic deployments for the Pages project to Disabled.

A job that finds its environment missing a secret fails at its first step and names the setting; it deploys nothing.

## Releasing

1. Merge changes to `main` with conventional commit subjects (`feat:`, `fix:`, `feat!:`).
2. Release Please keeps one release PR open (it edits `CHANGELOG.md`, `package.json` and the manifest). Its `check` and
   `browser-smoke` must pass.
3. Merge it. `release-please.yml` creates the tag and the GitHub Release and calls `deploy.yml` with the tag:
   `build` runs `npm run build:release -- <version>` (the versioned build under `/v/<version>/`, the latest at `/`, the
   tarball and `release-entry.json`); `deploy` applies the D1 migrations, deploys the version to its own Pages branch
   `v<major>-<minor>-<patch>`, registers the release in the D1 `releases` table, then deploys `/`.

A change to the game rules (`rulesHash`) is a breaking commit (`feat(sim)!: ...`) that targets `season/next`;
`node scripts/release-check.mjs` fails a pull request that breaks this rule.

## Rollback

```
gh workflow run deploy.yml -f tag=v<previous version>
```

This rebuilds the older tag and redeploys it to `/`. `/v/index.json` is unchanged. (`wrangler pages deployment rollback`
is not used until it is verified to exist; see the design doc's task T5.)

## Manual deploy

`npm run deploy` runs `wrangler pages deploy dist` from your machine with your own login. Do it only when you mean to
change the site by hand; the workflows above are the normal path.

## Local checks without a Cloudflare account

- `npx vitest run test/library test/functions` runs the library modules and the Functions against SQLite.
- `npx wrangler d1 migrations apply blob-library --local` applies `migrations/` to a local database in `.wrangler/`.
- `npm run build && npx wrangler pages dev dist --d1 DB=blob-library` serves the site and `/api/` on Miniflare.
