// Builds a reflex case's input table (brain-reflex-tests.md, Input construction). Rows are never typed: each staged tick
// goes through the sim's own `stageWorld`, `buildHash` and `senseAll`, and what the brain reads of the subject (its raw
// `inputs` row and the per-ray lanes of `RAY_LANES`, which pooling turns into the food hue and body sense inputs) is
// copied out, so a change to the sensing code or the layout changes the table, not a hand-kept index.

import { BRAIN_LAYOUT_NAME, TRAIT_INDEX, brainLayout } from '../sim/brain-layout.js';
import { createConfig, rulesHash } from '../sim/config.js';
import { createRng, fork } from '../sim/rng.js';
import { senseAll } from '../sim/sensors.js';
import { buildHash } from '../sim/spatial-hash.js';
import { arenaConfig, viewOf } from './memory-probe-run.js';
import { stageWorld } from './pool-discrimination-stage.js';
import { REFLEX_TRIALS, SEQUENCE_TICKS } from './reflex-stage.js';

/**
 * The per-ray world lanes a table snapshots beside each raw row, in the order a tick's block holds them: the hue of a
 * food hit, and the size, speed and closing of an agent hit (docs/designs/body-genes.md, "Raw lanes").
 */
export const RAY_LANES = Object.freeze(['rayHue', 'raySize', 'raySpeed', 'rayClosing']);

/** Offset of the hunt half of a `heard` row (`HEARD_STRIDE` of js/sim/agent-arrays.js: alarm, then hunt). */
const HUNT_HALF = 3;

/**
 * @typedef {object} CaseTable
 * @property {string} name the case's name
 * @property {number} spec the subject's specialisation
 * @property {string} layoutName `BRAIN_LAYOUT_NAME` when the table was built
 * @property {string} rulesHash the `rulesHash` of the config it was built under
 * @property {number} rawInputCount values per `inputs` row (`rayCount x RAY_CHANNELS + EXTRA_INPUTS`)
 * @property {number} rayCount values per ray lane row (`rayHue` and the rest of `RAY_LANES`)
 * @property {number} trials trials drawn
 * @property {number} view the ray length of the body the rows are of (vision gene 0)
 * @property {{trial: number, staging: import('./reflex-stage.js').Staging}[]} sequences every sequence, in trial order
 * @property {Float32Array} rows `sequences.length x SEQUENCE_TICKS x rawInputCount` values, sequence-major
 * @property {Float32Array} rays `sequences.length x SEQUENCE_TICKS x RAY_LANES.length x rayCount` values,
 *   sequence-major; a tick's block holds each lane's `rayCount` values in `RAY_LANES` order
 */

/**
 * @param {Record<string, any>[]} agents the staged agents; one with a `sizeGene` gets a weight row with that size gene
 * @param {Record<string, any>} config the config overrides the arena is built from
 * @returns {Record<string, any>[]} the agents as `stageWorld` takes them
 */
function withGenes(agents, config) {
    const layout = brainLayout(createConfig(config));
    return agents.map(({ sizeGene, ...agent }) => {
        if (sizeGene === undefined) {
            return agent;
        }
        const weights = new Float32Array(layout.weightCount);
        weights[layout.traitStart + TRAIT_INDEX.SIZE] = sizeGene;
        return { ...agent, weights };
    });
}

/**
 * Moves the world's one herd animal to a staged place (the world was built with `herdCount` and `herdSize` 1).
 * @param {Record<string, any>} world the staged world
 * @param {{x: number, y: number} | undefined} herd where the animal stands; undefined leaves the world without one
 * @returns {void}
 */
function placeHerd(world, herd) {
    if (herd !== undefined) {
        world.herdX[0] = herd.x;
        world.herdY[0] = herd.y;
    }
}

/**
 * Writes a heard call into the subject's `heard` row, where the signal phase leaves it for `senseAll` to read.
 * @param {Record<string, any>} world the staged world
 * @param {import('./reflex-stage.js').Heard | undefined} heard the call, if one is heard
 * @returns {void}
 */
function hearCall(world, heard) {
    if (heard !== undefined) {
        const row = heard.call === 'hunt' ? HUNT_HALF : 0;
        world.heard[row] = heard.loudness;
        world.heard[row + 1] = heard.ux;
        world.heard[row + 2] = heard.uy;
    }
}

/**
 * @param {import('./reflex-stage.js').StagedTick & {seed: number}} stage a staged tick with the world seed
 * @param {Record<string, any>} config the config overrides the arena is built from
 * @returns {{inputs: Float32Array, rays: Float32Array}} the subject's (slot 0) raw `inputs` row and its rows of the
 *   `RAY_LANES` for that tick, as `sense` writes them
 */
