// The `sense_slot` export alone (wasm/src/sense.rs): the gather and the nearest hit of every ray for each alive agent of
// a 500-agent world, with the casters' origins, ranges and headings computed once up front, so a change in the Rust
// shows undiluted. `npm run bench:micro -- --area wasm --compare HEAD` prices a rebuilt binary.
import { detCos, detSin } from '../../js/sim/det-math.js';
import { visionOf } from '../../js/sim/traits.js';
import { syncSense } from '../../js/sim/wasm-sense.js';
import { aliveSlots, microSuite } from './fixture.js';
import { kernelWorld } from './wasm-fixture.js';

/**
 * @param {Record<string, number | boolean>} overrides config keys on top of the defaults
 * @returns {() => number} one `sense_slot` call per alive agent, the gathered rows summed
 */
function senseLoop(overrides) {
    const world = kernelWorld(overrides);
    const { exports, offsets } = world.wasm;
    const slots = aliveSlots(world);
    const origin = slots.map((slot) => [
        world.x[slot],
        world.y[slot],
        visionOf(world, slot),
        detCos(world.angle[slot]),
        detSin(world.angle[slot]),
    ]);
    syncSense(world, world.hash);
    const s = world.rayScratch;
    return () => {
        let rows = 0;
        for (let i = 0; i < slots.length; i++) {
            const o = origin[i];
            s[0] = o[0];
            s[1] = o[1];
            s[2] = o[2];
            s[8] = o[3];
            s[9] = o[4];
            rows += exports.sense_slot(offsets.senseParams, slots[i]);
        }
        return rows;
    };
}

microSuite('wasm-sense', [
    ['sense_slot x the alive agents, 500-agent world', senseLoop({})],
    ['sense_slot x the alive agents, coverConceals', senseLoop({ coverConceals: true })],
]);
