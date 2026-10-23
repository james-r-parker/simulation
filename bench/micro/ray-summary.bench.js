import { SCAN_SIZE, summariseRays } from '../../js/evo/ray-summary.js';
import { aliveSlots, microSuite, microWorld } from './fixture.js';

const world = microWorld();
const slots = aliveSlots(world);
const out = new Float64Array(SCAN_SIZE);
// Every other ray is an arc ray, so both branches of the prey test run.
const arc = Uint8Array.from({ length: world.config.rayCount }, (_, k) => k % 2);

microSuite('ray-summary', [
    [
        `summariseRays x ${slots.length} agents`,
        () => {
            for (const slot of slots) {
                summariseRays(world, slot, out, arc);
            }
        },
    ],
]);
