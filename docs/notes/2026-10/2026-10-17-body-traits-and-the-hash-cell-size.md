### 2026-10-17 - Body traits and the hash cell size

- With `traitsEnabled` the largest body is `baseSize x TRAIT_MAX + maxEnergy / energyToSize`, 132.5 at the defaults, which
  is above `hashCellSize` 128, so `validateConfig` rejects `traitsEnabled` at the default cell size. T41 raises
  `hashCellSize` (140 passes) when it switches traits on.
- The sensing hash is walked cell by cell along each ray until the ray exceeds its own range, so a longer vision trait needs
  no separate query radius; `castRays` takes the range from `visionOf` in `js/sim/traits.js`.
