# Deployment and community

**Status:** Proposed - Phase 1 deploys every merge to `main` to Cloudflare Pages and every same-repo PR to a preview; Phases 2 to 4 add a read-only gene library, verified community uploads and an `npx` contributor trainer.
**Validated:** d884fb3 (2026-10-16)
**Priority:** 6 - the last stage: put v6 online, then open it to the community (user, 2026-10-16)
**Depends on:** [worker-and-renderer.md](worker-and-renderer.md), [evolution-rework.md](evolution-rework.md), [evolution-evals.md](evolution-evals.md), [v6-tidy-up-and-docs.md](v6-tidy-up-and-docs.md), [quality-gates-and-test-tiers.md](quality-gates-and-test-tiers.md)

The app is published on Cloudflare Pages by GitHub Actions, and then opened to the community:

- Phase 1 needs none of the other docs built, and is built at the end of v6: a PR gets a preview URL, a merge to
  `main` deploys production.
- Phase 2 serves a library of champion files (R2 for the files, D1 for the index, Pages Functions for the API) and a
  "Gene library" drawer in the app. It is seeded with the project's own trained champions.
- Phase 3 accepts uploads from signed-in GitHub users. Uploads are untrusted; a nightly GitHub Actions run verifies
  each one with the champion league, and only verified champions are ranked.
- Phase 4 publishes an npm package so a contributor runs `npx blob-evolution train --hours 8 --upload`.
- Phases 2 to 4 need the renderer's app shell ([worker-and-renderer.md](worker-and-renderer.md) Phase 2), the trainer
  and `public/champions/v1/` ([evolution-rework.md](evolution-rework.md) Phase 3, behind its world gate), and the
  league ([evolution-evals.md](evolution-evals.md) Phase 4, built).

## Seasons

A champion is valid for one ruleset: its `rulesHash` (`rulesHash` in [config.js](../../js/sim/config.js)) and brain
layout (`brainLayout` in [brain-layout.js](../../js/sim/brain-layout.js)) must equal the running world's. The library
is organised in seasons, one ruleset each.

- `library/seasons.json` is `[{ "season", "rulesHash", "layout": { "inputCount", "brainHidden", "outputCount" }, "opened", "packageMajor" }]`,
  oldest first. It is empty until the world gate in [evolution-rework.md](evolution-rework.md) Phase 3 passes. Season 1
  is the first entry, added in the PR that exports `public/champions/v1/`.
- `packageMajor` equals `season`: the npm package for season `n` is version `n.x.y`.
- A `conventions` test fails when the newest entry's `rulesHash` differs from `rulesHash(createConfig())`, so a rules
  change cannot merge without a new season entry.
