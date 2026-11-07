// The ray march for every alive agent of the 500-agent micro world: `castSlot` (the kernel's gather and nearest hits,
// then the hit classes in JS) after `beginSense`. The kernel call by itself is timed in the `wasm` area
// (`wasm-sense.bench.js`).
import { castSlot } from '../../js/sim/ray-march.js';
import { beginSense } from '../../js/sim/wasm-sense.js';
import { aliveSlots, microSuite, microWorld } from './fixture.js';

const world = microWorld();
const slots = aliveSlots(world);

microSuite('ray-march', [
    [
        `castSlot x ${slots.length} agents, after one beginSense`,
        () => {
            beginSense(world, world.hash);
            let rows = 0;
            for (const slot of slots) {
                rows += castSlot(world, slot);
            }
            return rows;
        },
    ],
]);
