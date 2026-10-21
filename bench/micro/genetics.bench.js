import { geneticDistance } from '../../js/sim/genetics.js';
import { nextInt } from '../../js/sim/rng.js';
import { aliveSlots, microRng, microSuite, microWorld } from './fixture.js';

const PAIRS = 1024;
const world = microWorld();
const slots = aliveSlots(world);
const rng = microRng('genetic-pairs');
const as = new Int32Array(PAIRS);
const bs = new Int32Array(PAIRS);
for (let i = 0; i < PAIRS; i++) {
    as[i] = slots[nextInt(rng, slots.length)];
    bs[i] = slots[nextInt(rng, slots.length)];
}

microSuite('genetics', [
    [
        `geneticDistance x ${PAIRS} pairs`,
        () => {
            let sum = 0;
            for (let i = 0; i < PAIRS; i++) {
                sum += geneticDistance(world, as[i], bs[i]);
            }
            return sum;
        },
    ],
]);
