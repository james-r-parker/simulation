// The `update_pheromones` export alone (wasm/src/field.rs): the decay and diffusion of the danger, attack and hunt grids
// of a 500-agent world, without the JS wrapper, so a change in the Rust shows undiluted. `npm run bench:micro -- --area
// wasm --compare HEAD` prices a rebuilt binary.
import { microSuite } from './fixture.js';
import { kernelWorld } from './wasm-fixture.js';

const world = kernelWorld();
const { exports, offsets } = world.wasm;
const { pheromoneDecay, pheromoneDiffusion } = world.config;

microSuite('wasm-field', [
    [
        `update_pheromones, three ${world.pheromoneGrid.cols}x${world.pheromoneGrid.rows} grids`,
        () => exports.update_pheromones(offsets.fieldParams, pheromoneDecay, pheromoneDiffusion),
    ],
]);
