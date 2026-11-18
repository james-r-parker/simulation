# E191 - where blind biters come from (honest-budgets Phase 6, T40 as a diagnosis)

**Question.** E190 found hunters die of a bite-hold energy drain: they hold `BITE` on most ticks with no body in their jaws,
and each such tick costs `strikeMissCost`. The first plan for T40 was a screen of a lower strike price. The user withdrew it on
2026-11-18 as a rescue: under [principles.md](../../../docs/principles.md) Selection rules 1 (death is final: a failed genome is
gone when its bearers are gone and nothing copies it back), 4 (strength is who remains after the bad season) and 6 (hunting wins by
the chain, and the chain fails closed), a hunter that bites at nothing should starve and its genes die out. So the question is not
how to keep blind biters alive but **why blind biting keeps coming back if its bearers die**. No sim behaviour changes;
`strikeMissCost` stays at 1.

**Detector check (step 0).** The new readings are `js/evo/blind-bite-tracker.js` (a per-tick read of every alive hunter) and
`js/evo/blind-bite-lineage.js` (pure joins), both unit-tested, run by `scripts/blind-biters.mjs`. A blind tick is a tick with
`BITE` above 0 and no body in the jaws, read as `scene-strike-miss.js` reads it (so `eval.strike_miss_energy_ratio` is its
priced sum). An **unseen** blind tick is a blind tick with no ray showing prey (raw ray channel "I can bite it" is 0 on every
ray): a strike at air, as opposed to a hold while closing on a target. The first read of this record did not split the two
and showed the hunters that reproduce holding more (0.71 against 0.57), which is only the chasers; the split is the reading
that matters. A hunter is born with `BITE` weights the tracker reads on its first tick: the `BITE` output bias, and the skip
weight from the strongest prey hit's strength to `BITE`.

**Method.** `node scripts/blind-biters.mjs run --seed <n> --ticks 100000` on the live policy and the defaults
(`killGorgeShare` 0.4), seeds 1 to 12, one run each (12 parallel processes, detached as `E191-blind2`, about 9 minutes), then
`node scripts/blind-biters.mjs report <12 files>` (burn-in 10000, juvenile 3000, maturity 600; ids made unique across seeds).
2254 hunter lives were born after burn-in with a known outcome (a life alive and under 3000 ticks old at the end is censored).
The tracked lives per seed run from 27 (seed 6) to 583 (seed 11), so the pool is dominated by a few seeds and the lives inside a
lineage are not independent. The full table is `report.txt`, the numbers below are from `readings.json`.

## Readings

**1. Where hunters come from (birth source).** Every hunter after burn-in is a descendant or a flip; nothing is put back from
outside.

| Source                | Hunters born | Share of births | Blind share of life | Unseen blind share | Blind ticks held | Reach 3000 ticks |
| --------------------- | ------------ | --------------- | ------------------- | ------------------ | ---------------- | ---------------- |
| `split-hunter-parent` | 2131         | 0.945           | 0.606               | 0.322              | 0.950            | 0.148            |
| `spec-flip`           | 113          | 0.050           | 0.734               | 0.221              | 0.048            | 0.097            |
| `mate-hunter-parent`  | 10           | 0.004           | 0.216               | 0.153              | 0.002            | 0.100            |
| floor, immigrant      | 0            | 0               | -                   | -                  | -                | -                |

