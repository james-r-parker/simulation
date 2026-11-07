// The brain phase in its parts. `poolRays` (one kernel call per slot), `writeBodyInputs` and `sampleInputActivity`
// are exported and timed alone. The rest runs inside one `brain_forward` call of the Rust kernel (wasm/src/brain.rs),
// so it is timed as differences: `forwardAll` on a world whose inputs are all zero (pooling, the recurrent step, the
// leak, the output sums and both tanh passes, with no input rows and no skip rows to add) against the same world with
// only the body block and with the real rays, and with Hebbian learning on. The kernel's own exports are timed raw in
// the `wasm` area.
import { BURN_IN_TICKS } from '../../js/sim/burn-in.js';
import { forwardAll } from '../../js/sim/brain.js';
import { writeBodyInputs } from '../../js/sim/body-inputs.js';
import { ACTIVITY_SAMPLE_TICKS, createInputActivity, sampleInputActivity } from '../../js/sim/input-activity.js';
import { poolRays } from '../../js/sim/ray-pool.js';
import { aliveSlots, microSuite, microWorld } from './fixture.js';
import { forkBrainWorld, shapedBrainWorld } from './brain-fixture.js';

const world = microWorld();
const learning = microWorld({ hebbianRate: 0.00001 });
const slots = aliveSlots(world);
const learnWorld = forkBrainWorld(learning);
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
    ['forwardAll, real inputs, Hebbian on', () => forwardAll(learnWorld)],
    [
        `sampleInputActivity on a sample tick (1 in ${ACTIVITY_SAMPLE_TICKS} ticks)`,
        () => sampleInputActivity(activity, sampling),
    ],
]);
