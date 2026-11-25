### 2026-11-10 - Hunters and intent source tests (metric-trust T16, T17)

All 57 hunters and 20 intent metrics now read a known answer on the real `step`, through the scripted hunting world in
`test/evo/helpers/hunt-scene.js`. What the scenes taught:

- **A kill reopened a phantom chase.** The closing bits of the observer's prey tracker outlive a chase by a few ticks, so
  on the tick of a kill `scene-approach.js` opened a new approach on the dead prey's last sighting; some 36 ticks later it
  lapsed as a give-up. One catch read `eval.chase_catch_share` 0.5. An idle hunter now opens only on a sighting newer than
  its last ended chase. Reports run before this fix (the T22 pair among them) carry the skewed chase, competence and
  matched values.
- **Two trackers judge deliberateness.** The sim's (`world.meritPrey`) decides kills (`isDeliberateKill`, the fatal
  bite) and `pursuit_kill_share`; the observer's own (`observer.intent.prey`) decides chases, `pursuit_bite_share`, the
  first bite of `pack_convergence` and the answer to a hunt call. Setting the sim's tracker is not enough for the second:
  the hunter must really close on prey in view (thrust toward it for at least `CLOSING_MIN` of `CLOSING_BITS` ticks).
- **Rays cover the full circle**, so a biter in contact is always seen, except when food lies nearer on every ray toward
  it: a food hit takes the ray. That is how `eval.unseen_bite_share` reads about 6% on the live defaults.
- **The simple world has a wall at x 500**, which pushes bodies placed on it; scenes sit at x 200.
- **Observer tick rules**: hunter and agent ticks count at every `observe` after tick 0; a caller's own birth observe is
  not an alive tick for its call base rate, but another spawn's observe while it is alive is, before it has sensed.
