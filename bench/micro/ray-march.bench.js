// The ray march for every alive agent of the 500-agent micro world: `castSlot` (the kernel's gather and nearest hits,
// then the hit classes in JS) after one hash sync, and the sync alone. The kernel call by itself is timed in the
// `wasm` area (`wasm-sense.bench.js`).
import { castSlot } from '../../js/sim/ray-march.js';
import { syncSense } from '../../js/sim/wasm-sense.js';
import { aliveSlots, microSuite, microWorld } from './fixture.js';

const world = microWorld();
const slots = aliveSlots(world);

microSuite('ray-march', [
    [
        `castSlot x ${slots.length} agents, after one syncSense`,
        () => {
            syncSense(world, world.hash);
            let rows = 0;
            for (const slot of slots) {
                rows += castSlot(world, slot);
            }
            return rows;
        },
    ],
    ['syncSense (the hash mirror copy)', () => syncSense(world, world.hash)],
]);
