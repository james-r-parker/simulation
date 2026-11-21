# E253 (E-FC-1) - the chase envelope with the sprint store

fair-chase.md Step 1 (T5). Scripted oracles in the empty arena, seed 1, 8 trials per distance and bearing (5 distances x 8
bearings = 320 trials per pair), on the code of `feat/sprint-store` (T1 to T4). The prediction was committed in
`evals/experiments.json` before any run.

```
npm run audit:chase -- --config evals/fair-chase/<arm>.json --pairs predator:forager,predator:scout,predator:defender,predator:reproducer --trials 8 --json
npm run audit:chase -- --config evals/fair-chase/<arm>.json --pairs ... --trials 8 --json --straight
```

| Arm       | Config                                                            | Store ticks above the floor (prey, predator) |
| --------- | ----------------------------------------------------------------- | -------------------------------------------- |
| `control` | `sprintStoreEnabled` false                                        | unlimited                                    |
| `even`    | drain 0.01                                                        | 70, 70                                       |
| `long`    | drain 0.004                                                       | 175, 175                                     |
| `courser` | drain 0.01, predator `sprintDrainMultiplier` 0.5                  | 70, 140                                      |
| `stalker` | drain 0.01, predator `sprintDrainMultiplier` 2, `sprintBoost` 2.2 | 70, 35 (at a sprint cap of 16.8)             |

With the store on, the oracles sprint only while their store is above `sprintFloor` (0.3), so a store gives
`(1 - 0.3) / drain` ticks of full sprint; the pursuer sprints only with the evader in view, the evader only with the
pursuer within 3 x `JINK_RANGE` (360).

## Catch share by start distance (share of the predator's view, 400), breaking evader

| Arm       | Pair                | 0.2  | 0.4  | 0.6  | 0.8  | 1.0  | Fair band (0.2 to 0.8)  |
| --------- | ------------------- | ---- | ---- | ---- | ---- | ---- | ----------------------- |
| `control` | predator:forager    | 0.17 | 0.00 | 0.00 | 0.00 | 0.00 | none                    |
| `control` | predator:scout      | 0.17 | 0.00 | 0.00 | 0.00 | 0.00 | none                    |
| `control` | predator:defender   | 0.13 | 0.00 | 0.00 | 0.00 | 0.00 | none                    |
| `control` | predator:reproducer | 0.16 | 0.00 | 0.00 | 0.00 | 0.00 | none                    |
| `even`    | predator:forager    | 0.17 | 0.00 | 0.00 | 0.00 | 0.00 | none                    |
| `even`    | predator:scout      | 0.17 | 0.00 | 0.00 | 0.00 | 0.00 | none                    |
| `even`    | predator:defender   | 0.13 | 0.00 | 0.00 | 0.00 | 0.00 | none                    |
| `even`    | predator:reproducer | 0.16 | 0.00 | 0.00 | 0.00 | 0.00 | none                    |
| `long`    | predator:forager    | 0.17 | 0.00 | 0.00 | 0.00 | 0.00 | none                    |
| `long`    | predator:scout      | 0.17 | 0.00 | 0.00 | 0.00 | 0.00 | none                    |
| `long`    | predator:defender   | 0.13 | 0.00 | 0.00 | 0.00 | 0.00 | none                    |
| `long`    | predator:reproducer | 0.16 | 0.00 | 0.00 | 0.00 | 0.00 | none                    |
| `courser` | predator:forager    | 0.50 | 0.42 | 0.67 | 0.63 | 0.25 | 0.2, 0.4, 0.6, 0.8, 1.0 |
| `courser` | predator:scout      | 0.59 | 0.50 | 0.69 | 0.63 | 0.19 | 0.2, 0.4, 0.6, 0.8      |
| `courser` | predator:defender   | 0.27 | 0.19 | 0.55 | 0.63 | 0.20 | 0.2, 0.6, 0.8, 1.0      |
| `courser` | predator:reproducer | 0.52 | 0.38 | 0.73 | 0.63 | 0.16 | 0.2, 0.4, 0.6, 0.8      |
| `stalker` | predator:forager    | 0.19 | 0.13 | 0.00 | 0.00 | 0.00 | none                    |
| `stalker` | predator:scout      | 0.19 | 0.16 | 0.00 | 0.00 | 0.00 | none                    |
| `stalker` | predator:defender   | 0.13 | 0.00 | 0.00 | 0.00 | 0.00 | none                    |
| `stalker` | predator:reproducer | 0.20 | 0.13 | 0.00 | 0.00 | 0.00 | 0.2                     |

## Catch share by start distance, straight runner (`--straight`, a bound)

