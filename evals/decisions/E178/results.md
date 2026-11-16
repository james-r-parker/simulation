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

## Screen result (T29, 16 seeds, 400000 ticks, on main 0819058e)

The screen and the arms ran on `main` at 0819058e (season 10, before the hunter-vision switch); `a75` and `a50` are
paired with `control` on the same code, so the comparison holds. `table.md` is `screen-table.md` and the verdicts are
`screen-verdicts.json`; the reports stay in `evals/screens/results/honest-alarm/`.

**Verdict: no finalist; the branch is parked.** The Done-when row needs `eval.alarm_rate` above 0 on most seeds. It is
above 0 on 4 of 16 seeds (mean 0.00004 calls per agent-tick), `eval.alarm_calls_with_threat_per_1k` is above 0 on 3 of 16
(mean 0.0000035) and `eval.alarm_lift` is defined on 3. Every metric on `a75` and `a50` is bit-identical to `control`
(same means, same per-seed values, `+0.00 vs ref` on every criterion): a seen caller is so rare that no bite in 400000
ticks lands on one while its timer runs, so the bite share never acts and the arms replay the control's world.

| Metric                                    | `control` | `a75`   | `a50`   |
| ----------------------------------------- | --------- | ------- | ------- |
| `eval.alarm_rate` seeds above 0 (of 16)   | 4         | 4       | 4       |
| `eval.alarm_calls_with_threat_per_1k`     | 0.0000035 | same    | same    |
| `eval.alarm_lift` seeds defined (of 16)   | 3         | 3       | 3       |
| every guard and verdict against `control` | =         | no harm | no harm |

- Liar clause: not triggered. Calls with a threat appear on 3 of the 4 seeds that call at all, and
  `eval.alarm_calls_with_threat_per_1k` rises where `eval.alarm_rate` does, so calls without a threat do not rise
  faster. The branch is parked for a different reason: the effect has no reach.
- T30 (64-seed keep rule) is not run: with arms bit-identical to the control on 16 seeds a 64-seed comparison would
  read `=` on every guard and cannot show a call changing the bite. T31 is parked: `alarmBiteShare` stays 1 (off), the
  code and its tests stay (a different alarm cost or a brain that calls on sight could use them).
- Open, for a later pass: the alarm output is almost never above `alarmThreshold` 0.65 on a seen threat, so before
  any bite rule can matter, selection has to produce calls (a drill or a training stage that rewards a call on sight).
