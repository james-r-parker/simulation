### 2026-11-17 - Stillness detectors use existing observer signals

`js/evo/style.js` exports `RING_SPEED` (0.1), and `tickStyle` compares squared speed with the squared product of that
bar and `maxVelocity`; the stillness detectors reuse the same threshold without requiring a refuge ring.
`intent.lastThreat[slot] === world.tick` means the current ray scan saw a threat. `INTENT_WINDOW` deliberately carries
older sightings and would mislabel calm ticks if used for this detector. A chase's `openedTick` is recorded when its
approach opens, and the resolved callback receives its outcome, so an ambush can be counted from the existing chase
record without changing sim state or the RNG stream. Detector state remains observer-only.
