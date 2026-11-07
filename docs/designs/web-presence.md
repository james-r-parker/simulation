# Web presence

**Status:** Proposed - Phase 1: a designed icon in every size, Open Graph and Twitter cards, a full `<head>`, an
installable web app manifest with a splash, `robots.txt` and `sitemap.xml`.
**Validated:** e5ffd3dc (2026-11-07)
**Priority:** 27 - static files and the page head only; no sim, worker or renderer change, so it builds beside any other work

How Blob Evolution looks outside its own canvas: the browser tab, a shared link, a search result and an installed
app. Everything here is a static file under `public/` or a tag in the `<head>` of `index.html`.

## Icon

The mark is a single bioluminescent blob on a near-black tile, looking right.

| Part  | Shape                                                         | Colour                                                           |
| ----- | ------------------------------------------------------------- | ---------------------------------------------------------------- |
| Tile  | Rounded square, corner radius 22 % of the side                | `#05080d` to `#0b1626`, a soft radial glow behind the blob       |
| Body  | An organic blob, wider at the front, filling 62 % of the tile | `PALETTE.food` mint (`#5ee6a8`) to teal (`#1f9e8f`), a mint halo |
| Eye   | One round eye at the front, the pupil looking forward         | `PALETTE.eye` cool white (`#e8f4ff`), pupil `#05080d`            |
| Spark | A small dot ahead of the eye: the food the blob is after      | `PALETTE.huntScent` amber (`#ffbe3c`)                            |

- `public/icons/icon.svg` is the source of truth. Every other icon file is generated
  from it by `scripts/build-icons.mjs`.
- The root `<svg>` takes a `data-variant` attribute that its own `<style>` reads:

| `data-variant` | Draws                                                                                                          |
| -------------- | -------------------------------------------------------------------------------------------------------------- |
| (none)         | Tile, body, eye and spark                                                                                      |
| `maskable`     | A full-bleed square tile; body, eye and spark scaled to sit inside the central 80 % safe circle                |
| `favicon`      | No tile; body and eye only, with a dark rim on a light tab and the halo on a dark tab (`prefers-color-scheme`) |

## Assets

| File                                | Size          | Variant    | Used by                                                          |
| ----------------------------------- | ------------- | ---------- | ---------------------------------------------------------------- |
| `public/icons/icon.svg`             | vector        | (none)     | Source; the manifest's `any` vector icon                         |
| `public/favicon.svg`                | vector        | `favicon`  | `<link rel="icon" type="image/svg+xml">`                         |
| `public/favicon.ico`                | 16, 32, 48 px | `favicon`  | `<link rel="icon" sizes="48x48">`, and `/favicon.ico` by default |
| `public/favicon.png`                | 192 x 192     | (none)     | The `about/` and `blog/` pages' `<link rel="icon">`              |
| `public/icons/apple-touch-icon.png` | 180 x 180     | `maskable` | `<link rel="apple-touch-icon">` (iOS rounds the corners itself)  |
| `public/icons/icon-192.png`         | 192 x 192     | (none)     | Manifest, `purpose: any`                                         |
| `public/icons/icon-512.png`         | 512 x 512     | (none)     | Manifest, `purpose: any`; the splash on Android                  |
| `public/icons/maskable-192.png`     | 192 x 192     | `maskable` | Manifest, `purpose: maskable`                                    |
| `public/icons/maskable-512.png`     | 512 x 512     | `maskable` | Manifest, `purpose: maskable`                                    |
| `public/og/og-image.png`            | 1200 x 630    | card       | `og:image`, `twitter:image`                                      |

- The ICO holds three PNG-compressed images (16, 32 and 48 px), written by `encodeIco` in
  `scripts/lib/icon-files.mjs`.
- `pngSize` in the same module reads a PNG's width and height from its `IHDR` chunk.
- `ICON_OUTPUTS` there lists every generated file with its size and variant; the build script and the test both
  read it.

## Share card

`public/og/og-image.png` is a designed 1200 x 630 card, rendered by `scripts/build-icons.mjs` from an inline page:

- the near-black background with a field of mint, amber and blue motes placed by a fixed-seed generator;
- the mark at 300 px on the left;
- the name "Blob Evolution" and the tagline "Artificial life that evolves while you watch" on the right, in Lato
  falling back to DejaVu Sans.

## Head

