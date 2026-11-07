// The `build_hash` export alone (wasm/src/hash.rs): the counting sort of a 500-agent world's agents and food into the
// spatial hash, without the JS wrapper, so a change in the Rust shows undiluted. `npm run bench:micro -- --area wasm
// --compare HEAD` prices a rebuilt binary.
import { microSuite } from './fixture.js';
import { kernelWorld } from './wasm-fixture.js';

const world = kernelWorld();
const { exports, offsets } = world.wasm;
const cellSize = world.hash.cellSize;

microSuite('wasm-hash', [
    ['build_hash, 500-agent world and its food', () => exports.build_hash(offsets.hashParams, cellSize)],
]);
