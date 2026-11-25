### 2026-10-31 - Flora Phase 1 in draft

- Mycelium persists for 144000 ticks; fertile zones expire too early to carry summer deaths into the fungal window.
- Plant intake counters record stored energy before food slots are cleared. The observer differences these counters after burn-in; same-tick slot reuse cannot hide a meal.
- A blocked mycelium disc refuses its fungus source and redraws patch/background rather than moving fungus away from the death site.
- E69-E74, metric power and performance measurements remain owed while balancing uses the CPU. The draft is rebased on balancing PR #223 (`f649cd8`) with goldens re-pinned.
