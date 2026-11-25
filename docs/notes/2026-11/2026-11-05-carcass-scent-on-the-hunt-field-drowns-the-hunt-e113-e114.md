### 2026-11-05 - Carcass scent on the hunt field drowns the hunt (E113, E114)

- **Why it was built.** On 16 seeds, herbivore `meatFoodValue` 0.1 doubled hunters' share of carcass energy (0.126 to 0.245) while the end hunter count did not move, which reads as hunters not finding carcasses (T58's gate).
- **What was tried.** `scentCarcasses` deposited each alive carcass into the existing hunt scent field every tick, so no brain input changed.
- **What happened (8 seeds).** Hunters alive at the end fell from 6/8 to 4/8, median last-quarter hunter-ticks from 238069 to 44295, population mean from 414 to 315, and hunters' carcass share did not rise (0.149 to 0.135). With herb-meat 0.1 it was also worse than herb-meat alone.
- **Likely cause.** The hunt scent field is the pack's call channel and every agent reads it; carcasses that lie for `carcassTicks` flood it, so the call no longer points at live prey and prey learn to avoid it. A carcass cue needs its own channel (a new input), which changes the brain layout, so it is not retried inside balancing.
- **Also learned (E113).** Median kills per hunter life is 0 on every one of 20 levers; 80 to 92% of hunters never kill. Budget, rest, sprint and placement levers do not teach hunting.