| Tag                                                                                          | Value                                                                                                     |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `<title>`                                                                                    | `Blob Evolution - artificial life that evolves while you watch`                                           |
| `meta name="description"`                                                                    | The existing one-sentence description                                                                     |
| `link rel="canonical"`                                                                       | `https://matrix.dotnethelp.co.uk/`                                                                        |
| `meta name="robots"`                                                                         | `index, follow`                                                                                           |
| `meta name="color-scheme"`                                                                   | `dark` - the app draws on black only                                                                      |
| `meta name="theme-color"`                                                                    | `#05080d`, twice: `media="(prefers-color-scheme: light)"` and `dark`                                      |
| `meta name="viewport"`                                                                       | Unchanged - [mobile-view.md](mobile-view.md) owns it                                                      |
| `link rel="icon"`                                                                            | `favicon.ico` (`sizes="48x48"`) and `favicon.svg` (`type="image/svg+xml"`)                                |
| `link rel="apple-touch-icon"`                                                                | `icons/apple-touch-icon.png`                                                                              |
| `link rel="manifest"`                                                                        | `manifest.webmanifest`                                                                                    |
| `meta name="apple-mobile-web-app-capable"`, `mobile-web-app-capable`                         | `yes`                                                                                                     |
| `meta name="apple-mobile-web-app-title"`                                                     | `Blob Evolution`                                                                                          |
| `meta name="apple-mobile-web-app-status-bar-style"`                                          | `black-translucent`                                                                                       |
| `og:type`, `og:site_name`, `og:title`, `og:description`, `og:url`                            | `website`, `Blob Evolution`, the title, the description, the canonical URL                                |
| `og:image` with `:width`, `:height`, `:alt`, `:type`                                         | `https://matrix.dotnethelp.co.uk/og/og-image.png`, 1200, 630, a one-line alt                              |
| `twitter:card`, `twitter:title`, `twitter:description`, `twitter:image`, `twitter:image:alt` | `summary_large_image` and the same values                                                                 |
| `<noscript>`                                                                                 | A `<style>` that writes "Blob Evolution needs JavaScript and WebGL2" over the page through `body::before` |

- Icon and manifest links are root-absolute (`/favicon.svg`). Vite rewrites them to the build's `--base`, so a
  `/v/<version>/` build links its own files.
- `og:url`, `og:image` and the canonical link are absolute production URLs in every build: a versioned build is a
  copy of the site, not a page of its own.

## Manifest

`public/manifest.webmanifest` replaces the root `manifest.json`, which the build never copied.

| Field              | Value                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------- |
| `id`               | `./`                                                                                                          |
| `name`             | `Blob Evolution`                                                                                              |
| `short_name`       | `Blobs`                                                                                                       |
| `description`      | The page description                                                                                          |
| `start_url`        | `./`                                                                                                          |
| `scope`            | `./`                                                                                                          |
| `display`          | `standalone`                                                                                                  |
| `orientation`      | `any`                                                                                                         |
| `background_color` | `#05080d`                                                                                                     |
| `theme_color`      | `#05080d`                                                                                                     |
| `categories`       | `education`, `games`, `entertainment`                                                                         |
| `icons`            | `icon-192`, `icon-512` (`any`), `maskable-192`, `maskable-512` (`maskable`), `icon.svg` (`any`, `sizes: any`) |

- Every path is relative, so it resolves against the manifest's own URL: `/manifest.webmanifest` and
  `/v/<version>/manifest.webmanifest` each describe their own copy of the app.
- `screenshots` is absent: the app's frame needs WebGL2, and a headless capture is not reproducible.

## Install and splash

- Chromium (desktop and Android) offers the install from the manifest alone: HTTPS, `name`, `start_url`,
  `display: standalone` and a 192 px and a 512 px icon.
- Android draws the splash itself from `name`, `background_color` and the 512 px icon (the maskable one when
  present), so the splash is the near-black field with the mark and the name.
- iOS has no manifest splash. The app ships no `apple-touch-startup-image`: iOS matches it only by exact device size
  and orientation (about 30 images), and the page's own black background shows for the moment before the first frame.
- The app registers no service worker. Current Chromium installs a web app without a fetch-handler service worker, and a
  caching worker would serve an old build's code after a deploy and across `/v/<version>/` copies
  ([deployment-and-community.md](deployment-and-community.md)).

## Crawlers

- `public/robots.txt` allows every path and names `https://matrix.dotnethelp.co.uk/sitemap.xml`.
- `public/sitemap.xml` lists `/`, `/about/` and `/blog/`.

## Phases

### Phase 1 - Icon, cards, head and manifest

**Targets:** none - static files and head tags; no sim step or frame changes

- The icon source, the generated icon set and the share card.
- The `<head>`, the manifest, `robots.txt` and `sitemap.xml`.
- `test/icon-files.test.js` and `test/web-presence.test.js`.

## Decisions

| Decision                                                                                       | Reason                                                                                  | Who               |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------- |
| Metadata, a designed favicon in every size, Open Graph tags, an install splash, best practices | The user's brief                                                                        | User (2026-11-07) |
| A blob with one eye and a food spark, on a near-black tile                                     | It is the thing on screen; mint and amber are the sim's own food and hunt colours       | Delegated         |
| No service worker                                                                              | Install does not need one, and a cache fights the versioned deploys                     | Delegated         |
| No iOS startup images                                                                          | Thirty exact-size files for a moment of black the page already shows                    | Delegated         |
| No manifest screenshots                                                                        | A WebGL2 frame in headless Chromium is not reproducible                                 | Delegated         |
| No monochrome icon                                                                             | No target browser draws `purpose: monochrome` for a web app icon                        | Delegated         |
| A designed share card instead of a sim still                                                   | A card renders the same on every run; a still depends on the GPU and the world's moment | Delegated         |

