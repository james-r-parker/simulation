### 2026-10-17 - Calibration noise at 16 seeds under a self-sustaining population

E19 (baseline-v5, seeds 1-16 against 17-32, final Phase 1 defaults) gave no verdict on any Target metric, but did give
verdicts off the Targets: `floor_episodes` -23.6% (better), `lineages_alive` -20.9% (worse), scout fitness better,
p90 predator fitness worse. Before Phase 1 the same calibration (E18) gave none. With a population that sustains itself
(born share 0.49 and 0.64 in the two E19 samples) per-seed variance in lineage and floor counts exceeds the 5% minimum effect at 16 seeds, so those
off-Target verdicts in E20 (`lineages_alive` -59.3%, `lineage_turnover` -44.7%) are read with that noise in mind. More
seeds, not a lower `--min-effect`, is the fix.
