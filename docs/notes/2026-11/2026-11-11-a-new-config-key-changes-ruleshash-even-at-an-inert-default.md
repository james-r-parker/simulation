### 2026-11-11 - A new config key changes `rulesHash`, even at an inert default

- `rulesHash` in `js/sim/config.js` hashes the canonical JSON of the whole config minus `RULES_HASH_EXCLUDED`, so adding
  a key changes it although the key's default leaves every `worldHash` and golden unchanged (low-density-edge T11:
  `temperatureCoolingExcess` and `temperatureMatingMax`). `test/release-check.slow.test.js` then fails with
  `rules-change-not-breaking`.
- A PR that adds a config key is therefore a rules change: it targets `season/next` with a breaking commit
  (deployment-and-community.md, "Rules changes"), or the key stays on an unmerged screen branch until the switch that
  does. A screen of a new key runs from that branch; nothing needs to be on `main` to run `npm run screen`.
