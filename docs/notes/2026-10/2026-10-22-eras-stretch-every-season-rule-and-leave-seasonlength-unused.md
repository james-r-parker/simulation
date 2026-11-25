### 2026-10-22 - Eras stretch every season rule, and leave `seasonLength` unused

`seasonAt` takes the year from `yearTicks(config)`, which is `4 x eraSeasonTicks` with `erasEnabled` and `seasonLength`
otherwise. The whole season table moves with it: `foodScarcity`, `energyDrain`, `reproductionBonus` and
`temperatureModifier` each hold for 36000 ticks, and the body inputs for the season's sine and cosine turn 10 times
slower. A winter is `energyDrain` 1.8 and `foodScarcity` 0.4 for ten minutes at x1, not only a slower patch regrowth, so
tuning that assumed the 3600-tick season (`seasonLength`) does not carry over. The UI calendar reads
`worldInfo.seasonLength`, which already holds `eraSeasonTicks` when eras are on.
