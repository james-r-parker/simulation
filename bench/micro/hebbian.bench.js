import { hebbianStep } from '../../js/sim/hebbian.js';
import { aliveSlots, microSuite, microWorld } from './fixture.js';

// A tiny rate: the same call repeats on one state, and a real rate would saturate the clamp, which real runs rarely do.
const world = microWorld({ leakEnabled: true, hebbianRate: 0.00001 });
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