function senseTick(stage, config) {
    const agents = /** @type {any} */ (withGenes(stage.agents, config));
    const herd = stage.herd === undefined ? {} : { herdCount: 1, herdSize: 1, herdDungZoneMax: 0 };
    const { world } = stageWorld({ ...stage, agents, config: arenaConfig({ ...config, ...herd }) });
    placeHerd(world, stage.herd);
    hearCall(world, stage.heard);
    buildHash(world.hash, world);
    senseAll(world, world.hash);
    const { rayCount } = world.config;
    const rays = new Float32Array(RAY_LANES.length * rayCount);
    RAY_LANES.forEach((lane, i) => rays.set(world[lane].subarray(0, rayCount), i * rayCount));
    return { inputs: world.inputs.slice(0, world.layout.rawInputCount), rays };
}

/**
 * Senses a staging's distinct ticks (a static staging has one) and writes all `SEQUENCE_TICKS` rows.
 * @param {import('./reflex-stage.js').Staging} staging the staging
 * @param {{config: Record<string, any>, seed: number}} run the config overrides and the world seed
 * @param {{rows: Float32Array, rays: Float32Array, raw: number, width: number, sequence: number}} into the table's
 *   arrays, the widths of a raw row and of a tick's ray block, and the staging's index
 * @returns {void}
 */
function writeSequence(staging, { config, seed }, { rows, rays, raw, width, sequence }) {
    const ticks = staging.ticks.map((tick) => senseTick({ ...tick, seed }, config));
    for (let t = 0; t < SEQUENCE_TICKS; t++) {
        const tick = ticks[Math.min(t, ticks.length - 1)];
        rows.set(tick.inputs, (sequence * SEQUENCE_TICKS + t) * raw);
        rays.set(tick.rays, (sequence * SEQUENCE_TICKS + t) * width);
    }
}

/**
 * Stages and senses every sequence of a case.
 * @param {import('./reflex-stage.js').ReflexCase} reflexCase the case
 * @param {{config?: Record<string, any>, seed?: number, trials?: number}} [options] the config overrides (default
 *   none), the base seed (default 1) and the trials (default `REFLEX_TRIALS`)
 * @returns {CaseTable} the table
 */
export function buildCaseTable(reflexCase, { config = {}, seed = 1, trials = REFLEX_TRIALS } = {}) {
    const base = createConfig(config);
    const raw = brainLayout(base).rawInputCount;
    const rays = base.rayCount;
    const view = viewOf({ spec: reflexCase.spec, weights: null }, base);
    const rng = fork(createRng(seed), `reflex:${reflexCase.name}`);
    const sequences = [];
    for (let trial = 0; trial < trials; trial++) {
        for (const staging of reflexCase.plan(rng, view)) {
            sequences.push({ trial, staging });
        }
    }
    const width = RAY_LANES.length * rays;
    const rows = new Float32Array(sequences.length * SEQUENCE_TICKS * raw);
    const rayRows = new Float32Array(sequences.length * SEQUENCE_TICKS * width);
    sequences.forEach(({ staging }, sequence) =>
        writeSequence(staging, { config, seed }, { rows, rays: rayRows, raw, width, sequence }),
    );
    return {
        name: reflexCase.name,
        spec: reflexCase.spec,
        layoutName: BRAIN_LAYOUT_NAME,
        rulesHash: rulesHash(base),
        rawInputCount: raw,
        rayCount: rays,
        trials,
        view,
        sequences,
        rows,
        rays: rayRows,
    };
}

/**
 * @param {CaseTable} table a table
 * @param {Record<string, any>} config the config overrides it is about to be evaluated under
 * @returns {void}
 * @throws {Error} `ReflexTableStale` when the layout name or the rules hash differ from the table's
 */
export function assertTableFresh(table, config) {
    const hash = rulesHash(createConfig(config));
    if (table.layoutName !== BRAIN_LAYOUT_NAME || table.rulesHash !== hash) {
        throw new Error(
            `ReflexTableStale: case ${table.name} was built for layout ${table.layoutName} and rules ${table.rulesHash}, ` +
                `now ${BRAIN_LAYOUT_NAME} and ${hash}`,
        );
    }
}

/** @type {Map<string, CaseTable>} */
const TABLES = new Map();

/**
 * `buildCaseTable`, kept for the process: a table is a function of the case, the seed, the trials, the layout and the
 * config, and every genome shares it.
 * @param {import('./reflex-stage.js').ReflexCase} reflexCase the case
 * @param {{config?: Record<string, any>, seed?: number, trials?: number}} [options] as `buildCaseTable`
 * @returns {CaseTable} the table
 */
export function tableFor(reflexCase, options = {}) {
    const { config = {}, seed = 1, trials = REFLEX_TRIALS } = options;
    const key = [reflexCase.name, seed, trials, BRAIN_LAYOUT_NAME, rulesHash(createConfig(config))].join('|');
    let table = TABLES.get(key);
    if (table === undefined) {
        table = buildCaseTable(reflexCase, options);
        TABLES.set(key, table);
    }
    return table;
}
