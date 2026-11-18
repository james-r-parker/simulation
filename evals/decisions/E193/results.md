# E193 - a silent bite at birth (honest-budgets Phase 6, T41)

**Question.** E192 found blind biting never leaves because the birth reflex (`applyInstinct`, `applyBirthReflex`) silences the
`ALARM`, `HUNT` and `SMOKE` biases but writes nothing to the `BITE` bias, so 75% of hunters are born with a bias of exactly 0 and
hold the jaws open on 72% of ticks, and split clones copy it. T41 closes it: new numeric key `hunterBiteBias` in [-4, 0]
(default 0, off), a ceiling on the `BITE` output bias of every `canHunt` founder and child of `hunterBiteBias` x `instinctWeight`
(`applyHunterReflex`, reached from `applyInstinct` and `applyBirthReflex`). A prey in view still releases the jaws through the
+2 x `instinctWeight` prey-to-`BITE` skip weight. Draws no random numbers; at 0 the rows are byte-identical.

**Scene and rule.** Scene: A real chase, the abort (a hunter that is not closing on prey does not burn energy striking at
nothing). Selection rule 6 (hunting wins by the chain, and the chain fails closed: the strike is released by a target, not open by
default). Also serves Parent spends and Boom and bust through the hunters that survive to feed.

**Natural analogue.** An innate releasing mechanism: a toad snaps only at a small moving shape, a frog's strike is inhibited
until the tectum signals prey, a cat's pounce follows a stalk. The wiring is closed until a target releases it. The sim opened
the jaws by default and left selection to close them (E192).

**Arms** (`evals/screens/honest-bite-bias.grid.json`, 16 seeds, 400000 ticks, policy live, defaults including
`killGorgeShare` 0.4, no `specFlipNoHunt`): `control` (`hunterBiteBias` 0: today's worlds), `bias-0.5`, `bias-1`, `bias-2`
(`hunterBiteBias` -0.5, -1, -2, so the founder's `BITE` bias starts at -0.5, -1 or -2 against the +2 prey skip weight: prey
strength above 0.25, 0.5 or 1 opens the jaws at birth).

**Prediction (written before any run).** At least one arm lowers `eval.strike_miss_energy_ratio` and `eval.bite_idle` (strikes at
air fall), lowers `eval.hunter_juvenile_death_share` below 0.70 (control reads about 0.86), keeps hunters alive at the end on at
least 11 of 16 seeds (control 11), keeps `eval.hunter_catches_per_1k` not `WORSE` against `control`, and `--keep-rule` against
`control` reads no guard `WORSE`. The cost is a slower first strike where prey is seen only faintly (the unseen share below 0.15).
Expected order of effect: -2 closes hardest and risks never opening for weak prey signals; -0.5 changes least. **Falsified when
every arm reads `eval.hunter_catches_per_1k` or `held` `WORSE`** (a silenced bite that never opens), the Stop-when for this screen.

**Run.** `scripts/run-detached.sh T41-screen --frozen -- npm run screen -- --grid evals/screens/honest-bite-bias.grid.json` on
branch `feat/honest-budgets-t41`. A finalist then runs 64 matched seeds (65 to 128) with `--keep-rule` (T42), then T36a on it.
A new key moves `rulesHash` (season 10 re-pinned in `library/seasons.json`), so it opens on the season branch if adopted.
