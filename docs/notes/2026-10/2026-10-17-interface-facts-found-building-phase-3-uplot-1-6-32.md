### 2026-10-17 - Interface facts found building Phase 3 (uplot 1.6.32)

- `uplot` touches `document` and `window` when imported, so nothing in `js/app/` imports it at the top: the page loads it with
  `import('uplot')` and `import('uplot/dist/uPlot.min.css')` when the charts drawer first opens, and `mountCharts` takes the
  class as an argument so the tests use a fake. `declare module '*.css'` in `js/app/globals.d.ts` types the stylesheet import.
- uPlot has no stacking: the stacked charts (family river, births and deaths, catch against escape) plot cumulative tops,
  highest first, so each lower band paints over the one above it. Series count is fixed per chart, so the river always has
  nine series (eight lineages and "others") and a function `fill` reads a colour table that `data` rewrites.
- Typed arrays work as uPlot data, so `columns(history)` hands out `subarray` views with no copy.
- A key event whose target is a button is ignored by `actionForKey`, so after a click on a control button `Space` activates
  that button instead of pausing; focus the canvas (click it) to use the keys again.
