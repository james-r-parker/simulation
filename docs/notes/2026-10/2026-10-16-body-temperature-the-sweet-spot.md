### 2026-10-16 - Body temperature: the sweet spot

With body temperature on the reachable-births defaults (seed 1, floor and immigration off, 20000 ticks), constant-thrust
scripted foragers (the foodSeeker's steering): thrust 0 dies out by tick 4453 at a mean temperature of 24; thrust 0.2
grows from 100 to 393 agents (1927 births) at a mean of 49.7, inside the 40-65 band; thrust 0.4 grows to 217 (mean 73);
0.6 to 163 (mean 81); thrust 1 dies out by tick 6295 (mean 78). Moving gently pays, and both sitting and rushing cost.
The legacy `temperatureGainMove` 0.025 and `temperatureLossPassive` 0.015 give this shape, but the live policy's
fed lifespan was 17% down at them, so T10 later tuned the defaults (next entry). In the
micro-world a sitter now dies at about tick 3850 against 9180 with the passive multiplier off (2.4x sooner). Averaged over the year the temperature holds at a speed fraction of 0.75 (the equilibrium speed in the design doc's Rules section). The legacy
`js/agent.js` scaled cooling by `1 + modifier x 0.07`, so hot seasons cooled faster, against its own comment; the port
follows the comment (`1 - modifier x 0.03`). A 2000 x 1000 test world with the default 25 obstacles can fail food
placement ("no point clear of obstacles"), which the eval-runner slow test now avoids with 4 obstacles.
