// The `brain_forward` export alone (wasm/src/brain.rs): one call runs pooling, the hidden step, the outputs and Hebbian
// learning for every alive slot of a 500-agent world. The raw export is timed, without the JS wrapper, so a change in
// the Rust shows undiluted. `npm run bench:micro -- --area wasm --compare HEAD` prices a rebuilt binary.
import { microSuite } from './fixture.js';
import { kernelWorld } from './wasm-fixture.js';

/**
 * @param {Record<string, any>} world an attached world
 * @returns {() => number} one `brain_forward` call on it
 */
function forwardCall(world) {
    const { exports, offsets } = world.wasm;
    return () => exports.brain_forward(offsets.params, offsets.paramDoubles);
}

const real = kernelWorld();
const learning = kernelWorld({ hebbianRate: 0.00001 });
const silent = kernelWorld();
silent.inputs.fill(0);

microSuite('wasm-brain', [
    ['brain_forward, 500 agents, real inputs', forwardCall(real)],
    ['brain_forward, 500 agents, Hebbian on', forwardCall(learning)],
    ['brain_forward, 500 agents, all inputs 0', forwardCall(silent)],
]);
