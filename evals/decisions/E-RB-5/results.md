# E-RB-5 - the five specs against a stampeding herd, on the defaults and the five fair-chase arms

`npm run role:budget -- --rows <the five <spec>:herd rows> --check` on the default config and on each arm of `evals/fair-chase/`.
The reports are `<arm>.txt` and `<arm>.json`; `--check` exits 0 on every arm. The herd rows read the herd's numbers and the body's,
neither of which the arms change (an arm changes the hunter's sprint and senses), so the six reports are the same table. Every row is
read with every effect off.

The scene is the one of `playStampede`: a herd of 8 animals on a ring of 224.09 px, startled from a standstill toward a body in its path
(the flee axis +x, `herdRunSpeed` 6.5, `herdWalkSpeed` 1.5), the body standing `viewReach + herdRadius` ahead of the front animal so that a
ray first meets it at tick 0. The front animal's velocity relaxes toward 6.75 by 0.05 a tick and is capped at 6.5 (65 ticks to the run
speed). Cells: `see` the ticks before the front arrives; `turn` the ticks left once the reaction (2) and the turn through a right angle are
paid; `run` the ticks left once the better of the cruise and the sprint has cleared the half-width sideways (333.09 px with the body); `survive`
the tramples the body's energy holds at the herd's speed on arrival. The worst case (facing away, on the rear view) is the cell.

| Spec       | see | turn | run | survive | Status     | Binding                      | sees the front at | clears (cruise / sprint) |
| ---------- | --- | ---- | --- | ------- | ---------- | ---------------------------- | ----------------- | ------------------------ |
| forager    | 59  | 47   | 8   | 3!      | tight      | survive                      | 271 px            | 53 / 39 ticks            |
| predator   | -   | -    | -   | -       | n/a        | the herd turns from a hunter | 115 px (rear)     | 55 / 36                  |
| reproducer | 51  | 39   | X   | 3!      | impossible | run                          | 221 px            | 53 / 39                  |
| scout      | 74  | 62   | 23  | 3!      | tight      | survive                      | 371 px            | 53 / 39                  |
| defender   | 49  | 37   | X   | 3!      | impossible | run                          | 211 px (rear)     | 53 / 39                  |

## Reading

- **Only a body that sees 270 px or more of the herd can clear it.** A herd closes 6.5 px a tick, and the body needs 2 ticks to react, 10.5 to turn
  and 39 to clear at a sprint: 52 ticks, 340 px of the herd's run. The forager (271 px, 8 ticks to spare) and the scout (371 px, 23) can; the
  reproducer (221 px) and the defender (211 px behind it) cannot. The predator is not read at all: it hunts, so the herd turns from it (below).
  At the defaults the herd is a pressure only the forager and the scout can meet by running.
- **Every plant eater is `tight` on `survive` at best:** a trample at the herd's speed on arrival takes 279 to 306 energy of the 1000 a body
  holds at half a store, so 3 tramples. The predator holds 5000 and survives 14. A herd carries a body along at its own speed after the first
  hit (the body takes the reflected velocity), and the sim reads 4 or 5 further small losses, so the budget reads the first trample, which is the
  one that matters.
- **A body that can outrun the herd straight ahead lives:** cruise 8 against the herd's 6.5 peak, from rest it takes 32 ticks to reach the
  cap, so the second line of the plan reads `outruns it` for every spec, but the body is overtaken in the ticks it needs to get there.
- **The arrival is exact, the clear is an upper bound:** the front's arrival matches the scene exactly (59, 51, 74 and 49 ticks) and the first
  trample is within 2% (299 against 304; the herd's speed on arrival is 6.42 px a tick, below the 6.5 of the plan's constant, which would give
  306.3). The clear is not a match: the formula pays the turn and then the run from rest (51.5 ticks), while the sim's body runs as it turns and
  clears in 45, so the formula's clear is an upper bound on the sim's.
- **The herd, alone** (`measureStampede`): the centroid travels 407 px by tick 80 and 2227 px by tick 360, the mean speed peaks at 6.50 and the
  half-width goes from 224 to 234. The plan's measurements before T21a's fix (329 px by tick 80, 516 by tick 360, peak speed 5.1, half-width 66) are gone.

## What the numbers do not say

- **A hunter in the path does not meet the stampede it did not cause.** A body that can hunt within 200 px of an animal starts its own stampede
  away from it (`senseHunters`), so the herd turns before it arrives. The predator row is `n/a` for that reason (`budgetHerd` binds it to
  "the herd turns from a hunter"), and the scene reads only the four that do not hunt.
- **A ring wider than four herd radii** (a herd of 12 or more at the defaults: the ring passes 320 px at 12) pulls the front animal back toward the centroid at full speed, so
  the formula's front is too fast; the row prints a warning and the slow test reads a herd of 10.
- **The rows do not model the lateral pull,** the separation between animals, rocks or the wall, and the herd's route to a patch; a herd that is
  not startled walks at 1.5 px a tick and a trample at that speed takes 16 energy (61 survived).
