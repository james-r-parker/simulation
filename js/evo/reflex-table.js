// Builds a reflex case's input table (brain-reflex-tests.md, Input construction). Rows are never typed: each staged tick
// goes through the sim's own `stageWorld`, `buildHash` and `senseAll`, and what the brain reads of the subject (its raw
// `inputs` row and the `rayHue` of each ray, which pooling turns into the two food hue inputs) is copied out, so a
// change to the sensing code or the layout changes the table, not a hand-kept index.

import { BRAIN_LAYOUT_NAME, TRAIT_INDEX, brainLayout } from '../sim/brain-layout.js';
import { createConfig, rulesHash } from '../sim/config.js';
import { createRng, fork } from '../sim/rng.js';
import { senseAll } from '../sim/sensors.js';
import { buildHash } from '../sim/spatial-hash.js';
import { arenaConfig, viewOf } from './memory-probe-run.js';
import { stageWorld } from './pool-discrimination-stage.js';
import { REFLEX_TRIALS, SEQUENCE_TICKS } from './reflex-stage.js';

/**
 * @typedef {object} CaseTable
 * @property {string} name the case's name
 * @property {number} spec the subject's specialisation
 * @property {string} layoutName `BRAIN_LAYOUT_NAME` when the table was built
 * @property {string} rulesHash the `rulesHash` of the config it was built under
 * @property {number} rawInputCount values per `inputs` row (`rayCount x RAY_CHANNELS + EXTRA_INPUTS`)
 * @property {number} rayCount values per `rayHue` row
 * @property {number} trials trials drawn
 * @property {number} view the ray length of the body the rows are of (vision gene 0)
 * @property {{trial: number, staging: import('./reflex-stage.js').Staging}[]} sequences every sequence, in trial order
 * @property {Float32Array} rows `sequences.length x SEQUENCE_TICKS x rawInputCount` values, sequence-major
 * @property {Float32Array} hues `sequences.length x SEQUENCE_TICKS x rayCount` values, sequence-major
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
 * @param {import('./pool-discrimination-stage.js').Stage} stage a staged tick
 * @param {Record<string, any>} config the config overrides the arena is built from
 * @returns {{inputs: Float32Array, hue: Float32Array}} the subject's (slot 0) raw `inputs` row and `rayHue` row for
 *   that tick, as `sense` writes them
 */
function senseTick(stage, config) {
    const agents = /** @type {any} */ (withGenes(stage.agents, config));
    const { world } = stageWorld({ ...stage, agents, config: arenaConfig(config) });
    buildHash(world.hash, world);
    senseAll(world, world.hash);
    return {
        inputs: world.inputs.slice(0, world.layout.rawInputCount),
        hue: world.rayHue.slice(0, world.config.rayCount),
    };
}

/**
 * Senses a staging's distinct ticks (a static staging has one) and writes all `SEQUENCE_TICKS` rows.
 * @param {import('./reflex-stage.js').Staging} staging the staging
 * @param {{config: Record<string, any>, seed: number}} run the config overrides and the world seed
 * @param {{rows: Float32Array, hues: Float32Array, raw: number, rays: number, sequence: number}} into the table's
 *   arrays, the row widths and the staging's index
 * @returns {void}
 */
function writeSequence(staging, { config, seed }, { rows, hues, raw, rays, sequence }) {
    const ticks = staging.ticks.map((tick) => senseTick({ ...tick, seed }, config));
    for (let t = 0; t < SEQUENCE_TICKS; t++) {
        const tick = ticks[Math.min(t, ticks.length - 1)];
        rows.set(tick.inputs, (sequence * SEQUENCE_TICKS + t) * raw);
        hues.set(tick.hue, (sequence * SEQUENCE_TICKS + t) * rays);
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
    const rows = new Float32Array(sequences.length * SEQUENCE_TICKS * raw);
    const hues = new Float32Array(sequences.length * SEQUENCE_TICKS * rays);
    sequences.forEach(({ staging }, sequence) =>
        writeSequence(staging, { config, seed }, { rows, hues, raw, rays, sequence }),
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
        hues,
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