| Arm       | Pair                | 0.2  | 0.4  | 0.6  | 0.8  | 1.0  | Fair band               |
| --------- | ------------------- | ---- | ---- | ---- | ---- | ---- | ----------------------- |
| `control` | predator:forager    | 0.75 | 0.83 | 0.88 | 0.75 | 0.69 | 0.2, 0.8, 1.0           |
| `control` | predator:scout      | 0.70 | 0.75 | 0.88 | 0.83 | 0.67 | 0.2, 0.4, 1.0           |
| `control` | predator:defender   | 0.64 | 0.73 | 0.88 | 0.78 | 0.63 | 0.2, 0.4, 0.8, 1.0      |
| `control` | predator:reproducer | 0.69 | 0.75 | 0.88 | 0.80 | 0.66 | 0.2, 0.4, 0.8, 1.0      |
| `even`    | predator:forager    | 0.33 | 0.34 | 0.00 | 0.00 | 0.00 | 0.2, 0.4                |
| `even`    | predator:scout      | 0.33 | 0.38 | 0.00 | 0.00 | 0.00 | 0.2, 0.4                |
| `even`    | predator:defender   | 0.31 | 0.33 | 0.00 | 0.00 | 0.00 | 0.2, 0.4                |
| `even`    | predator:reproducer | 0.36 | 0.34 | 0.00 | 0.00 | 0.00 | 0.2, 0.4                |
| `long`    | predator:forager    | 0.48 | 0.83 | 0.67 | 0.63 | 0.25 | 0.2, 0.6, 0.8, 1.0      |
| `long`    | predator:scout      | 0.47 | 0.75 | 0.69 | 0.63 | 0.19 | 0.2, 0.4, 0.6, 0.8      |
| `long`    | predator:defender   | 0.38 | 0.73 | 0.72 | 0.63 | 0.20 | 0.2, 0.4, 0.6, 0.8, 1.0 |
| `long`    | predator:reproducer | 0.45 | 0.75 | 0.73 | 0.63 | 0.16 | 0.2, 0.4, 0.6, 0.8      |
| `courser` | predator:forager    | 0.75 | 0.88 | 0.67 | 0.63 | 0.25 | 0.2, 0.6, 0.8, 1.0      |
| `courser` | predator:scout      | 0.78 | 0.88 | 0.69 | 0.63 | 0.19 | 0.2, 0.6, 0.8           |
| `courser` | predator:defender   | 0.56 | 0.75 | 0.72 | 0.63 | 0.20 | 0.2, 0.4, 0.6, 0.8, 1.0 |
| `courser` | predator:reproducer | 0.70 | 0.88 | 0.73 | 0.63 | 0.16 | 0.2, 0.6, 0.8           |
| `stalker` | predator:forager    | 0.34 | 0.16 | 0.00 | 0.00 | 0.00 | 0.2                     |
| `stalker` | predator:scout      | 0.31 | 0.19 | 0.00 | 0.00 | 0.00 | 0.2                     |
| `stalker` | predator:defender   | 0.36 | 0.00 | 0.00 | 0.00 | 0.00 | 0.2                     |
| `stalker` | predator:reproducer | 0.33 | 0.16 | 0.00 | 0.00 | 0.00 | 0.2                     |

## The pass rule (fair-chase.md Step 1)

An arm passes when the predator-on-forager fair band against the breaking evader covers at least 2 of the 5 start
distances, and the full-view catch share on the straight runner is under 0.8.

| Arm       | Breaking band (predator:forager) | Straight, full view | Passes |
| --------- | -------------------------------- | ------------------- | ------ |
| `control` | none (0.17 at 0.2)               | 0.69                | no     |
| `even`    | none (0.17 at 0.2)               | 0.00                | no     |
| `long`    | none (0.17 at 0.2)               | 0.25                | no     |
| `courser` | 5 distances                      | 0.25                | yes    |
| `stalker` | none (0.19 at 0.2)               | 0.00                | no     |

## Reading

- Against the breaking evader, `even` and `long` are identical to `control` trial for trial: the jink, not the store,
  decides those chases. A predator whose store empties as fast as its prey's never reaches the tired prey; the catches
  at 0.2 are made inside the first burst, before either store falls under the floor.
- `courser` is the only arm whose hunter outlasts its prey, and it is the only one that changes the breaking chase: once
  the prey's store is under the floor it can no longer sprint out of the jink, and the hunter, still sprinting, takes it
  at every start distance. The band runs from 0.2 to 1.0 on the forager, with catch shares of 0.25 to 0.67.
- `stalker`'s 35-tick burst at 16.8 catches only close (0.19 at 0.2, 0.13 at 0.4): no band on the forager.
- On the straight runner every store arm drops the full-view share well under `control`'s 0.69: the pursuer sprints
  only with the prey in view, and at 1.0 of view half the trials start just outside it.
- `control` has no fair distance at 8 trials (0.17 at 0.2); the plan's 0.25 at 0.2 was read at 4 trials.

## Prediction

Held: `courser` passes with the widest band; `long` fails; `stalker` is the weakest store arm; every full-view
straight share is under 0.8. Falsified: `even` does not widen the band (predicted at least 0.2 and 0.4; it is none), and
`courser` widens it further than predicted (5 distances, not 2 to 3). The falsification clause (even and courser both at
1 distance or fewer) is not met.

## For Phase 2

`courser` alone passes, so it is the one arm named for Phase 2 (`prey-ahead` learnability and the `hunt` rung). No
second arm passes; `long` (the straight-runner band is wide, but the breaking band is none) is the nearest miss and is
not named.
