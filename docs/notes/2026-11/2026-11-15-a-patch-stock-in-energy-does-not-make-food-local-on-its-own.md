### 2026-11-15 - A patch stock in energy does not make food local on its own (honest-budgets)

- Meals spend a patch's stock by the item's energy and standing items reserve theirs (`js/sim/patch-reserve.js`), so
  `foodPatchCapacity` became an energy (83000) where the weight model used 1. A spawn the patch cannot pay is refused
  before placement, so a refused attempt draws no placement numbers.
- Sizing the stock from the full-map yield (`0.25 x foodPatchRegrow x mean patchRegrow x season factor x capacity x
patches` against the plant energy eaten a tick) puts 1x near today's intake. A larger stock stops binding and the
  population rides to `maxAgents` (E174: slope -0.85 at 2.5x against -0.14 at 1x).
- Chance food stayed above deliberate food on every seed of every arm: with patches paying, blobs still meet most
  food by wandering. `foodScarcity` is gone, so winter reaches food only through `patchRegrowFactor`.
