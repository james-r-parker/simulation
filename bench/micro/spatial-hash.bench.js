import { buildHash, cellRange } from '../../js/sim/spatial-hash.js';
import { aliveSlots, microSuite, microWorld } from './fixture.js';

const world = microWorld();
const slots = aliveSlots(world);

microSuite('spatial-hash', [
    ['buildHash, 500 agents and their food', () => buildHash(world.hash, world)],
    [
        `cellRange x ${slots.length} agents`,
        () => {
            let sum = 0;
            for (const slot of slots) {
                sum += cellRange(world.hash, world.x[slot], world.y[slot], world.size[slot])[0];
            }
            return sum;
        },
    ],
]);
