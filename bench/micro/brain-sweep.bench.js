// `forwardAll` at 500 agents across brain size and input sparsity. `addInputs` and the skip block skip zero inputs, so
// cost follows the count of nonzero pooled values per agent; that count is printed beside the table (`writeInfo`).
import { forwardAll } from '../../js/sim/brain.js';
import { microSuite, microWorld } from './fixture.js';
import { forkBrainWorld, meanNonzeroInputs, shapedBrainWorld, writeInfo } from './brain-fixture.js';

const HIDDEN = [16, 24, 32, 48, 64];

/** @type {Array<[string, Record<string, any>]>} */
const fixtures = [];
for (const h of HIDDEN) {
    fixtures.push([`forwardAll, 500 agents, ${h} hidden, real world`, forkBrainWorld(microWorld({ brainHidden: h }))]);
}
const real = microWorld();
fixtures.push(
    ['forwardAll, 500 agents, 32 hidden, instinctWeight 0 world', forkBrainWorld(microWorld({ instinctWeight: 0 }))],
    ['forwardAll, 500 agents, 32 hidden, instinctWeight 1 world', forkBrainWorld(real)],
    ['forwardAll, 500 agents, 32 hidden, no ray hits', shapedBrainWorld(real, 'body')],
    ['forwardAll, 500 agents, 32 hidden, every ray hits', shapedBrainWorld(real, 'dense')],
);

// One pass so each fixture's pooled rows are current before they are counted.
/** @type {Record<string, number>} */
const nonzero = {};
for (const [name, fixture] of fixtures) {
    forwardAll(fixture);
    nonzero[name] = Math.round(meanNonzeroInputs(fixture) * 10) / 10;
}
writeInfo('brain-sweep', nonzero);

microSuite(
    'brain-sweep',
    fixtures.map(([name, fixture]) => [name, () => forwardAll(fixture)]),
);
