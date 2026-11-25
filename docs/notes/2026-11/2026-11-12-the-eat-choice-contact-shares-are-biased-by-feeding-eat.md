### 2026-11-12 - The eat-choice contact shares are biased by feeding (eat-choice T24, T25, E164)

Under G1 a forager eats an item only while it bites, and the item is removed in the same feed phase. An observer that
samples contact after the step therefore sees mostly the agents that did not bite: non-hunters hold `BITE` in 75% of
samples (`eval.graze_time_share`), but only 19% of those touching uneaten food do (`eval.food_contact_bite_share`).
Sampling ten times as often did not lift the shares' power either (0.15 detectable at 32 seeds, as at 1000-tick
checkpoints): the spread is between seeds. A tally that must see an action and its consumed target has to run where the
action happens, not after it. Hunters on the defaults pay 0.42 of their income in strike misses
(`eval.strike_miss_energy_ratio`), and `eval.split_bumper_share` is 0 on every seed of the eat-choice world, as `splitDeliberateShareMin` keeps a bumper from splitting.

**Fixed 2026-11-13 (eat-choice T27).** `tryEat` in `js/sim/feeding.js` now counts every non-hunter contact with food it can eat (those holding `BITE`, and the same in the 0.8 full band) into `world.eatContacts` before the item is removed; a non-hunter that does not bite still walks its cells so its contact counts. The observer reads the difference from the first checkpoint after burn-in. The counts are observer scratch the step never reads, so `worldHash` and the goldens did not move. A contact is one agent and one item in a tick, so an agent on several items counts several times. The power of the new shares is not yet re-read.
