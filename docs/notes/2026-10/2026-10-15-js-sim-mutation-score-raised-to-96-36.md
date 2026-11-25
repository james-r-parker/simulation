### 2026-10-15 - js/sim mutation score raised to 96.36%

Measured under Vitest 4.1.5 (the gate skips under Vitest 5): new boundary and exact-value tests took `js/sim` from
87.15% to 96.36% (2935 killed, 87 timeout, 114 survived, 0 no coverage). The survivors left are judged equivalent:
most are `i <= length` loop bounds where the extra read is `undefined` and rejected; others are comparisons whose
equality case cannot occur (a float32 angle sum equal to the double PI, a speed exactly at the cap scaling by 1) or
writes a later pass overwrites (the spatial hash count pass, DDA setup with an infinite `tMax`). Redundant but
harmless code they exposed: the `entries < maxAgents` guards in `resolveCell` (physics.js), the same-kind index
tie-break in `consider` (ray-march.js, unreachable because circles are tested in ascending index), and
`Math.max(minSize, ...)` in `spawnAgent` (validation already requires `minSize <= baseSize`). `toThrow('message')`
also passes when `undefined` is thrown, so error tests pair it with `toThrow(Error)`.
