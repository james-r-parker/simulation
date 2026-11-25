### 2026-11-17 - Sprint cost is fixed per positive output

`tickCost` charges `sprintCost * juvenileBurnOf(world, slot)` whenever the SPRINT output is strictly positive; the charge
does not scale with output strength. Sprint adds thrust before the ordinary temperature, rest, handling, sickness and fat
factors, while `thrustEfficiency` scales it together with ordinary thrust. Movement energy cost then rises with speed
squared. `ledgerSprint` receives the realized charge only for `canHunt` agents; prey do not have that ledger. The sprint
detector therefore tallies the configured nominal charge in observer state for both roles, without adding sim arrays or
changing the world hash. This is not the realized charge on an energy-limited tick and can exceed total energy removed;
the metric is a nominal cost ratio, and only a low value indicates a negligible configured price.
