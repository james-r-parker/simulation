### 2026-11-05 - Basin divergence cannot gate an arm (T59 eval:power)

- **What was measured.** `npm run eval:power` on 32 default seeds (`evals/results/t59-defaults-32.json`, splits of 16).
- **Result.** No verdict for `eval.basin_divergence`, `eval.basin_spec_divergence` or `eval.basin_cluster_divergence`: 7 of 32 seeds have a basin under 20 agents in the last quarter, so the reading is null there, and nearly every 16-seed split holds one of those seeds. `predator_end_local_share` is null on 11 of 32.
- **How to use it.** The divergence readings are watch metrics, read as means beside the others, never an arm's gate. A null means a collapsed basin, which is itself the finding.
