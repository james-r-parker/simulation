### 2026-11-08 - One kill rule for the ledger, events and observer (metric-trust T14)

- **Tick order (verified in the code):** `feed` lands the fatal bite (`applyBite` sets `lastBiter`, books the ledger), then `reap` credits the ledger kill, calls `noteKill` and frees the victim's slot, and only then the merit phase notes `lastBiteDeliberate`, for victims still alive. So before T14 the ledger, `noteKill` and the observer all read the bite before the fatal one; the observer's `lastBiteTick == tick` test could never match a freed slot.
- **Rule:** `isDeliberateKill` in `js/sim/kills.js` reads the biter's prey tracker at the bite. `HunterKill`, `ledgerKills` and the kill-energy branch of `noteBiteLedger` use it; the observer counts the `HunterKill` records. A fatal bite that is not a deliberate kill is bite gain. `noteKill`, `creditKills` and the observer's per-slot `deliberateKills` stay on the old rule until T15; `worldHash` is unchanged.
- **Run:** first 16 seeds of `evals/seeds.json`, 200000 ticks, floor on, policy live, before at the commit ahead of T12 and after at T14, `npm run eval:compare`. The observer's convergence credits feed the live policy's fitness, so the after run also carries that effect; the two cannot be separated here.

| Metric                             | Before  | After   | Change | 95% interval                |
| ---------------------------------- | ------- | ------- | ------ | --------------------------- |
| `eval.hunter_kills_per_life`       | 0.0625  | 0.1875  | +200%  | 0 to 0.25                   |
| `eval.hunter_zero_kill_share`      | 0.5946  | 0.5829  | -2.0%  | -0.0177 to -0.0001          |
| `eval.hunter_carrion_idle_share`   | 0.05636 | 0.04933 | -12.5% | -0.0198 to -0.0017 (better) |
| `eval.hunter_income_share.kill`    | 0.1257  | 0.09231 | -26.6% | -0.0378 to -0.0300          |
| `eval.hunter_income_share.bite`    | 0.4411  | 0.4736  | +7.3%  | 0.0283 to 0.0370            |
| `eval.hunter_income_share.carcass` | 0.4309  | 0.4319  | +0.2%  | -0.0000 to 0.0050           |
| `eval.hunter_first_kill_age`       | 683.2   | 663.7   | -2.9%  | -54.4 to 0.1                |

- **Reading:** kill energy fell by a quarter and moved to bite gain, as expected when a non-deliberate fatal bite is no longer a kill; kills per life rose because a deliberate fatal bite now counts. 16 seeds is under the 32 the doc asks of a verdict, so only the shares with intervals clear of 0 are signals.
- **Replay check:** `npm run replay -- --seed 1 --ticks 20000 --level debug --policy map-elites-v6`: 57 `HunterLedger` records, 11 with kills, none with kill energy above 0 and 0 kills.
