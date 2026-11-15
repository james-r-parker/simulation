# E181 - scout as long-range sentinel (prey-guilds Phase 3, T9 to T11)

**Prediction (recorded before the run).** Giving `scout` (spec 3) a longer alarm call radius
(`scoutCallRadiusMultiplier` `1.25` to `1.75`), cheaper alarm calls (`scoutAlarmCostMultiplier` `0.5`), and a
moderate sprint boost (`sprintBoost` `1.2` to `1.35`) makes scouts effective early-warning sentinels without
turning them into forager-killers. On the 16-seed screen (`evals/screens/prey-guilds-scout.grid.json`, seeds 1 to
16, 400000 ticks, floor on, policy live), the finalist (`scout-med`, `scout-lo`, or `scout-hi`) raises
`eval.scout_alarm_lead_ticks` and `eval.alarm_to_flee_rate`, and on 64 matched seeds `keepRule` reads no guard
`WORSE`. Falsified when every arm reads `eval.spec_effective` or `held` `WORSE` or `eval.scout_alarm_lead_ticks`
shows no gain.

**Arms.** `control` is `scoutCallRadiusMultiplier: 1`, `scoutAlarmCostMultiplier: 1`, `scout.sprintBoost: 1`.
`scout-lo` is `1.25` / `0.5` / `1.2`. `scout-med` is `1.5` / `0.5` / `1.25`. `scout-hi` is `1.75` / `0.5` / `1.35`.

**Run:** `npm run screen -- --grid evals/screens/prey-guilds-scout.grid.json` on branch
`feat/prey-guilds-t9-scout-calls` (T10), then the finalist and control on seeds 1 to 64 with `--keep-rule` (T11).
