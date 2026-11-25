### 2026-10-17 - How far eight family colours can be pushed apart (CIEDE2000, Machado 2009)

- Eight slots that stay at least 15 apart in normal vision and 10 apart under each of the Machado-2009 deuteranopia,
  protanopia and tritanopia matrices, and clear food teal, the three scents and the alarm and eaten reds by the same
  amounts, are barely feasible. A random-restart hill climb over hue, saturation and lightness found a set only at
  HSL lightness 0.55 to 0.7 with most slots at saturation 0.25 to 0.5 (a pastel set), by a margin of 0.15.
- At exactly HSL lightness 0.72 no eight-colour set cleared the thresholds (the best was 4 short, stuck on one slot's
  distance to food teal and to the hunt amber); allowing 0.55 to 0.72 found one. The colour-blind-safe set needs 20 apart
  under each simulation and only reached it with lightness 0.3 to 0.85.
- `test/app/renderer/helpers/color-metrics.js` reproduces the published CIEDE2000 test pairs to four decimals, so the
  thresholds mean what they say; the three matrices are applied in linear RGB.
