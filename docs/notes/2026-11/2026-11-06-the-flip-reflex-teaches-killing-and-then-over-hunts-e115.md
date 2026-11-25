### 2026-11-06 - The flip reflex teaches killing and then over-hunts (E115)

- **What ran.** Phase 1 of hunter-learning.md on 8 floor-off seeds: `flipReflex`, `provisionEnabled`, `juvenileDependency`, alone and together.
- **The flip reflex teaches.** Kill conversion at age 1000 to 2000 rises from 0.038 to 0.094, spec-flip hunters kill 0.403 per 1,000 ticks instead of 0.065, and the zero-kill share falls from 0.805 to 0.599. It is the first lever in balancing that moves competence, not only survival.
- **Then it over-hunts.** Prey types at the end fall from 3.38 to 1.75, the population mean from 358 to 186, and 7 of 8 seeds fall under 80 agents. Hunters that can kill need a brake that the world does not yet have (satiation, territory or prey escape), so the flip reflex is not kept alone.
- **Provisioning keeps hunters alive without teaching them.** Hunters alive at the end on 6/8 seeds instead of 5/8, no seed under 80 agents, conversion flat (0.029). The juvenile burn and kin floor alone hurt (4/8 alive); with provisioning they reach 7/8.
- **Detector note.** `eval.hunter_independent_kill_share` falls under provisioning by construction, because a provisioned hunter's kills are dependent for `INDEPENDENT_TICKS`.
