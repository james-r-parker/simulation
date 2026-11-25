### 2026-10-21 - The skill ladder on honest senses (world-balance T24)

`npm run ladder` at the defaults on the Phase 2 senses (10000 ticks, seeds 1-3), mean final population per rung, with
the Phase 1 ladder in brackets: forage `random` 12.7 (17.3), `wanderer` 0 (0), `sloppyForager` 0 (0), `foodSeeker`
324 (324), `fleer` 321 (285); combat `jawSitter` v `foodSeeker` 318 (318), `hunter` v `foodSeeker` 228 (228),
`hunter` v `fleer` 3.3 (0.7).

- `fleer` now matches `foodSeeker` when there are no predators: it no longer flees every bigger agent, only those that
  could bite it.
- `hunter` against `fleer` still nearly empties the world. Prey that see hunters from any angle still lose; the
  Phase 5 night should check that fleeing is not dominated before it tunes predation.
- The forage ladder is still a cliff between `sloppyForager` (dies out) and `foodSeeker` (B2).
