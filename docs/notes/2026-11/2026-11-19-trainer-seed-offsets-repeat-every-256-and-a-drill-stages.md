### 2026-11-19 - Trainer seed offsets repeat every 256, and a drill stages adult weights (training-stages E-TS-1b)

`episodeSeed` indexes `evals/seeds.json` (256 seeds) by `(g x episodes + e + offset) mod 256`, so `--seed-offset 256` is offset 0
(E-TS-1b's two curves are identical) and offsets 64, 128 and 192 are the same stream shifted by 2, 4 and 6 generations: five
"offsets" give at most four distinct runs, and none is a fresh set of worlds. A drill stages the elite's trained weights, so a
birth-time key (`hunterBiteBias`, the newborn's BITE bias) changes nothing in a drill's `--config`; it acts only in a training
world. A fleer whose `sprintBoost` is cut still turns away: the hunt elites win 0 to 15 of 64 against it at 0.05 where an inert
prey is won on 32 to 54 (`evals/decisions/E-TS-1b/`).
