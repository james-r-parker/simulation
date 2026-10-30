import { applyGenes, leakRateOf } from '../../js/sim/traits.js';
import { aliveSlots, microSuite, microWorld, seededValues } from './fixture.js';

const COUNT = 1024;
const genes = seededValues('leak-genes', COUNT, -4, 4);
const world = microWorld();
const slots = aliveSlots(world);

microSuite('traits', [
    [
        `leakRateOf x ${COUNT}`,
        () => {
            let sum = 0;
            for (let i = 0; i < COUNT; i++) {
                sum += leakRateOf(genes[i], 0.05);
            }
            return sum;
        },
    ],
    [
        `applyGenes x ${slots.length} agents`,
        () => {
            for (const slot of slots) {
                applyGenes(world, slot);
            }
        },
    ],
]);
