// Registry entries of the hunters family, third file (the first two hold 28 each); see index.js and
// docs/designs/metric-trust.md.

import { entry } from './entry.js';

export const HUNTERS_3 = {
    'eval.hunter_kills_per_life_mean': entry('hunters', {
        module: 'js/evo/scene-hunters.js',
        meaning:
            'Higher means hunter lives hold more deliberate kills on average; unlike the median it moves when a few lives kill more.',
        counts: 'Mean of the ledger kill count (ledgerKills, credited by noteLedgerKill) over HunterLedger records of hunters that died, whole run.',
        unit: 'kills',
        direction: 'watch',
        intended: 'higher',
        nullWhen: ['no hunter deaths'],
        arithmetic: 'test/evo/scene-hunters.test.js',
    }),
};