(Shares are pooled ticks over ticks; "blind ticks held" is the source's share of all blind ticks.) The floor, the archive seeder
and any immigrant place no hunter after burn-in (the floor guard acts only under 8 alive), and a spec-flip is 5% of births and
5% of the blind ticks. 95% of blind ticks are a split clone's.

**2. Is blind biting selected against?** Weakly, and only at the extreme.

- Child against its tracked hunter parent (2141 pairs): the blind share falls 0.716 to 0.629 and the child is lower in 62%
  of pairs, but the **unseen** blind share rises 0.262 to 0.354 (the child is lower in 37.5%). The parent-child correlation is
  0.47 (blind) and 0.37 (unseen), so the trait is inherited and regresses to a mean that is higher than the parent's.
- By hunter generation depth (0 is a root: a flip or a founder; 5+ is a fifth-generation descendant of a tracked hunter): the blind
  share falls 0.67, 0.70, 0.67, 0.63, 0.61 and the unseen blind share **rises** 0.25, 0.30, 0.33, 0.35, 0.37. Not a clean
  reading: depth is also birth tick, and the prey in view falls as the run goes (more unseen ticks is partly less prey), so this
  shows only that no fall of the unseen share across generations is visible, not that selection raises it.
- Lives of 600+ ticks in fifths by unseen blind share (lowest first): share 0.06, 0.17, 0.30, 0.46, 0.73; named as a parent by
  a tracked hunter 0.68, 0.70, 0.69, 0.61, **0.33**; reached 3000 ticks 0.28, 0.24, 0.23, 0.21, **0.11**; median age 1701, 1667,
  1810, 1728, **1349**. Selection removes the worst fifth (half the parenthood, 40% of the reach, 20% of the age) and is flat
  across the other four. Mature hunters that were a parent have an unseen share of 0.29 against 0.43 for the childless (parents
  are older, 1892 against 1277, so this is partly age).

**3. What refills the map with blind biters.** Not the floor, the archive or spec-flips (1 above), and not mutation:

- **The birth reflex leaves `BITE` unsilenced.** `applyInstinct` (`js/evo/instinct.js`) sets the output bias of `ALARM`, `HUNT`
  and `SMOKE` to -2 x `instinctWeight` ("the newborn is silent") and adds a +2 x `instinctWeight` skip weight from prey strength
  to `BITE`. It writes nothing to the `BITE` bias, and `randomWeights` starts every bias at 0. 75% of hunters
  (1689 of 2254) are born with a `BITE` bias of exactly 0 (a `tanh` output with no bias sits at the threshold, so the hidden layer
  and the prey skip weight decide each tick) and they hold `BITE` on 72% of ticks, striking at air on 33%.
- **A negative bias is the inhibition, and it is rare and pays little.** The 11% of hunters (253) born with a negative `BITE` bias
  hold it on 61% of ticks and strike at air on 21%, against 72% and 33% for a zero bias; they reach 3000 ticks 0.162 against
  0.140 (a gap inside what 253 lives can show). Mutation touches about 67 genes a birth of a row of thousands (`mutationRate`
  `invsqrt`), so the bias moves from the parent by 0.006 (standard deviation, 2141 pairs; correlation 0.956) and the prey-to-`BITE`
  skip weight by 0.006 (correlation 1.000, mean 2.07 on every hunter): a clone's `BITE` wiring is its mother's.
- **Split clones carry it.** Reading 1 and the parent-child correlation: a hunter's blind share is mostly its mother's. A
  hitchhiker (Selection rule 3: the whole genome is a bag until something breaks it) rides in on a clone that otherwise lives.
- **Selection cannot break it fast.** Only 15% of hunters reach 3000 ticks and the strike miss is about half of a juvenile's
  bite cost (E190), but which hunter starves depends as much on where it stands and how much prey is near: the four lowest fifths
  of the unseen share reproduce alike (reading 2). A trait that costs on a bad day and little on a good one is removed only at the
  bad extreme, and the weights that carry it are rewritten rarely.

So the answer to "why does it keep coming back": **it never leaves.** The seeding is a birth reflex that makes every founding
hunter bite near a coin flip and silences everything else; clones copy it; the mutation that would write a negative bias is
rare, and the selection that would favour it is flat except against the worst fifth.

**What this does not show.** Twelve runs of one length, one per seed, pooled; no confidence intervals (lineages are not
independent lives); nothing counterfactual (no run with a silenced `BITE` bias, so the cause is read from the birth weights and
their correlations, not shown by removing it). The unseen reading depends on the raw ray channel "I can bite it" standing for
"a target worth striking"; a hunter that smells prey or follows kin is counted unseen. The depth trend is confounded by the
birth tick. The probe reads hunters after the step, so a hunter that dies in a step loses its last tick.

## Natural analogue (nature first)

A real predator's young do not wave their jaws through air for most of the day. The strike is **released**, not default: a toad
snaps only at a small moving shape (an innate releasing mechanism), a frog's strike is inhibited until the tectum signals prey, a
cat's pounce follows a stalk and a wiggle. Cubs are led: a lioness and a cheetah take cubs to a kill and let them eat before they
try, play-stalking and pouncing at siblings and tails (a cheap, low-stakes strike), and attempt only prey they are big enough
for; a juvenile's first real strikes are a fraction of an adult's and are at small or wounded prey. A failed strike costs energy
and a lunge at a littermate or the mother is stopped by the other animal's reaction (the sim's `recoilEnergy`). What
evolution has not left is a default of "jaws open": the wiring is closed until a target releases it. The sim opens the jaws by
default and counts on selection to close them.

## Verdict and outcome to task

**Finding.** The blind biters are not refilled from outside. They are the clones' inheritance: the birth reflex silences the
three call outputs and leaves `BITE` at a bias of 0, so a newborn hunter's jaws are open on most ticks (72% for the 75% born with a bias of 0), 95% of hunters are split clones that keep the mother's wiring (a `BITE` weight changes by 0.006 a birth), and
selection removes only the worst fifth of the strikers. Selection rules 1 and 4 hold (the worst fifth is gone); the rule 3
"bag" lets the rest ride.

**T41 (proposed; a lever that removes the refill, not one that cheapens the miss).** A hunter is born with its `BITE` output
silent until a target releases it: `hunterBiteBias` (a number in [-4, 0], default 0), written at birth into the `BITE` bias of a
hunter's row in `applyInstinct` (a random founder) and `applyBirthReflex` (a spec-flip child, where it is a floor so a repeat
call changes nothing) as `hunterBiteBias x instinctWeight` against the +2 x `instinctWeight` prey skip weight that already
releases it, so a prey in view still opens the jaws at strength above `-hunterBiteBias / 2`. Clones inherit it. 16 seeds,
400000 ticks, arms `hunterBiteBias` 0 (control), -0.5, -1 and -2. Prediction, to be written before any run:
`eval.strike_miss_energy_ratio` falls, `eval.bite_idle` falls and `eval.hunter_juvenile_death_share` falls below 0.70 with hunters
alive on at least 11 of 16 and `eval.hunter_catches_per_1k` not worse; the cost is doing its job where the unseen share is below
0.15. Falsified when every arm reads catches or `held` `WORSE` (a silenced bite that never opens). Serves Parent spends, Boom and
bust, and A real chase (the abort). A new config key is a numeric rule, so no flag-ledger row; the `rulesHash` moves, so it
opens on the season branch if it is adopted.
