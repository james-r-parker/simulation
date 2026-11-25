### 2026-10-28 - merit arrays hashed (fitness-and-selection T22b)

- **Hashes, old to new** (`test/sim/golden.json`): `cases` default `7a7accb9ab2944be` to `1969d11fcd461153`; `cases` busy `3cc3b8cda813eeca` to `a657b81b9af3c39e`; `shortCases` default `897120be022ee74d` to `d328ec7cf550c9cd`; `shortCases` busy `f65f58c06b08c4e0` to `7642f4a7b7400ff0`. `BUSY_EFFECT_HASH` is unchanged (`dd77d19ae7805ad7`): it covers effect records, not world arrays.
- **Why `shortCases` moves too.** The 300-tick cases were expected to keep their hash, since the merit state is still zero at that length. They do not: `hashWorld` reads every merit array at every checkpoint, and the `parentSlotA` and `parentSlotB` arrays are set at birth even with merit off, so the 300-tick worlds carry nonzero merit state into their hash.
- **What is hashed.** The arrays are taken from `meritSpecs()` in its order, so the list cannot drift from the allocation. `capSlots`, `capKeys` and `meritTally` are scratch and counters and are not hashed; a test pins that.
- **Browser check.** `npm run browser:hash` matches both `cases` in Chromium 156.
