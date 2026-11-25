### 2026-10-17 - The skill ladder at the defaults (world-balance T12)

`npm run ladder` at the defaults (`minAgents` 0, 10000 ticks, seeds 1-3, commit 88f3940). Final population per seed,
then the rung means:

| Ladder | Rung                       | Final population | `food_energy_per_1k` | `births_per_1k` | `deliberate_food_share` | `pursuit_bite_share` | `undefended_bite_share` |
| ------ | -------------------------- | ---------------- | -------------------- | --------------- | ----------------------- | -------------------- | ----------------------- |
| Forage | `random`                   | 13 / 5 / 34      | 104                  | 0.065           | 0.23                    | 0                    | 0.67                    |
| Forage | `wanderer`                 | 0 / 0 / 0        | 215                  | 0.004           | 0.05                    | -                    | -                       |
| Forage | `sloppyForager`            | 0 / 0 / 0        | 633                  | 0.226           | 0.46                    | -                    | -                       |
| Forage | `foodSeeker`               | 322 / 316 / 334  | 700                  | 0.448           | 0.86                    | -                    | -                       |
| Forage | `fleer`                    | 288 / 283 / 284  | 777                  | 0.521           | 0.82                    | -                    | -                       |
| Combat | `jawSitter` v `foodSeeker` | 320 / 304 / 331  | 672                  | 0.434           | 0.85                    | 0                    | 1.00                    |
| Combat | `hunter` v `foodSeeker`    | 253 / 215 / 216  | 818                  | 0.649           | 0.80                    | 0.84                 | 0.97                    |
| Combat | `hunter` v `fleer`         | 2 / 0 / 0        | 720                  | 0.536           | 0.53                    | 0.83                 | 0.17                    |

- No rung saturates (0.9 x `maxAgents` is 450), but the forage ladder is not a ladder: `random` keeps 5-34 agents
  while `wanderer` and `sloppyForager` die out, and `sloppyForager` eats nine tenths of the `foodSeeker`'s food per
  1000 agent-ticks yet dies. Half-time seeking is not enough to cover the cost of living at these defaults; B2 is
  now a cliff between `sloppyForager` and `foodSeeker`, not a flat top.
- `deliberate_food_share` rises with skill up to `foodSeeker` (0.05, 0.23, 0.46, 0.86; `fleer` 0.82), so D1 separates the
  rungs even where the population does not.
- `hunter` against `fleer` prey nearly empties the world (2, 0, 0), while `hunter` against `foodSeeker` prey keeps
  215-253. The `fleer` spends its ticks fleeing and its `deliberate_food_share` falls to 0.53; that cost, not the
  catch, is the likely cause, since `undefended_bite_share` falls from 0.97 to 0.17. The Phase 4 night should check
  that fleeing is not a dominated strategy before it tunes predation.
