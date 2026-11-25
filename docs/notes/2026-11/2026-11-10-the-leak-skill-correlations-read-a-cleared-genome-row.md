### 2026-11-10 - The leak-skill correlations read a cleared genome row

`eval.leak_forage_corr`, `eval.leak_hunt_corr` and `eval.leak_flee_corr` were null on all 128 seeds of both T22
reports. `step` frees a dead agent's slot (`freeAgent` zeroes its `genomeId` and its `weights` row) before `observe`
sees the `AgentDied` event, so `noteLeakSkillDeath` found the genome id changed and skipped every life. The observer now
keeps each life's mean leak at birth (`noteLeakSkillBirth`, from the `AgentBorn` event while the row is still the
newborn's; founders arrive the same way in the first `observe`) and reads that at death. A genome row never changes
during a life, so the birth read is the life's leak. `test/evo/metric-source-brain-leak.test.js` runs the real `step`:
before the fix it logged 0 of 4 lives and the forage read stopped at "fewer than 200 lives". Other observer reads at
death that take a world row by slot have the same hazard; `noteBirthBody` already reads body traits at birth for this
reason. `worldHash` is unchanged: the observer is outside it.
