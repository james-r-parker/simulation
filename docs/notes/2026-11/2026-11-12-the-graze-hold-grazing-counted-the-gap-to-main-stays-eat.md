### 2026-11-12 - The graze hold: grazing counted, the gap to main stays (eat-choice T18, T19, E163)

Crediting a deliberately reached patch's later meals as deliberate (`js/sim/graze-hold.js`) closes only about a quarter
of the eat choice's drop in `eval.deliberate_food_share` (main 0.43, unheld switch 0.31, held 0.35). Most foragers on the
eat choice take food they did not close on. Because in-world merit reads the verdict, the hold also changes who breeds:
against the unheld switch the population mean rises 34% and the alive and under-80 guards read better, while
`eval.lineages_alive` falls another 10%. A detector that merit reads is a selection rule, not a passive reading, and is
judged by the keep rule like any other change.
