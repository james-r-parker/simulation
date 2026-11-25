### 2026-11-08 - Release Please manifest mode defaults include-component-in-tag to true

`googleapis/release-please-action` v5 passes `include-component-in-tag: false` as its default action input, but when
`config-file` (`release-please-config.json`) is given, Release Please runs in manifest mode and reads the setting from
the config file instead, where `include-component-in-tag` defaults to `true`. For a `node` package without
`"include-component-in-tag": false` in `release-please-config.json`, Release Please prefixes the tag with the
`package.json` `name` (`blob-evolution-simulation-v6.0.0`), which `deploy.yml` rejects because it requires `v<version>`.
`release-please-config.json` sets `"include-component-in-tag": false` on `packages["."]`, and removes `"release-as": "6.0.0"`
once `6.0.0` is released so later releases bump from the manifest version. `actions/create-github-app-token` v3 also
deprecates its `app-id` input in favour of `client-id` (`RELEASE_CLIENT_ID`).
