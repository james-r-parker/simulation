// The brain phase in its parts. `poolRays`, `writeBodyInputs`, `sampleInputActivity` and `hebbianStep` are exported and
// timed alone. `addInputs`, `hiddenStep`, the skip block and the output sums are private to `js/sim/brain.js`, so they
// are timed as differences: `forwardAll` on a world whose inputs are all zero (pooling, the recurrent step, the leak,
// the output sums and both tanh passes, with no input rows and no skip rows to add) against the same world with only
// the body block and with the real rays. The gap to "no inputs" is `addInputs` plus the skip block.
import { BURN_IN_TICKS } from '../../js/sim/burn-in.js';
import { forwardAll } from '../../js/sim/brain.js';
import { writeBodyInputs } from '../../js/sim/body-inputs.js';
import { hebbianStep } from '../../js/sim/hebbian.js';
import { ACTIVITY_SAMPLE_TICKS, createInputActivity, sampleInputActivity } from '../../js/sim/input-activity.js';
import { poolRays } from '../../js/sim/ray-pool.js';
import { aliveSlots, microSuite, microWorld } from './fixture.js';
import { forkBrainWorld, shapedBrainWorld } from './brain-fixture.js';

const world = microWorld();
const learning = microWorld({ hebbianRate: 0.00001 });
const slots = aliveSlots(world);
const learnSlots = aliveSlots(learning);
const none = shapedBrainWorld(world, 'none');
const bodyOnly = shapedBrainWorld(world, 'body');
const real = forkBrainWorld(world);
const sampleTick = Math.ceil(BURN_IN_TICKS / ACTIVITY_SAMPLE_TICKS) * ACTIVITY_SAMPLE_TICKS;
const sampling = forkBrainWorld(world, { tick: sampleTick });
const activity = createInputActivity(world.layout);
const n = slots.length;

microSuite('brain-parts', [
    [
        `poolRays x ${n} agents`,
        () => {
            for (let i = 0; i < n; i++) {
                poolRays(world, slots[i]);
            }
        },
    ],
    [
        `writeBodyInputs x ${n} agents`,
        () => {
            for (let i = 0; i < n; i++) {
                writeBodyInputs(world, slots[i]);
            }
        },
    ],
    ['forwardAll, all inputs 0 (no addInputs, no skip rows)', () => forwardAll(none)],
    ['forwardAll, body inputs only (no ray hits)', () => forwardAll(bodyOnly)],
    ['forwardAll, real inputs', () => forwardAll(real)],
    [
        `hebbianStep x ${learnSlots.length} agents`,
        () => {
            for (let i = 0; i < learnSlots.length; i++) {
                hebbianStep(learning, learnSlots[i]);
            }
        },
    ],
    [
        `sampleInputActivity on a sample tick (1 in ${ACTIVITY_SAMPLE_TICKS} ticks)`,
        () => sampleInputActivity(activity, sampling),
    ],
]);
