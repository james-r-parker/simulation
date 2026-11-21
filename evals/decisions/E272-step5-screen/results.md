# E272 - step 5 screen: the defaults against step5-b and step5-d

Lane B step 5's 16-seed screen on the live policy (body-genes.md T14, status-effects.md T16): `npm run eval -- --seeds 16
--ticks 200000 --policy live --workers 8`, one arm on the defaults and one each with `--config
evals/role-budget/step5-b.json` and `evals/role-budget/step5-d.json`, on the batch at afc06532 (before status-effects T30).
Each arm is read against the defaults with `eval:compare --keep-rule --allow-config-diff <the arm's keys>`.

| Reading                                   | defaults | step5-b               | step5-d               |
| ----------------------------------------- | -------- | --------------------- | --------------------- |
| keep rule (alive, under80, held)          | -        | no harm               | no harm               |
| `eval.hunter_catches_per_1k_settled`      | 1.44     | 1.25                  | 1.32                  |
| `eval.pursuit_kill_share`                 | 0.673    | 0.653                 | 0.625                 |
| `eval.chase_catch_share`                  | 0.245    | 0.253                 | 0.242                 |
| `eval.pack_kills_per_eaten_death`         | 0.100    | 0.103 (no difference) | 0.114 (no difference) |
| `eval.predator_births` (unverified)       | 651      | 975                   | 825                   |
| `eval.effect_share.chilled`               | 0.199    | 0.241                 | 0.101                 |
| `eval.effect_share.rallied`, `.staggered` | 0        | 0                     | 0                     |
| `eval.coverage`                           | 0.144    | 0.171 better          | 0.169 better          |
| verdicts better / worse                   | -        | 2 / 6                 | 1 / 3                 |

Worse on step5-b: `food_energy_per_1k@20k` (376 to 310), `chase_turn_jitter`, and the defender's and reproducer's mean
and p90 fitness. Worse on step5-d: `body_plan_coverage` (0.18 to 0.055) and the defender's mean and p90 fitness.

Reading:

- Neither arm harms the keep rule's seed guards at 16 seeds; the hunter-catch guard needs the 64-seed pair (T15 / E-BG-3).
- step5-d is the finalist: fewer worse verdicts, the cold stack on a tenth of agent-ticks rather than a fifth, no food
  loss.
- `body_plan_coverage` falling to a third on step5-d is the narrowed trait spans of T17 (E271): fewer body plans are
  reachable. Read it again on the 64-seed pair before adoption; it may argue for widening the spans that no row needs
  narrowed.
- `rallied` reads 0 on step5-d although `rallyThrust` is 0.1: no rally was raised in 16 seeds, so the hunt call is
  rarer than the pack row assumes, or never answered. That is the first question for status-effects T16.
- The defender's fitness falls on both arms; the defender row is still red in the calculator (role-budget.md, the
  escort-distance Decision), so this is not yet a defender that can do its job.
