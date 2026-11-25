### 2026-11-03 - Disease ships on before its screen

- The contagion (`disease.md`) merged on at `diseaseSeedRate` 0.001 with the plan's other values (user, 2026-11-03). The only evidence is the T5 smoke run: 4 seeds x 50000 ticks gave a disease deaths share of 0.015 to 0.11, 36 to 126 strains per 100k ticks, family focus 0.99 to 1 and a frequency slope of -0.013 to 0.037. The six-arm screen (`E93`) moved to world-balance.md T95.
- Strains almost never jump between families at `diseaseSpecificity` 0.8: unrelated genomes sit about 1.13 apart, so a strain in a world of noisy random brains (the golden runs) infects only its first host.
- The observer and the live stats had hard-coded 6 death causes; a seventh (`disease`) would have been dropped without an error, because writing past the end of a typed array is ignored. Both now size from `DEATH_CAUSE`.
- On this 4-thread container the pre-commit hook's related tests include the slow anti-exploit suite, which starves `screen-run.slow.test.js` into its 5 s timeout; the file passes on its own.
