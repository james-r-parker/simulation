# Simulation notes

**Status:** Reference - verified platform and library facts, and learnings from each phase.

Facts here are verified against the running code or the library source, not recalled. Design docs link here rather
than repeating them.

## Platform

| Fact                                                                                                       | Where it matters           |
| ---------------------------------------------------------------------------------------------------------- | -------------------------- |
| Node 24 runs the headless sim, the eval runner, the trainer and every test                                 | `package.json` `engines`   |
| npm 11 does not run dependency install scripts unless approved; Vite, Vitest and esbuild work without them | `npm ci` in CI and locally |
| Vite serves `public/` at the site root; `public/database-worker.js` is loaded as `/database-worker.js`     | Workers                    |
| The production site is Cloudflare Pages (`wrangler.toml`, `npm run deploy`)                                | Deployment                 |

## Learned while building

Entries are `### YYYY-MM-DD - <topic>`, newest last, one finding each.
