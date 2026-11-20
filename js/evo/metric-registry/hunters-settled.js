// The settled hunter metrics (metric-noise.md Phase 4, D3): the hunter headline metrics counted from BURN_IN_TICKS, beside
// the whole-run ones, so a seed whose hunters die early is not read as its founders.

import { entry } from './entry.js';

export const HUNTERS_SETTLED = {
    'eval.hunter_catches_per_1k_settled': entry('hunters', {
        module: 'js/evo/metrics-combat.js',
        meaning: 'Higher means hunters turn more of their time into fatal bites once the founders are gone.',
        counts: 'Eaten deaths from BURN_IN_TICKS on whose killer is a known hunter (killKind is HUNT or PACK), per 1000 hunter agent-ticks from BURN_IN_TICKS on.',
        unit: 'per 1k hunter agent-ticks',
        direction: 'higher',
        nullWhen: ['no hunter agent-ticks after burn-in'],
        arithmetic: 'test/evo/metrics-combat.test.js',
        source: 'test/evo/metric-source-hunters-settled.test.js',
    }),
    'eval.hunter_kills_per_life_mean_settled': entry('hunters', {
        module: 'js/evo/scene-hunters.js',
        meaning: 'Higher means hunter lives after the founders hold more kills on average.',
        counts: 'Mean ledger kill count over hunter lives after burn-in: HunterLedger records at or after BURN_IN_TICKS plus each hunter alive at the last tick with its kills so far.',
        unit: 'kills',
        direction: 'watch',
        intended: 'higher',
        nullWhen: ['no hunter life after burn-in'],
        arithmetic: 'test/evo/scene-hunters.test.js',
        source: 'test/evo/metric-source-hunters-settled.test.js',
    }),
    'eval.hunter_juvenile_death_share_settled': entry('hunters', {
        module: 'js/evo/scene-hunter-age.js',
        meaning: 'Lower means fewer hunters die before juvenileTicks, counting only deaths after the founders.',
        counts: 'HunterLedger records at or after BURN_IN_TICKS with age under config.juvenileTicks over all HunterLedger records at or after BURN_IN_TICKS.',
        unit: 'share',
        direction: 'lower',
        nullWhen: ['no hunter deaths after burn-in'],
        arithmetic: 'test/evo/scene-hunter-age.test.js',
        source: 'test/evo/metric-source-hunters-settled.test.js',
    }),
    'eval.pursuit_kill_share_settled': entry('hunters', {
        module: 'js/evo/metrics-intent.js',
        meaning: 'Higher means more hunter kills after the founders were made by a deliberate bite.',
        counts: 'Hunter kills from BURN_IN_TICKS on made by a deliberate bite over all hunter kills from BURN_IN_TICKS on.',
        unit: 'share',
        direction: 'higher',
        nullWhen: ['no hunter kill after burn-in'],
        arithmetic: 'test/evo/metrics-intent.test.js',
        source: 'test/evo/metric-source-hunters-settled.test.js',
    }),
};
