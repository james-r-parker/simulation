import * as rayMarch from '../../js/sim/ray-march.js';
import { OX, OY, RANGE, gatherNear } from '../../js/sim/ray-gather.js';
import { visionOf } from '../../js/sim/traits.js';
import { aliveSlots, microSuite, microWorld, seededValues } from './fixture.js';

const world = microWorld();
const slots = aliveSlots(world);
const COUNT = 1024;
// b is the ray direction dotted with the origin offset, c the squared distance less the squared radius: a mix of
// misses, hits from outside and origins inside the circle.
const bs = seededValues('circle-b', COUNT, -300, 300);
const cs = seededValues('circle-c', COUNT, -2000, 90000);
// A tree from before `circleHit` was exported has no such bench; `bench:micro --compare` then lists it as new.
const { circleHit } = rayMarch;

/** @type {Array<[string, () => unknown]>} */
const cases = [
    [
        `castRays x ${slots.length} agents`,
        () => {
            for (const slot of slots) {
                rayMarch.castRays(world, world.hash, slot);
            }
        },
    ],
    [
        `gatherNear (spatial-hash query) x ${slots.length} agents`,
        () => {
            const s = world.rayScratch;
            let rows = 0;
            for (const slot of slots) {
                s[OX] = world.x[slot];
                s[OY] = world.y[slot];
                s[RANGE] = visionOf(world, slot);
                rows += gatherNear(world, world.hash, slot);
            }
            return rows;
        },
    ],
];
if (typeof circleHit === 'function') {
    cases.unshift([
        `circleHit x ${COUNT}`,
        () => {
            let sum = 0;
            for (let i = 0; i < COUNT; i++) {
                sum += circleHit(bs[i], cs[i]);
            }
            return sum;
        },
    ]);
}

microSuite('ray-march', cases);
