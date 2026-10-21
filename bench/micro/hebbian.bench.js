import { hebbianStep } from '../../js/sim/hebbian.js';
import { aliveSlots, microSuite, microWorld } from './fixture.js';

const world = microWorld({ leakEnabled: true, hebbianRate: 0.05 });
const slots = aliveSlots(world);

microSuite('hebbian', [
    [
        `hebbianStep x ${slots.length} agents`,
        () => {
            for (const slot of slots) {
                hebbianStep(world, slot);
            }
        },
    ],
]);
