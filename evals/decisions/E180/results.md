# E180 - defender as active guard (prey-guilds Phase 2, T4 to T6)

**Prediction (recorded before the run).** When a `defender` holds `BITE > 0` with a `canHunt` target in its jaws,
draining `defenderRepelEnergy` and knocking the hunter back by `defenderRepelImpulse` at a cost of `defenderRepelCost`
gives defenders an active anti-predator response; paired with `turnMultiplier: 0.85`,
`splitMinEnergyMultiplier: 1.2`, and higher `maxEnergyMultiplier` (`1.2` or `1.4`), adult defenders force solo
hunters to peel off or pack up. On the 16-seed screen (`evals/screens/prey-guilds-defender.grid.json`, seeds 1 to 16,
400000 ticks, floor on, policy live), the finalist (`repel-med`, `repel-low`, or `repel-high`) raises
`eval.defender_repel_per_1k > 0` and improves `eval.hunt_abort_rate` or `eval.pack_lift`, and on 64 matched seeds
`keepRule` reads no guard `WORSE`. Falsified when every arm reads `eval.hunter_catches_per_1k` or `held` `WORSE`.

**Arms.** `control` is `defenderRepelEnergy: 0`, `defenderRepelImpulse: 0`. `repel-low` is `25` / `2.5` /
`maxEnergyMultiplier: 1.2`. `repel-med` is `40` / `4.0` / `maxEnergyMultiplier: 1.4`. `repel-high` is `60` / `5.0` /
`maxEnergyMultiplier: 1.4`.

**Run:** `npm run screen -- --grid evals/screens/prey-guilds-defender.grid.json` on branch
`feat/prey-guilds-t4-defender-repel` (T5), then the finalist and control on seeds 1 to 64 with `--keep-rule` (T6).