- A new season is opened by one PR: a new `library/seasons.json` entry, retrained champions, a package major bump.
- The newest season is current. Older seasons stay listed and downloadable; their champions cannot be seeded into a
  newer ruleset (`canSeed` in `js/library/seasons.js`; the worker's `validateChampion` check repeats it).
- Uploads are accepted for the current season only. A pending upload of a closed season is rejected with reason
  `season_closed`.

## Phase 1 setup checklist (user)

Run once, in this order. Nothing here is committed except the names.

1. Create the Pages project: `npx wrangler pages project create blob-evolution --production-branch main` (direct
   upload; no Git integration).
2. Cloudflare dashboard, My Profile, API Tokens, Create Custom Token: `Account / Cloudflare Pages / Edit`, scoped to the
   account. Copy the token.
3. Copy the Account ID from the dashboard sidebar.
4. GitHub, repo Settings, Secrets and variables, Actions: add secrets `CLOUDFLARE_API_TOKEN` and
   `CLOUDFLARE_ACCOUNT_ID`, and the variable `PAGES_PROJECT` = `blob-evolution`.
5. GitHub, repo Settings, Actions, General: workflow permissions "Read repository contents"; fork PR workflows
   "Require approval for all outside collaborators".
6. Re-read Cloudflare's current free-plan limits for Pages, Workers, R2 and D1 against the table in
   [Free-tier budget](#free-tier-budget); record any difference in [sim-notes.md](sim-notes.md).

## Phase 2 setup checklist (user)

7. `npx wrangler d1 create blob-library` and `npx wrangler d1 create blob-library-preview`; paste both
   `database_id` values into `wrangler.toml`.
8. `npx wrangler r2 bucket create blob-genomes` and `npx wrangler r2 bucket create blob-genomes-preview`.
9. Widen the API token from step 2 with `Account / D1 / Edit` and `Account / Workers R2 Storage / Edit`.
10. After the production deploy, `npm run library:seed -- --remote` loads the project's champions.

## Phase 3 setup checklist (user)

11. GitHub, Settings, Developer settings, OAuth Apps, New: homepage the production URL, callback
    `<production URL>/api/auth/callback`, "Enable Device Flow" ticked. Note the client id and generate a client secret.
12. Cloudflare dashboard, Turnstile, Add widget (Managed), hostname the production domain. Note the site key and secret.
13. Set the Pages secrets, production environment: `npx wrangler pages secret put GITHUB_CLIENT_SECRET --project-name blob-evolution`,
    and the same for `SESSION_SECRET` (32 random bytes, base64), `TURNSTILE_SECRET` and `ADMIN_TOKEN` (32 random bytes, base64).
    Put `GITHUB_CLIENT_ID` and `TURNSTILE_SITE_KEY` in `wrangler.toml` `[vars]`.
14. GitHub Actions: secret `LIBRARY_ADMIN_TOKEN` (the same value as `ADMIN_TOKEN`), variable `LIBRARY_API` (the
    production URL).
15. Cloudflare dashboard, Security, WAF, Rate limiting rules: one rule on `POST /api/*`, 20 requests per 10 seconds
    per IP, action Block (the one rule the free plan allows).

## Phase 4 setup checklist (user)

16. `npm view blob-evolution` returns 404 (the name is free); otherwise pick another and change the one constant,
    `PACKAGE_NAME` in `scripts/build-package.mjs`.
17. npm account with two-factor authentication on writes. Create the package by a first CI publish (step 19), not by hand.
18. GitHub, Settings, Environments, New `npm-publish`: required reviewer the user. Add the environment secret
    `NPM_TOKEN`: an npm granular access token, "Read and write", limited to the package `blob-evolution`, 90 days.
19. Push a tag `pkg-v1.0.0`; approve the `npm-publish` environment in the Actions run.

## Phases

### Phase 1 - build and deploy pipeline

**Targets:** none - infrastructure; the deploy times in Performance budget are read from the Actions log

#### Deploy workflow

`.github/workflows/deploy.yml` triggers on `workflow_run` of the `check` workflow ([check.yml](../../.github/workflows/check.yml))
completing, so a deploy only ever follows a passing gate:

| `check` ran on                                      | Result                                                                                |
| --------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `push` to `main`, conclusion `success`              | Production: `wrangler pages deploy dist --project-name $PAGES_PROJECT --branch main`  |
| `pull_request` from this repo, conclusion `success` | Preview: the same command with `--branch pr-<number>`; the URL is commented on the PR |
| `pull_request` from a fork                          | Skipped, logged `DeploySkipped` with reason `fork`                                    |
| any other conclusion                                | Skipped, logged `DeploySkipped` with reason `check-<conclusion>`                      |

- `scripts/deploy-plan.mjs` reads the `workflow_run` event JSON and prints the decision as `GITHUB_OUTPUT` lines
  (`action`, `branch`, `sha`, `pr`). The pure part is `deployPlan(event, repo)` in `scripts/lib/deploy-plan.mjs`.
- The job checks out the exact `head_sha` of the run, runs `npm ci` and `npm run build`, and deploys `dist/`. It never
  runs for `pull_request_target`; the workflow contains no `pull_request_target` trigger.
- `previewComment(url, sha)` in `scripts/lib/pr-comment.mjs` builds the comment body, which starts with the marker
  `PREVIEW_MARKER`; the job updates the PR's existing marked comment, or creates one.
- Permissions: `contents: read`, `pull-requests: write`, `deployments: write`. Secrets are `CLOUDFLARE_API_TOKEN` and
  `CLOUDFLARE_ACCOUNT_ID`, referenced only in the deploy step's `env`.
- `concurrency: deploy-${{ github.event.workflow_run.head_branch }}` with `cancel-in-progress: true` for previews and
  `false` for `main`.
- `wrangler.toml` has `name = "blob-evolution"`, `compatibility_date` and `pages_build_output_dir = "dist"`.
- `npm run deploy` stays as the manual path.

#### AGENTS.md change

The hard rule "Push and open PRs only when the user asks. Deploy only when the user asks." becomes:

> Push and open PRs only when the user asks. Deploy by hand (`npm run deploy`, `wrangler`) only when the user asks.
> The one standing exception: `.github/workflows/deploy.yml` deploys a PR from this repo to a preview and a merge to
> `main` to production after `check` passes. Secrets live in GitHub and Cloudflare, never in the repo.

The Commands table row "Production build / deploy" gains a sentence naming the workflow. Phase 4 adds the
package-publish path to the same exception: only the tag-triggered `publish.yml` publishes, after the user approves
the `npm-publish` environment.

### Phase 2 - read-only gene library

**Targets:** none - infrastructure; the API latency in Performance budget is read from the deployed site by `scripts/library-probe.mjs`

#### Data

`migrations/0001_library.sql` (applied with `wrangler d1 migrations apply`):

| Table       | Columns                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `seasons`   | `season` INTEGER PK, `rules_hash` TEXT, `input_count`, `brain_hidden`, `output_count` INTEGER, `opened` TEXT, `package_major` INTEGER                                                                                                                                                                                                                                                                                                                                 |
| `champions` | `id` TEXT PK (SHA-256 hex of the file's bytes), `season` INTEGER, `rules_hash` TEXT, `specialisation` INTEGER 0 to 4, `name` TEXT, `cell` TEXT null, `uploader_id` INTEGER null (null is an official champion), `created` INTEGER (unix s), `status` TEXT, `reject_reason` TEXT null, `elo` REAL null, `win_rate` REAL null, `games` INTEGER null, `verified_at` INTEGER null, `verified_sha` TEXT null, `attempts` INTEGER default 0, `bytes` INTEGER, `r2_key` TEXT |
| `users`     | Phase 3: `github_id` INTEGER PK, `login` TEXT, `created` INTEGER, `blocked` INTEGER default 0, `blocked_reason` TEXT null                                                                                                                                                                                                                                                                                                                                             |

- `status` is `pending`, `verified`, `rejected` or `removed`. Official champions are inserted `verified`.
- Index `champions_browse` on `(season, status, specialisation, elo DESC, id)`; index `champions_uploader` on
  `(uploader_id, created)` (Phase 3).
- R2 bucket `blob-genomes`, key `s<season>/<id>.json`, the champion file as uploaded.
- `wrangler.toml` binds `DB` (D1 `blob-library`) and `GENES` (R2 `blob-genomes`), and for `[env.preview]` the
  `-preview` database and bucket, so a PR preview never touches production data.

#### API

Pages Functions under `functions/api/`. Every response is JSON except the file download. Errors are
`{ "error": { "code", "message", "field"? } }`.

| Method and path               | Returns                                                                                                                                                     | Cache                                 |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `GET /api/seasons`            | All seasons, newest first, with `current: true` on one, and the package version range                                                                       | `s-maxage=300`                        |
| `GET /api/champions`          | Verified champions: query `season` (default current), `spec`, `sort` (`elo` default, `created`), `limit` (1 to 50, default 20), `cursor`; `{ items, next }` | `s-maxage=60`                         |
| `GET /api/champions/:id`      | One champion's metadata row (never `r2_key`, `attempts` or `uploader_id`; `uploader` is the login or `null`)                                                | `s-maxage=60`                         |
| `GET /api/champions/:id/file` | The champion file from R2                                                                                                                                   | `public, max-age=31536000, immutable` |

- Only `verified` champions are listed or served. Any other status answers 404 `not_found`.
- A cursor is the opaque base64url of the last row's sort key and `id` (keyset paging; no offset scans).
- Modules: `js/library/query.js` (`parseListQuery`, `encodeCursor`, `decodeCursor`), `js/library/seasons.js`
  (`currentSeason`, `seasonOf`, `canSeed`), `js/library/rows.js` (`toPublicChampion`), `js/library/shapes.js` (the
  response shapes and constants shared with the app: `LIST_LIMIT_MAX`, `SPEC_NAMES`). These import nothing outside
  `js/library/`. Handlers in `functions/api/**` are thin: parse, query D1 through `functions/_lib/db.js`
  (`listChampions`, `getChampion`), shape with the pure modules.

#### Seeding the library

`npm run library:seed -- --dir public/champions/v1 [--remote] [--dry-run]` (`scripts/library-seed.mjs`): validates each
file with `validateChampion` ([league.js](../../js/evo/league.js)), takes its Elo from `evals/league.json`, builds rows with
`buildSeedRows(files, season, league)` in `scripts/lib/library-seed.mjs`, and writes them with `wrangler d1 execute`
and `wrangler r2 object put`. It is idempotent: rows are `INSERT OR REPLACE` by content id. `--dry-run` prints the SQL.
`scripts/library-sync-seasons.mjs` does the same for `library/seasons.json`, and the production deploy job runs
`wrangler d1 migrations apply` and the season sync before `wrangler pages deploy`.

#### Gene library drawer

`js/app/ui/gene-library.js` (`mountGeneLibrary`) and `js/app/library-client.js` (`createLibraryClient({ fetch })`),
importing `js/library/shapes.js` and `js/worker/protocol.js` only:

- A drawer button in the controls opens a list: season selector, specialisation filter, sort, one row per champion
  (name, specialisation, Elo, win rate, uploader, created). "Load more" pages with the cursor.
- A row has "Download" (fetches the file, saves it through a Blob and an anchor with `download`) and "Seed world".
- "Seed world" is enabled when `canSeed` holds. Otherwise it is disabled with the text "Season N rules".
- "Seed world" fetches the file and posts the protocol message `seedChampion { file }`; the worker runs
  `validateChampion` against its config, starts a new world with an archive holding only that champion
  (`seedArchive`), and answers `championSeeded` or `error` naming the failed field (logged `ChampionSeedRejected`).
- If the API is unreachable the drawer shows "Library offline" and the rest of the app is unaffected.
- On a PR preview the drawer reads the preview database.

### Phase 3 - uploads and verification

**Targets:** none - infrastructure; the rejection cases and the runner budget are pinned by tests and by the Verification section

#### Sign-in

- Browser: `GET /api/auth/github` sets a `state` cookie and redirects to GitHub's authorize URL with no scopes;
  `GET /api/auth/callback` checks `state`, exchanges the code with `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`, calls
  `GET https://api.github.com/user`, upserts `users` (`github_id`, `login` only), and sets the cookie `session`
  (HttpOnly, Secure, SameSite=Lax, 7 days, HMAC-SHA-256 signed with `SESSION_SECRET`). The GitHub token is discarded.
  `POST /api/auth/logout` clears it. `GET /api/me` returns `{ githubId, login }` or 401.
- CLI: device flow against GitHub, then `POST /api/auth/device { githubToken }`; the Function reads `GET /user` with
  that token, upserts `users`, discards the token and returns `{ token, expires }`, an HMAC-signed bearer valid 30
  days. A blocked account gets 403 `blocked` from both.
- Modules: `js/library/session.js` (`signToken`, `verifyToken`, over WebCrypto, `now` passed in),
  `functions/_lib/auth.js` (`requireUser`, `requireAdmin`; `requireAdmin` compares `Authorization: Bearer` with
  `ADMIN_TOKEN` in constant time).
- Stored personal data: GitHub numeric id and login. No email, no token, no IP address.

#### Upload

`POST /api/champions` with the champion file as the body (`Content-Type: application/json`), cookie session or bearer
token. Browser requests add the header `X-Turnstile: <token>`, checked against `TURNSTILE_SECRET` through Cloudflare's
`siteverify`; bearer requests skip Turnstile and are held to the same rate limits.
`checkUpload(bytes, { config, seasons })` in `js/library/upload-check.js` runs, in order, and the first failure wins:

| #   | Check                                                                                                                                           | Error code (field)               |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| 1   | Body length at most `MAX_UPLOAD_BYTES` (65536), enforced on `Content-Length` and on the bytes actually read                                     | `too_large`                      |
| 2   | UTF-8 JSON object                                                                                                                               | `bad_json`                       |
| 3   | Keys are exactly `version`, `name`, `rulesHash`, `layout`, `specialisation`, `weights` and optionally `cell`                                    | `unknown_key` (the key)          |
| 4   | `validateChampion(file, config)` ([league.js](../../js/evo/league.js)): `version`, `layout.*`, `rulesHash`, `name`, `specialisation`, `weights` | `bad_field` (the field it names) |
| 5   | `name` at most 40 characters of `[A-Za-z0-9 _.-]`; `cell`, when present, an integer pair inside the archive grid                                | `bad_field` (`name`, `cell`)     |
| 6   | Every decoded weight finite and at most `MAX_ABS_WEIGHT` (100) in magnitude                                                                     | `bad_field` (`weights`)          |
| 7   | `rulesHash` equals the current season's; an older season's hash gives `season_closed`                                                           | `season_closed`                  |

Then, outside the pure check: not blocked (`blocked`); the account within its limits (`rate_limited`: at most 5 uploads in a
rolling 24 h and 3 `pending` at once, `rateDecision({ uploads24h, pending })` in `js/library/rate-limit.js`); the whole
queue under 50 `pending` (`queue_full`, 503); `id` = SHA-256 of the bytes, and an existing `pending`, `verified` or
`removed` row answers 409 `duplicate`; then the R2 `put` and the D1 insert with `status` `pending`. `assertGenomeFits`
([genome.js](../../js/evo/genome.js)) is not used: an upload is a champion file, and `validateChampion` is its check.

`GET /api/me/uploads` lists the caller's rows with `status` and `reject_reason`.

#### Browser upload form

The drawer gains an "Upload" tab (`js/app/ui/gene-upload.js`, `mountGeneUpload`): sign in with GitHub, a file picker, a
Turnstile widget, Submit, and "My uploads" with each row's `pending`, `verified` or `rejected - <reason>`. The
protocol message `exportChampions` returns the archive's best elite per specialisation as champion files, using the
selection of `npm run train:export` (moved to `js/evo/champion-export.js`, `pickChampions`, if it lives in the script),
so a player can save and upload what their own world evolved. Uploads are off on previews (`UPLOADS_ENABLED=false`).

#### Moderation

`scripts/library-admin.mjs` (`npm run library:admin -- <command>`), calling the admin endpoints with
`ADMIN_TOKEN` from the environment:

| Command                                               | Endpoint                  | Effect                                                                                  |
| ----------------------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------- |
| `queue`                                               | `GET /api/admin/queue`    | Pending rows, oldest first, with `r2_key`                                               |
| `block <githubId> --reason <text> [--remove-uploads]` | `POST /api/admin/block`   | `users.blocked = 1`; with the flag the account's rows become `removed`                  |
| `unblock <githubId>`                                  | `POST /api/admin/unblock` | `users.blocked = 0`                                                                     |
| `remove <id> --reason <text>`                         | `POST /api/admin/remove`  | `status = removed`, R2 object deleted, row kept so the same bytes cannot be re-uploaded |

The verifier uses `POST /api/admin/verify { id, status, elo, winRate, games, verifiedSha, reason }`; it only moves a
`pending` row to `verified` or `rejected`.

#### Nightly verification

`.github/workflows/verify-uploads.yml`, cron `0 4 * * *` (after the nightly gate at 03:00) and `workflow_dispatch`,
runs `node scripts/library-verify.mjs --api $LIBRARY_API --max-uploads 6 --opponents 6 --workers 4` on a hosted
runner with `LIBRARY_ADMIN_TOKEN`. `timeout-minutes` is 330.

1. Fetch the queue (oldest first, at most `--max-uploads`).
2. For each row: download the file to `.sim/verify/<id>.json`; reject with `season_closed` when its `rulesHash` differs
   from `rulesHash(createConfig())` on `main`; run `validateChampion` again (`invalid` on failure).
3. Run the league: `npm run league -- .sim/verify/<id>.json --opponents 6 --json`: 8 seeds against the first
   `--opponents` admitted champions of `evals/league.json`. The opponents are the project's own champions only, in file
   order. Uploaded champions are never admitted.
4. `verdict({ elo, winRate, games, error })` in `js/library/verify-rules.js`: `rejected` with `league_error` when a game
   threw, `below_floor` when `winRate` is under `MIN_WIN_RATE` (0.1), otherwise `verified`.
5. `POST /api/admin/verify`. A failed attempt increments `attempts`; at 3 the row is `rejected` with `verify_error`.

`scripts/league.mjs` gains `--opponents <n>` (default: all admitted) and `--json` (prints `{ elo, winRate, games }`).
Scores are only ever written by this script; the upload body carries none.

Runner budget. A league game is 100 agents for at most 50000 ticks (`MATCH_TICKS`, `MATCH_AGENTS` in
[league.js](../../js/evo/league.js)). The trainer's measured rate is about 7000 ticks/s over 32 workers
([evolution-rework.md](evolution-rework.md)), so about 220 ticks/s per worker and at most 230 s per game; an early
extinction ends a game sooner, so this is the upper bound.

| Quantity                                               | Value                                      |
| ------------------------------------------------------ | ------------------------------------------ |
| Games per upload (8 seeds x 6 opponents)               | 48                                         |
| Core time per upload                                   | at most 48 x 230 s = 11,040 s              |
| Wall time per upload on 4 workers (public-repo runner) | at most 46 min                             |
| Job time budget                                        | 330 min, of which 30 min setup and slack   |
| Uploads verified per night (`--max-uploads`)           | 6 (6 x 46 = 276 min)                       |
| Accepted per account per day / queue cap               | 5 / 50, so a full queue clears in 9 nights |

The repository is public, so the minutes are free. T-task measurements replace the 230 s figure; `--max-uploads` is the
one constant to change.

### Phase 4 - `npx` contributor trainer

**Targets:** none - tooling; the clean-machine run in Verification is the measurement

#### Package

`npm run package:build` (`scripts/build-package.mjs`) writes `dist-pkg/`, laid out like the repo for the files it
carries so the trainer's relative imports resolve unchanged:

- Files: `js/sim/`, `js/evo/`, `scripts/train.mjs`, `scripts/train-worker.mjs`, `scripts/train-export.mjs`,
  `scripts/lib/` modules they import, `evals/train-seeds.json`, `cli/`, `LICENSE`, a short `README.md`.
- The list is the import closure of `cli/main.mjs` (`importClosure(entry)` in `scripts/lib/import-closure.mjs`); the
  build fails when the closure holds a bare specifier other than `node:*`, so the package has no dependencies.
- The generated `package.json`: `name` `blob-evolution`, `version` `<season>.<minor>.<patch>`, `type` `module`, `bin`
  `{ "blob-evolution": "cli/main.mjs" }`, `engines.node` `>=24`, `files`, `license` MIT, `repository`, and
  `"blobEvolution": { "season", "rulesHash" }` from the newest `library/seasons.json` entry. `prepublishOnly` exits 1
  unless `GITHUB_ACTIONS` is `true`.
- The build fails when `rulesHash(createConfig())` differs from the newest season's, or the major differs from its season.

#### CLI

`cli/main.mjs` dispatches to `cli/train-command.mjs`, `cli/upload-command.mjs`, `cli/login-command.mjs` and
`cli/status-command.mjs`; shared pieces are `cli/auth.mjs` (`deviceFlow`, `loadToken`, `saveToken`), `cli/api.mjs`
(`createApiClient`), `cli/season-check.mjs` (`checkSeason`) and `cli/constants.mjs` (`DEFAULT_API`, `GITHUB_CLIENT_ID`).

`npx blob-evolution train --hours <h> [--workers <n>] [--upload] [--run-seed <n>] [--out <dir>] [--api <url>] [--no-early-stop]`:

1. `checkSeason` fetches `GET /api/seasons`. When the current season's `rulesHash` differs from the package's, it exits 3
   with `npx blob-evolution@<major> ...` naming the matching package, before training anything. The server being
   unreachable exits 4 unless `--offline` (training only; `--upload` is refused with `--offline`).
2. With `--upload`, sign in first when no valid token is stored (device flow), so a failure appears before the hours.
3. Train: the trainer ([evolution-rework.md](evolution-rework.md) Trainer) with `--checkpoint-every 10`. `--run-seed` (default
   random from `crypto.randomInt`, printed) feeds the trainer's `fork(rng, 'train-run')` stream and episode order; the
   same run seed reproduces the archive. The CLI stops after the generation that ends past `--hours`, or when
   `findPlateau` (learning curve) reports a plateau at least 10 generations old.
4. Export the five champions as `train:export` does into `<out>/champions/`, validate each with `validateChampion`.
5. With `--upload`, run `checkSeason` again, then `POST /api/champions` for each file, printing id and status; an upload
   rejected for `rate_limited` stops the loop and keeps the files.

`upload <file...>`, `login`, `logout` and `status` (own uploads) share the same client. The token file is
`$XDG_CONFIG_HOME/blob-evolution/token.json` (`%APPDATA%\blob-evolution\token.json` on Windows), mode 0600; it holds the
API bearer only.

#### Publishing

`.github/workflows/publish.yml` runs on a pushed tag `pkg-v*`: job `build` runs `npm ci`, `scripts/check.sh --ci`,
`npm run package:build` and checks the tag equals `dist-pkg/package.json` `version`; job `publish` (environment
`npm-publish`, which waits for the user's approval) has `permissions: { contents: read, id-token: write }`, and runs
`npm publish dist-pkg --provenance --access public` with `NODE_AUTH_TOKEN` from the environment secret `NPM_TOKEN`.
The package's own dependencies: none. The repo's dev dependencies stay exact pins.

## Free-tier budget

Cloudflare's free plans never bill; past a limit requests fail. Expected volume: 2,000 drawer opens a day, 50 uploads a
day at most, 6 verified a night.

| Service                        | Free limit that matters                                                                    | Expected use                                                                                                                                                                            |
| ------------------------------ | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pages static assets            | Unlimited requests and bandwidth; 20,000 files, 25 MiB per file per deployment             | A few hundred files, the largest under 2 MiB                                                                                                                                            |
| Pages deployments              | Direct-upload deploys; the 500 builds a month limit applies to Cloudflare's own Git builds | Builds run on GitHub; about 10 deploys a day                                                                                                                                            |
| Pages Functions (Workers free) | 100,000 requests a day; 10 ms CPU per request; 3 MiB compressed bundle                     | 2 requests per drawer open, so about 4,000 a day (4 %); `checkUpload` under 2 ms CPU; bundle under 1 MiB (checked)                                                                      |
| R2                             | 10 GB stored; 1 million Class A and 10 million Class B operations a month; no egress fee   | A champion file is about 32 KB (5925 float32 weights as base64, plus the header); 50 a day for a year is about 0.6 GB; one write per upload, one read per download and per verification |
| D1                             | 5 GB stored; 5 million rows read and 100,000 rows written a day                            | A row is about 300 bytes, so 100,000 rows is 30 MB; a list reads at most 51 rows through `champions_browse`; an upload writes at most 6 rows with indexes                               |
| Turnstile, GitHub OAuth        | Free                                                                                       | One verification per browser upload                                                                                                                                                     |
| GitHub Actions                 | Free hosted minutes for a public repository                                                | 276 min a night for verification, 25 min for the existing nightly                                                                                                                       |

## Delivery requirements

| Concern                 | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture            | `js/sim/` and `js/evo/` unchanged except `champion-export.js` if the selection moves, and `scripts/train.mjs` gaining `--run-seed`. New pure `js/library/` (imports `js/sim/`, `js/evo/` only; `shapes.js` imports nothing, and is the only part `js/app/` imports). `functions/` (Pages Functions: thin handlers and `functions/_lib/`) imports `js/library/`, `js/evo/league.js` and `js/sim/config.js`. App: `js/app/ui/gene-library.js`, `gene-upload.js`, `js/app/library-client.js`; worker: the messages `seedChampion`, `exportChampions` in `js/worker/protocol.js`. Shells: `scripts/deploy-plan.mjs`, `library-seed.mjs`, `library-sync-seasons.mjs`, `library-admin.mjs`, `library-verify.mjs`, `library-probe.mjs`, `build-package.mjs`. Package: `cli/`. Workflows: `deploy.yml`, `verify-uploads.yml`, `publish.yml`. Data: `migrations/`, `library/seasons.json`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Unit tests              | `test/deploy-plan.test.js` (main push gives production; same-repo PR gives `pr-<n>`; fork, failed and cancelled checks skip with the reason). `test/pr-comment.test.js` (marker present; update replaces the marked comment). `test/workflows.test.js` (no `pull_request_target`; secrets only in `env` of deploy steps; action versions match `check.yml`). `test/library/query.test.js` (limit clamps to 1..50; unknown sort rejected; cursor round trip; tampered cursor rejected). `test/library/seasons.test.js` (`canSeed` true only on equal `rulesHash`; the newest `library/seasons.json` entry matches `rulesHash(createConfig())`). `test/library/rows.test.js` (no `r2_key`, `attempts` or `uploader_id` in the public shape). `test/library/upload-check.test.js` (one case per row of the check table plus: empty body, array body, wrong-length weights, NaN and Infinity weights, a weight of 101, name with `<`, duplicate keys, a `rulesHash` of an older season, a valid file accepted). `test/library/rate-limit.test.js` (5 per 24 h, 3 pending, boundaries). `test/library/session.test.js` (round trip; expired, tampered, wrong-secret tokens rejected). `test/library/verify-rules.test.js` (each verdict and boundary at `MIN_WIN_RATE`). `test/functions/*.test.js` run each handler against an in-memory D1/R2 fake (list paging, 404 for non-verified, upload accepted and rejected paths, admin endpoints reject a missing or wrong bearer, a blocked account is refused). `test/library-seed.test.js` (`buildSeedRows`, idempotent SQL). `test/library-verify.test.js` (queue to verdicts with a stubbed league and API; a thrown game counts an attempt; the third attempt rejects). `test/app/library-client.test.js`, `test/app/gene-library.test.js` (seed disabled for another season; offline state). `test/worker/protocol.test.js` gains `seedChampion` and `exportChampions`. `test/package.test.js` (the import closure has no bare specifier; the generated `package.json` fields; build fails on a `rulesHash` mismatch). `test/cli/*.test.js` (`checkSeason` exit codes 3 and 4; device flow against a stubbed GitHub; token file mode 0600; `--upload` with `--offline` refused). `test/evo/trainer.test.js` gains `--run-seed`: the default seed gives today's archive, two seeds differ, one seed repeats |
| Headless e2e            | `test/cli/package-smoke.slow.test.js`: `npm pack` of `dist-pkg`, install into a temporary directory, `blob-evolution train --generations 1 --episodes 2 --episode-ticks 500 --out <dir>` twice with `--run-seed 7` writes byte-identical champion files that pass `validateChampion`. `test/functions/e2e.slow.test.js`: upload, verify with a 1-opponent league at 2000 ticks, list shows the verified row. `eval-smoke` is unchanged                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Performance budget      | No `bench.*` or `browser.*` change: nothing under `js/sim/` or the render path is touched (`bench-check` still runs). Pipeline: preview deploy within 4 min of `check` finishing, production within 4 min; `dist/` under 20,000 files. API from the dev machine over `scripts/library-probe.mjs` (200 requests each): list p95 at most 300 ms, file p95 at most 400 ms. `checkUpload` mean at most 2 ms over 1000 valid files in Node. Functions bundle (`wrangler pages functions build`) under 1 MiB                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Evolution metrics       | N/A - no change to the sim, policies or fitness. Verification reports `eval.champion_elo` and `eval.champion_win_rate` from the existing league                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Determinism             | Nothing here draws from the sim's RNG. Verification is deterministic: the same file, opponents, `evals/seeds.json` seeds and code give the same Elo on any runner. Content ids are SHA-256. The CLI's `--run-seed` replays an archive (the default is random and printed). Not replayable: upload times, OAuth state and session nonces (`crypto.randomUUID` in `functions/` only; `js/library/` takes `now` as a parameter)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Config and persistence  | No `createConfig` keys. IndexedDB unchanged: a seeded world is saved by the existing archive save. New formats: `library/seasons.json`, D1 migration `0001_library.sql`, the R2 key layout, the package's `blobEvolution` field. The champion file format is unchanged (`CHAMPION_VERSION` 1); uploads add the limits in the check table. Secrets and `[vars]` named in the setup checklists                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Logging and diagnostics | Functions log one JSON line per event to the Workers log (`wrangler pages deployment tail`): `UploadAccepted` (info: id, season, specialisation, bytes, githubId), `UploadRejected` (warn: code, field, githubId), `AuthSignedIn` (info: githubId), `AuthFailed` (warn: reason), `AdminVerified` (info: id, status, elo), `AdminBlocked`, `AdminRemoved` (info: githubId or id, reason), `ChampionSeedRejected` (worker, error: field, expected, actual). `scripts/library-verify.mjs` writes `.sim/logs/verify-<runId>.jsonl`: `VerifyStarted` (queued, max), `VerifyDecided` (id, status, elo, winRate, games, wallMs), `VerifyFailed` (id, attempt, error, stack), `VerifyFinished` (verified, rejected, failed); the workflow uploads it as an artifact. `deploy.yml` logs `DeploySkipped` (reason) and `DeployDone` (url, wallMs). No log line carries a token, a secret or a file body. A bad verdict reproduces with `npm run league -- .sim/verify/<id>.json --opponents 6`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Browser compatibility   | Drawer and upload form: Chromium and Firefox (the renderer's matrix); features used are `fetch`, `Blob`, anchor `download` and the Turnstile script; no WebGPU dependence. Fallbacks: API unreachable gives "Library offline"; Turnstile blocked gives "Verification could not load" and disables Submit. The CLI runs on Node 24 on Linux, macOS and Windows                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Docs                    | `AGENTS.md`: the hard-rule change above, the Commands rows for `library:seed`, `library:admin`, `package:build`, `league --opponents`, and the Where-things-are rows for `functions/`, `js/library/`, `cli/`. `DEPLOY.md` (rewritten by v6-tidy-up) gains the setup checklists. `README.md` gains a Gene library section and the `npx` command. [sim-notes.md](sim-notes.md): measured deploy times, the verified free-tier limits, the measured league game time. [worker-and-renderer.md](worker-and-renderer.md) and [evolution-rework.md](evolution-rework.md) gain a link here. This doc becomes `Implemented` when Phase 4 lands and describes the deployed system                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Verification            | `scripts/check.sh` green, then the walks in Verification below                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

## Task breakdown

### Phase 1 - build and deploy pipeline

| #   | Task                                                                                                                                                                           | Nature       | Depends on         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ | ------------------ |
| T1  | Add `scripts/lib/deploy-plan.mjs`, `scripts/lib/pr-comment.mjs`, `scripts/deploy-plan.mjs` and their tests                                                                     | [mechanical] | -                  |
| T2  | Set `wrangler.toml` `name` to `blob-evolution`; add `.wrangler/` to `.gitignore`                                                                                               | [mechanical] | -                  |
| T3  | Add `.github/workflows/deploy.yml` and `test/workflows.test.js`                                                                                                                | [judgement]  | T1, T2             |
| T4  | Change `AGENTS.md` (hard rule, Commands row) and write the Phase 1 setup checklist into `DEPLOY.md`                                                                            | [mechanical] | T3                 |
| T5  | With the user: run the Phase 1 checklist, open a no-op PR for a preview, merge it for a production deploy, record both deploy times and the free-tier limits in `sim-notes.md` | [judgement]  | T4                 |
| T6  | Conformance review of Phase 1                                                                                                                                                  | [judgement]  | T1, T2, T3, T4, T5 |

### Phase 2 - read-only gene library

| #   | Task                                                                                                                                                                                                    | Nature       | Depends on                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------ |
| T7  | Widen tsconfig, ESLint, Prettier, coverage, jscpd, dependency-cruiser (layer rules above) and the mirrored-test convention to `js/library/`, `functions/` and `cli/`                                    | [mechanical] | T6                             |
| T8  | Add `js/library/shapes.js`, `seasons.js`, `query.js`, `rows.js`, `library/seasons.json` (empty), the seasons `conventions` test and tests                                                               | [judgement]  | T7                             |
| T9  | Add `migrations/0001_library.sql`, `wrangler.toml` bindings (production and preview), `functions/_lib/db.js` and the four read handlers with fake-D1/R2 tests                                           | [judgement]  | T8                             |
| T10 | Add `scripts/library-seed.mjs`, `scripts/lib/library-seed.mjs`, `scripts/library-sync-seasons.mjs`, the `library:seed` script and tests; the production deploy job applies migrations and syncs seasons | [judgement]  | T9                             |
| T11 | Add the `seedChampion` message and handler to `js/worker/protocol.js` and `js/worker/sim-host.js` with tests                                                                                            | [judgement]  | T8                             |
| T12 | Add `js/app/library-client.js`, `js/app/ui/gene-library.js` and the drawer button with tests                                                                                                            | [judgement]  | T9, T11                        |
| T13 | Add `scripts/library-probe.mjs`; run the Phase 2 setup checklist with the user; seed Season 1 from `public/champions/v1/` and record the latencies in `sim-notes.md`                                    | [judgement]  | T10, T12                       |
| T14 | Conformance review of Phase 2                                                                                                                                                                           | [judgement]  | T7, T8, T9, T10, T11, T12, T13 |

### Phase 3 - uploads and verification

| #   | Task                                                                                                                                                              | Nature       | Depends on                             |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | -------------------------------------- |
| T15 | Add `js/library/upload-check.js`, `rate-limit.js`, `verify-rules.js` with tests (every malformed case in the unit-test row)                                       | [judgement]  | T14                                    |
| T16 | Add `js/library/session.js`, `functions/_lib/auth.js`, the `users` migration `0002_users.sql`, the sign-in, callback, logout, device and `me` handlers with tests | [judgement]  | T14                                    |
| T17 | Add `POST /api/champions`, `GET /api/me/uploads`, Turnstile verification and the `UploadAccepted`/`UploadRejected` events with tests                              | [judgement]  | T15, T16                               |
| T18 | Add the admin endpoints (`queue`, `verify`, `block`, `unblock`, `remove`) and `scripts/library-admin.mjs` with tests                                              | [mechanical] | T16                                    |
| T19 | Add `--opponents` and `--json` to `scripts/league.mjs`, with tests                                                                                                | [mechanical] | T14                                    |
| T20 | Add `scripts/library-verify.mjs`, `.github/workflows/verify-uploads.yml` and tests; measure a real league game and set `--max-uploads` from it                    | [judgement]  | T18, T19                               |
| T21 | Add `exportChampions` (moving `pickChampions` to `js/evo/champion-export.js` if needed), `js/app/ui/gene-upload.js` and tests                                     | [judgement]  | T17                                    |
| T22 | Run the Phase 3 setup checklist with the user; upload one champion and watch the next verification run; record the real runner time in `sim-notes.md`             | [judgement]  | T20, T21                               |
| T23 | Conformance review of Phase 3                                                                                                                                     | [judgement]  | T15, T16, T17, T18, T19, T20, T21, T22 |

### Phase 4 - `npx` contributor trainer

| #   | Task                                                                                                                  | Nature       | Depends on                        |
| --- | --------------------------------------------------------------------------------------------------------------------- | ------------ | --------------------------------- |
| T24 | Add `--run-seed` (and the test-only `--episode-ticks`) to `scripts/train.mjs`, with trainer tests                     | [judgement]  | T23                               |
| T25 | Add `scripts/lib/import-closure.mjs`, `scripts/build-package.mjs`, `npm run package:build` and `test/package.test.js` | [judgement]  | T23                               |
| T26 | Add `cli/auth.mjs`, `cli/api.mjs`, `cli/season-check.mjs`, `cli/constants.mjs` with tests                             | [judgement]  | T23                               |
| T27 | Add `cli/main.mjs` and the `train`, `upload`, `login`, `status` commands with tests                                   | [judgement]  | T24, T25, T26                     |
| T28 | Add `test/cli/package-smoke.slow.test.js`                                                                             | [mechanical] | T27                               |
| T29 | Add `.github/workflows/publish.yml`; run the Phase 4 setup checklist with the user and publish `1.0.0`                | [judgement]  | T25, T28                          |
| T30 | Update `AGENTS.md` (publish exception, rows), `README.md`, `DEPLOY.md`; mark the doc `Implemented`                    | [mechanical] | T29                               |
| T31 | Conformance review of Phase 4                                                                                         | [judgement]  | T24, T25, T26, T27, T28, T29, T30 |

## Verification

1. `scripts/check.sh` is green on each phase's branch.
2. Phase 1: open a PR from a branch of this repo. After `check` passes, `deploy` posts one comment with a
   `pr-<n>.<project>.pages.dev` URL; the app loads there. Push another commit: the same comment updates. Open a PR from
   a fork: no deploy runs. Merge: `deploy` publishes production and the production URL serves the new build.
3. Phase 2: open the Gene library drawer on the production site. The Season 1 champions are listed; Download saves a
   file that `validateChampion` accepts; Seed world starts a new world that behaves like the champion's specialisation
   in the first minutes. A fake older-season row (inserted on the preview database) shows "Season N rules" and cannot
   be seeded. `node scripts/library-probe.mjs` meets the latency budget.
4. Phase 3: sign in with GitHub in the drawer, export a champion from a short local world and upload it with Turnstile:
   "My uploads" shows `pending`. Upload the same file again: 409 `duplicate`. Upload a file with one weight changed to
   `1e9`: rejected `bad_field` `weights`. Send a 70 KB body: `too_large`. Run `npm run library:admin -- queue`: the row is
   listed. Next morning, the `verify-uploads` run is green, its log has `VerifyDecided`, and the row is `verified` with
   an Elo and a win rate in the list. `library:admin -- block <id>` makes the next upload answer `blocked`; `remove`
   takes a verified row out of the list.
5. Phase 4, on a machine with only Node 24: `npx blob-evolution@latest train --hours 0.1 --upload` signs in through the
   device flow, trains, prints five uploaded ids; `npx blob-evolution status` lists them `pending`. Against a server
   running another season, the same command exits 3 before training and names the matching package. `npm view
blob-evolution dist.attestations` shows the provenance, and the package page links the publishing workflow run.
6. Repeat step 3 in Firefox.
