// The physics exports alone (wasm/src/physics.rs) on a 500-agent world, without the JS wrappers, so a change in the Rust
// shows undiluted: `move_agents`, `bounce_rocks` for every alive agent (no damage applied between calls) and
// `resolve_contacts` over the world's hash. Each call moves the copy's agents a little, as a tick would.
// `npm run bench:micro -- --area wasm --compare HEAD` prices a rebuilt binary.
import { aliveSlots, microSuite } from './fixture.js';
import { kernelWorld } from './wasm-fixture.js';

const world = kernelWorld();
const { exports, offsets } = world.wasm;
const params = offsets.physicsParams;
const slots = aliveSlots(world);

microSuite('wasm-physics', [
    ['move_agents, 500-agent world', () => exports.move_agents(params)],
    [
        `bounce_rocks x ${slots.length} agents, ${world.obsX.length} rocks`,
        () => {
            let hits = 0;
            for (const slot of slots) {
                for (let k = exports.bounce_rocks(params, slot, world.size[slot], 0); k >= 0;) {
                    hits++;
                    k = exports.bounce_rocks(params, slot, world.size[slot], k + 1);
                }
            }
            return hits;
        },
    ],
    ['resolve_contacts, 500-agent world', () => exports.resolve_contacts(params)],
]);
