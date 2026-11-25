### 2026-11-11 - The low-density edge read (low-density-edge T10, E155)

Reads of `evals/decisions/E155/defaults-floor-on.json` (defaults, floor on, policy live, 128 seeds x 200000 ticks, configHash
`ff8d890a5a70c14d`, run at `67d39a9c`, code-identical to main), by the committed `scripts/edge-diagnosis.mjs` (its output is
`evals/decisions/E155/edge-diagnosis.txt`), and by 16 replays of the same seeds and config with `scripts/edge-probe.mjs` (spread
over the seeds' share of time under 100 prey; `evals/decisions/E155/edge-probes/`). The 15 edge-span detectors are
**unverified**: they are null on the 21 seeds with no edge span (0.164 against the 0.10 bar), and `eval:power` voids an A/A split
that holds a null seed, so 21 nulls in 128 leave about 0.1 percent of the splits valid and the power reads rest on nothing. The
four reference rates are read (`eval.edge_ref_mate_births_per_prey` needs 32 seeds, split and starvation 16; the eaten rate fails
at a detectable change of 0.5). Every number below is a rate read from a report, not a metric verdict. The `eval.edge_*` rates
carry the regression to the mean that selecting spans on a low start count brings.

**The edge is nearly balanced.** `eval.edge_birth_death_ratio` has median 0.969 (mean 0.972) over the 107 seeds with an edge
span; it is under 0.6 on 2 and 0.6 or more on 105. Per prey per 1000 ticks at the edge: mate births 0.051 (0.083 in the
reference spans), split births 0.128 (0.112), starvation 0.105 (0.099), eaten 0.020 (0.032), all deaths 0.187. The deficit
(deaths minus mate and split births) is positive on 65 of 107 seeds, median 0.017 per prey per 1000 ticks, so a thin population loses
under 2 percent of itself per 1000 ticks.

**The swaps, ranked** (median share of the seed's deficit that replacing the edge rate with the seed's reference rate closes, over
the 65 seeds; the pooled share, summed gaps over summed deficits, in brackets): mate births 1.44 (1.44), starvation 0.70 (0.66),
split births -0.78 (-0.64), predation -0.94 (-0.68). Edge mating is the largest gap by far and closing it more than clears the
deficit. Splits and predation are no worse at the edge than in a standing population (splits are higher, hunters take fewer), so
their swaps are negative. Starvation is a second, smaller gap.

**E-LD-1 (E155) is falsified.** The ratio clause fails: 2 of 107 seeds read under 0.6, against the half the prediction needed. The
mate-swap clause holds (largest median share, above); but the prediction said the edge loses much more than it replaces, and it
does not.

**Why worlds fall and stay low while the edge ratio is near 1.** From the traces of all 128 seeds (samples every 1000 ticks after
burn-in):

| Reading                                                              | Value                                                                                       |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Seeds with a checkpoint under 100 prey; for at least half; end under | 107 of 128; 46; 60                                                                          |
| Share of checkpoints under 100 prey (median over seeds)              | 0.346                                                                                       |
| Median lowest total population; seeds reaching `floorTrigger` (8)    | 17.5; 50 of 128                                                                             |
| Runs under 100 prey (episodes)                                       | 251; median 13 checkpoints (9 for those that end); 0.58 last 10 or more; 60 last to the end |
| Episodes that reach the floor trigger                                | 0.20; floor births are 0.017 of births (`eval.birth_source_share.floor`)                    |
| Episodes that fall from over 400 prey                                | 0.036; the median fall is 3 checkpoints from its peak, all 3 inside 100 to 400              |
| Season of entry (spring, summer, autumn, winter)                     | 87, 67, 54, 43                                                                              |

The 16 replays give births and deaths per prey per 1000 ticks by the band and season an interval starts in:

| Start      | Season | Mate births | Split births | Births | Deaths | Starved | Eaten |
| ---------- | ------ | ----------- | ------------ | ------ | ------ | ------- | ----- |
| under 100  | all    | 0.051       | 0.122        | 0.173  | 0.187  | 0.109   | 0.012 |
| under 100  | summer | 0.035       | 0.110        | 0.145  | 0.185  | 0.109   | 0.027 |
| 100 to 400 | all    | 0.092       | 0.110        | 0.202  | 0.198  | 0.102   | 0.031 |
| 100 to 400 | spring | 0.109       | 0.099        | 0.208  | 0.187  | 0.095   | 0.029 |
| 100 to 400 | summer | 0.056       | 0.119        | 0.175  | 0.187  | 0.095   | 0.036 |
| 100 to 400 | winter | 0.114       | 0.138        | 0.252  | 0.258  | 0.149   | 0.030 |
| over 400   | all    | 0.098       | 0.039        | 0.137  | 0.139  | 0.087   | 0.010 |

- **A stable low state, not a slide.** Births and deaths balance at every density (ratio 0.93 under 100, 1.02 at 100 to 400,
  0.99 above 400), so there is no restoring force. In the traces (all 128 seeds), the mean change of prey in a 1000-tick
  interval is +3.6 percent when it starts under 100, +0.2 percent at 100 to 400 and -0.4 percent above 400, and half the
  intervals lose prey at every band. Spring is the only season that grows (+2.3 percent at 100 to 400; summer -1.4, autumn and
  winter -0.7). A thin population has nothing pushing it up, so it wanders, and 58 percent of episodes last 10 checkpoints
  or more.
- **The fall is not a crash from a boom into the edge.** Only 0.036 of episodes begin over 400 prey, and the births-over-deaths
  deficit lies at 100 to 400 in summer as well as under 100 (births over deaths 0.94 at 100 to 400, 0.78 under 100). The summer halves mate births at every
  density (0.056 at 100 to 400 against 0.109 in spring, 0.035 at the edge). Entries are spread over the seasons (spring 87, winter
  43).
- **The floor guard is not what refills them.** 0.20 of episodes and 50 of 128 seeds reach a total population of 8 or fewer at a
  checkpoint, and floor births are 1.7 percent of births; 80 percent of episodes end by the world's own births (a checkpoint
  misses a shorter dip, so the floor share is an upper-bound reading from below).

