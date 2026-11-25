### 2026-11-19 - A hunt stage world is a 500-tick feast, and the trainer offers deaths from tick 10000 (training-stages E-TS-1c)

In the `hunt` and `hunt-weak` worlds the prey are gone by tick 500 (census from an offset 128 archive: forager 8, 4, 0 at ticks
0, 100, 500; predators 26, 20, 13, and 6 at tick 2000), and the trainer offers only deaths from `OFFER_FROM_TICK` (10000) of a
60000-tick episode, so a hunt stage selects on hunters that survived 9500 ticks without prey; the champions stop changing after
the first checkpoint. `--ticks` and `--offer-from` move the window. A trained hunter's BITE bias sits at the `hunterBiteBias`
ceiling (-0.5) yet bites siblings on 110 to 128 of 128 trials: the bite is released by the prey-strength skip weight
(+1.9 to +4.0) and nothing learns a kin-strength inhibition (-0.27 to +0.31), so `kin-spared` is a recognition problem, not the
open-jaw reflex. `reflexScores` (the exam) crashed on a champion of a specialisation with no reflex case until
`row?.score ?? null` (`evals/decisions/E-TS-1c/`).
