# E178 - a call changes the bite (honest-budgets Phase 5, T28 to T30)

**Prediction (recorded before the run).** `world.alarmSeen` is set when a threat is on the caller's rays at call time,
and a bite on a seen caller moves `alarmBiteShare` of the energy (an unseen caller or a silent prey takes the full
bite). A call that saves energy only when a hunter is in view pays for itself, so selection can keep it: on the
16-seed screen (`evals/screens/honest-alarm.grid.json`, seeds 1 to 16, 400000 ticks, floor on, policy live), the
finalist (`a75` or `a50`) reads `eval.alarm_rate` above 0 on most seeds with `eval.alarm_calls_with_threat_per_1k`
rising with it, and on 64 matched seeds `keepRule` reads no guard `WORSE`. Falsified (the branch is parked) when
calls with no threat rise faster than calls with one (`eval.alarm_calls_with_threat_per_1k` falls as `eval.alarm_rate`
rises, the liar check of T30).

**Arms.** `control` is `alarmBiteShare` 1 (the full bite, today's rules; its worlds are the season's exactly).
`a75` is 0.75. `a50` is 0.5.

**Run:** `npm run screen -- --grid evals/screens/honest-alarm.grid.json` on branch `season/next` (T29), then the
finalist and the control on seeds 1 to 64 with `--keep-rule` and the liar check on calls without a threat (T30).