**The `seen` gate is not a mate out of reach.** `eval.edge_split_blocked_share.seen` is 0.50: half the eligible prey saw a mate
within `splitMateScarceTicks`. `eval.edge_mate_unreached_share` is 0.06, and the funnel agrees: of the 6849 mature prey-female
samples at 1110 edge checkpoints that saw a possible mate in the latest sense, only 246 (3.6 percent) had no male within
reach. They are in reach and do not mate. The first failing condition, in the order `isReadyToMate`, the brain's wish, a male
in reach, the male's readiness and wish, `canMatePair`:

| Class (first failing)                     | Seen, edge | Share | Seen, 100 to 400 | Share |
| ----------------------------------------- | ---------- | ----- | ---------------- | ----- |
| body temperature over 85 (`blocksMating`) | 3945       | 0.58  | 32409            | 0.50  |
| pregnant                                  | 990        | 0.14  | 14042            | 0.22  |
| energy under `mateMinEnergy`              | 681        | 0.10  | 7695             | 0.12  |
| female's brain does not want to mate      | 575        | 0.08  | 4267             | 0.07  |
| no male in reach                          | 246        | 0.04  | 1831             | 0.03  |
| male in reach not ready, or unwilling     | 302        | 0.04  | 2849             | 0.04  |
| cold stress, cooldown, pair rules         | 106        | 0.02  | 1354             | 0.02  |
| could mate now                            | 4          | 0.001 | 50               | 0.001 |

The largest block is heat. Under 100 prey and at 100 to 400 alike, about half the mature prey females are too hot to start a
mating (0.54 of mate-ready agent-ticks in the 2026-10-28 reading, `eval.heat_stress_share` 0.41 here), most in summer (3256 of
6433 summer female samples at the edge) because eating warms the body faster than the passive loss cools it. Heat acts on every
density, so it is not an edge rule; it is the rule that sets the mating rate everywhere. The edge differs from 100 to 400
little in the funnel (fewer pregnant females, 0.14 against 0.22, and more females whose brain does not want to mate); the rate gap of
0.051 against 0.083 sits in the last stage, "could mate now", which the snapshot sees only 4 and 50 times. No one predicate explains
it: the ones the plan names (`noteMatesSeen` reach, `splitClonalMax`, `splitMinEnergy`) are each a smaller part than heat, and the
season's `reproductionBonus` draw acts after `canMatePair`, so the funnel does not see it.

**What follows for Phase 3.** The detectors, the swap ranking and the funnel say that the mating rate is the gap and heat is
the biggest predicate behind it, at every density; the plan's levers (L1 reach, L2 and L3 split gates, L4 the season's chance) do not
touch heat. Predation ranks last and has no arm. The split swap is negative, so the split arms (`clonal-6`, `clonal-off`,
`split-600`, `scarce-300`) act on a rate that is not short at the edge. The grid is left as planned for the user to see this first
(docs/designs/low-density-edge.md, Phase 3): the premise that the edge under 100 prey is where the world is lost holds only in
part, since the births-over-deaths balance and the summer fall lie across 100 to 400 too.
