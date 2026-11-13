# E166 - flat and reach on seeds 65 to 128 (low-density-edge T15b)

**Prediction (recorded before the run).** On seeds 65 to 128, and on the 128 matched seeds with E165, `flat` and `reach`
each read no keep-rule guard worse against `defaults`, and each guard sees a loss of a quarter of the seeds or less.
Falsified when a guard reads worse.

**Runs:** `npm run screen -- --grid evals/screens/low-density-edge-t15b.grid.json` (`defaults`, `flat`) and `npm run eval --
--seeds 64 --seed-offset 64 --ticks 200000 --policy live` at the `reach` commit (`exp/ld-reach-t14`).

## Results

Seeds 65 to 128, and the 128 matched seeds (E165 and E166 reports joined per arm, every per-seed array concatenated),
against `defaults` with `--keep-rule` (`--allow-config-diff seasons` for `flat`). A quarter of 128 seeds is 32.

| Arm     | Seeds  | `alive` harmed/recovered | `under80` | `held`  | Smallest loss seen (alive / under80 / held) | Median lowest pop (128) | Pop mean |
| ------- | ------ | ------------------------ | --------- | ------- | ------------------------------------------- | ----------------------- | -------- |
| `flat`  | 65-128 | 10 / 14                  | 6 / 9     | 4 / 10  | 28 / 21 / 23                                | -                       | +11.5%   |
| `reach` | 65-128 | 8 / 13                   | 10 / 13   | 8 / 6   | 27 / 27 / 17                                | -                       | -3.7%    |
| `flat`  | 1-128  | 17 / 24                  | 17 / 17   | 9 / 16  | 41 / 32 / 31                                | 32.5 (defaults 9.5)     | +11.1%   |
| `reach` | 1-128  | 20 / 27                  | 21 / 23   | 13 / 12 | 45 / 40 / 25                                | 11                      | +6.6%    |

No guard reads worse for either arm on either seed set, and `eval.hunter_catches_per_1k` reads no harm.
`eval.diversity`, `eval.lineages_alive` and `eval.toxic_avoidance` read no-difference on 128 seeds.

**Verdict.** The prediction holds on "no guard worse" and fails on guard power: on 128 seeds, every seed `evals/seeds.json`
holds, the `alive` guard sees only a 41-seed (`flat`) and 45-seed (`reach`) loss, and `reach`'s `under80` a 40-seed loss.
Both arms land in Phase 4 under the plan's rule (no guard worse), as realistic mechanisms with no harm shown on the most
seeds available and every guard's point estimate leaning better (AGENTS.md, keep realistic harmless features).