## Delivery requirements

| Concern                 | Delivered                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Architecture            | Static files in `public/` (`favicon.*`, `icons/`, `og/`, `manifest.webmanifest`, `robots.txt`, `sitemap.xml`) and the `<head>` of `index.html`. Pure `scripts/lib/icon-files.mjs` (`ICON_OUTPUTS`, `encodeIco`, `pngSize`); the shell `scripts/build-icons.mjs` drives Playwright Chromium. No change to `js/`                                                                                                                                                                                                                                               |
| Unit tests              | `test/icon-files.test.js`: `encodeIco` writes the header and a directory entry per image with the right offsets and sizes, 256 px writes 0, a non-PNG is refused; `pngSize` reads `IHDR`, refuses a short or non-PNG buffer. `test/web-presence.test.js`: every icon and manifest path in `index.html` and the manifest exists with its declared pixel size; the manifest parses with every required field and relative paths; `og:image` is 1200 x 630; the head has exactly one of each key tag and two `theme-color` tags; the ICO holds 16, 32 and 48 px |
| Headless e2e            | N/A - no sim change; the golden hashes in `test/sim/golden.json` pass unchanged                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Performance budget      | N/A - no `bench.*` or `browser.*` change: the icons load after the app's own files and the head adds no script                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Evolution metrics       | N/A - the world does not change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Determinism             | The share card's motes come from a fixed-seed generator in `scripts/build-icons.mjs`; the rendered pixels depend on the local Chromium and fonts                                                                                                                                                                                                                                                                                                                                                                                                             |
| Config and persistence  | No config keys and no saved formats; the root `manifest.json` is deleted                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Logging and diagnostics | N/A - no runtime code; `scripts/build-icons.mjs` prints each file it writes and exits 1 when Chromium fails to launch                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Browser compatibility   | SVG favicon (Chrome, Firefox, Safari 17+) with the ICO for the rest; maskable icons on Android; `apple-touch-icon` on iOS. Checked in Playwright Chromium                                                                                                                                                                                                                                                                                                                                                                                                    |
| Docs                    | This doc, `Implemented` once Phase 1 is built; `AGENTS.md` gains the `build-icons` Commands row                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Verification            | `scripts/check.sh` green; the browser smoke passes; the manual check below                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

## Task breakdown

### Phase 1 - Icon, cards, head and manifest

| #   | Task                                                                                          | Nature       | Depends on                 |
| --- | --------------------------------------------------------------------------------------------- | ------------ | -------------------------- |
| T1  | Draw `public/icons/icon.svg` with its three variants                                          | [judgement]  | -                          |
| T2  | `scripts/lib/icon-files.mjs` (`ICON_OUTPUTS`, `encodeIco`, `pngSize`) and its tests           | [mechanical] | -                          |
| T3  | `scripts/build-icons.mjs`: render the icon set and the share card; commit the generated files | [judgement]  | T1, T2                     |
| T4  | `public/manifest.webmanifest`, `robots.txt`, `sitemap.xml`; delete the root `manifest.json`   | [mechanical] | T3                         |
| T5  | The `<head>` of `index.html`                                                                  | [mechanical] | T3, T4                     |
| T6  | `test/web-presence.test.js`                                                                   | [mechanical] | T5                         |
| T7  | `AGENTS.md` Commands row and this doc to `Implemented`                                        | [mechanical] | T6                         |
| T8  | Conformance review of Phase 1 against this doc, in parallel with `scripts/check.sh`           | [judgement]  | T1, T2, T3, T4, T5, T6, T7 |

## Verification

1. `scripts/check.sh` is green, and `SMOKE_LOCAL=1 scripts/check.sh --only=browser-smoke` passes.
2. `node scripts/build-icons.mjs` regenerates every file in `ICON_OUTPUTS` and the share card; `git status` shows no
   change on a machine with the same Chromium.
3. `npm run build`, then `dist/` holds `favicon.svg`, `favicon.ico`, `icons/`, `og/`, `manifest.webmanifest`,
   `robots.txt` and `sitemap.xml`.
4. `npm run dev` in Chrome:
    - The tab shows the blob on a light and on a dark browser theme.
    - DevTools > Application > Manifest lists no errors and shows the maskable icon inside its safe circle.
    - The install button appears in the address bar; the installed window opens on the near-black splash.
5. The share card at 1200 x 630 reads at a phone's link-preview width (about 400 px).
