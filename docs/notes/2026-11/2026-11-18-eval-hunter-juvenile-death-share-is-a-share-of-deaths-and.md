### 2026-11-18 - `eval.hunter_juvenile_death_share` is a share of deaths, and `HunterLedger` bite cost is three costs

The metric (`js/evo/scene-hunter-age.js`) is the share of hunter deaths with age under `juvenileTicks` (3000), over the whole run
with no burn-in cut. It is a lifespan statistic: 0.86 means a hunter that dies is under 3000 ticks old 86% of the time, not
that 86% of newborns die before `maturityTicks` (600). `biteCostEnergy` on a `HunterLedger` record adds the landed-bite kick, the
`recoilEnergy` charged at kin or a too-large target and `strikeMissCost` on every tick `BITE` is held with no body in the jaws,
so it is 98% of a juvenile hunter's logged spend (the ledger leaves out passive loss) and the log alone cannot split it; the
`HunterRecoilLife` record gives the recoil part. Hunters hold `BITE` on 60% to 70% of their ticks, adults too. A hunter is born
with about 900 energy, not the 270 the Phase 6 text assumed. `node scripts/juvenile-deaths.mjs <log>...` prints the split (E190).
