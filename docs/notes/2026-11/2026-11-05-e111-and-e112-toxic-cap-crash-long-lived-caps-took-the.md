### 2026-11-05 - E111 and E112 toxic cap crash: long-lived caps took the grazed-out food slots

The world-wide starvation crash of E110 is the toxic cap. It fruits from year phase 0.5 (tick 72000). By then the edible patches are grazed down to their stock floor, so most spawns into freed food slots are toxic caps. Nothing eats them, they lived 24000 ticks, and they held up to 1700 of the 2400 slots. Edible inflow fell from 471k to 178k energy per 1,000 ticks while demand stayed flat. Overshoot, patch death, the season table, herds and disease were each ruled out with a controlled rerun on seed 888035.

- **What fixes it.** Caps that live 4000 ticks with yield 0.2, plus `maxFood` 3600. The caps rot and free their slots, as a fruiting body does within days, and the larger cap leaves edible plants room while caps fruit. Fewer caps (`share` 1) or a milder toxin (`toxicity` 0.3) only reached 3 to 4 of 8 surviving worlds, because each cap still held its slot for 24000 ticks.
- **No smaller part matches.** Shorter life with the larger cap comes closest (6 of 8), and `maxFood` 3600 alone saves none.
- **What it buys, on 16 seeds with the floor on.**
    - Hunters at the end rise from 0.69 to 8.06, alive on 10 of 16 seeds instead of 3.
    - The floor share of hunter births falls from 0.37 to 0.03, and the population doubles.
- **What it costs (watch items).** Births per 1,000 ticks fall 10%, effective specialisation types 8%, and lineages alive from 7.0 to 5.4 (needs 32 seeds).
- **Diagnosis trap.** Counting eaten food as "slot alive before, dead after" undercounts, because `spawnFood` refills a freed slot in the same tick. Use the energy ledger's inflow instead.
