// Champion league: champion files, head-to-head games between two champions, and the candidate's Elo.

import { brainLayout } from '../sim/brain-layout.js';
import { createConfig, rulesHash } from '../sim/config.js';
import { createWorld } from '../sim/spawn.js';
import { step } from '../sim/step.js';
import { decodeWeights } from './base64.js';
import { ELO_START, expectedScore, updateElo } from './elo.js';
import { createBaselineV5 } from './policies/baseline-v5.js';

/** Ticks in one league game. */
export const MATCH_TICKS = 50000;
/** Agents in one league game: half from each side. */
export const MATCH_AGENTS = 100;
/** The champion file format version. */
export const CHAMPION_VERSION = 1;

const SPEC_COUNT = 5;

/**
 * @typedef {object} Champion a decoded champion file
 * @property {string} name
 * @property {number} specialisation the specialisation index, 0 to 4, every founder of this champion starts with
 * @property {Float32Array} weights one brain row (`brainLayout(config).weightCount` floats)
 * @property {unknown} [cell] its archive cell, informational
 */

/**
 * @param {Record<string, any>} file the parsed champion file
 * @param {Readonly<Record<string, any>>} config the running config
 * @returns {void}
 * @throws {Error} naming the first field that is wrong
 */
function checkHeader(file, config) {
    if (file === null || typeof file !== 'object') {
        throw new Error('champion: expected a JSON object');
    }
    if (file.version !== CHAMPION_VERSION) {
        throw new Error(`champion.version: expected ${CHAMPION_VERSION}, got ${file.version}`);
    }
    const layout = brainLayout(config);
    const want = { inputCount: layout.inputCount, brainHidden: layout.hidden, outputCount: layout.outputCount };
    for (const [key, value] of Object.entries(want)) {
        if (file.layout?.[key] !== value) {
            throw new Error(`champion.layout.${key}: expected ${value}, got ${file.layout?.[key]}`);
        }
    }
    const hash = rulesHash(config);
    if (file.rulesHash !== hash) {
        throw new Error(`champion.rulesHash: expected ${hash}, got ${file.rulesHash}`);
    }
}

/**
 * Checks a champion file against the running config and decodes it.
 * @param {Record<string, any>} file the parsed champion file
 * @param {Readonly<Record<string, any>>} config the running config
 * @returns {Champion} the champion
 * @throws {Error} naming the field that is wrong: `version`, `layout.*`, `rulesHash`, `name`, `specialisation` or `weights`
 */
export function validateChampion(file, config) {
    checkHeader(file, config);
    if (typeof file.name !== 'string' || file.name === '') {
        throw new Error('champion.name: expected a non-empty string');
    }
    const spec = file.specialisation;
    if (!Number.isInteger(spec) || spec < 0 || spec >= SPEC_COUNT) {
        throw new Error(`champion.specialisation: expected an integer 0 to ${SPEC_COUNT - 1}, got ${spec}`);
    }
    const count = brainLayout(config).weightCount;
    let weights;
    try {
        weights = decodeWeights(file.weights, count);
    } catch (error) {
        throw new Error(`champion.${/** @type {Error} */ (error).message}`, { cause: error });
    }
    return { name: file.name, specialisation: spec, weights, cell: file.cell };
}

/**
 * Builds the brain policy of a game: `a` fills the even slots, `b` the odd ones. Both sides' agents are fresh
 * lineages from the initial spawn, so the slot parity at birth decides the side.
 * @param {Champion} a side A
 * @param {Champion} b side B
 * @returns {import("../sim/spawn.js").Policy & {childBrain: Function}} the policy passed to `createWorld` and `step`
 */
export function matchPolicy(a, b) {
    const { childBrain } = createBaselineV5().brain;
    return {
        initSpec: (/** @type {any} */ _world, /** @type {number} */ slot) => (slot % 2 === 0 ? a : b).specialisation,
        initBrain(/** @type {any} */ world, /** @type {number} */ slot) {
            const count = world.layout.weightCount;
            world.weights.set((slot % 2 === 0 ? a : b).weights, slot * count);
        },
        childBrain,
    };
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} parity 0 for the even slots, 1 for the odd ones
 * @returns {Set<number>} the founders' genome ids (initial agents fill slots in order, so a slot is its parity's side)
 */
function founderIds(world, parity) {
    const ids = new Set();
    for (let slot = parity; slot < world.config.initialAgents; slot += 2) {
        ids.add(world.genomeId[slot]);
    }
    return ids;
}

/**
 * Counts each side's agents alive into `out` (`[a, b]`).
 * @param {Record<string, any>} world the world
 * @param {Set<number>} sideA A's founder genome ids
 * @param {Set<number>} sideB B's founder genome ids
 * @param {Int32Array} out receives the two counts
 * @returns {void}
 */
function countSides(world, sideA, sideB, out) {
    out[0] = 0;
    out[1] = 0;
    for (let slot = 0; slot < world.alive.length; slot++) {
        if (world.alive[slot] === 1) {
            const lineage = world.lineageId[slot];
            out[0] += sideA.has(lineage) ? 1 : 0;
            out[1] += sideB.has(lineage) ? 1 : 0;
        }
    }
}

/**
 * @param {{ aliveA: number, aliveB: number, lastAliveA: number, lastAliveB: number }} end each side's survivors and
 *   the last tick it had any
 * @returns {'a' | 'b' | 'draw'} the side with more agents alive; when both died out, the side that lasted longer;
 *   otherwise a draw
 */
export function decide({ aliveA, aliveB, lastAliveA, lastAliveB }) {
    if (aliveA !== aliveB) {
        return aliveA > aliveB ? 'a' : 'b';
    }
    if (aliveA > 0 || lastAliveA === lastAliveB) {
        return 'draw';
    }
    return lastAliveA > lastAliveB ? 'a' : 'b';
}

/**
 * @typedef {object} MatchResult
 * @property {'a' | 'b' | 'draw'} result the side with more agents alive wins; if both died out, the one that lasted longer
 * @property {number} aliveA agents alive whose lineage is one of A's founders
 * @property {number} aliveB likewise for B
 * @property {number} lastAliveA the last tick A had an agent alive (0 if none after the first step)
 * @property {number} lastAliveB likewise for B
 */

/**
 * Plays one game: 100 agents, A's founders in the even slots and B's in the odd ones, no floor and no immigration.
 * The game stops early once both sides have died out.
 * @param {Champion} a side A
 * @param {Champion} b side B
 * @param {number} seed the world seed
 * @param {{ ticks?: number, config?: Record<string, any> }} [options] `ticks` defaults to 50000; `config` overrides
 *   config keys (tests use a smaller world); the population keys are fixed
 * @returns {MatchResult} the winner and the survivors per side
 */
export function playMatch(a, b, seed, { ticks = MATCH_TICKS, config: overrides = {} } = {}) {
    const config = createConfig({
        ...overrides,
        seed,
        initialAgents: MATCH_AGENTS,
        minAgents: 0,
    });
    const policy = matchPolicy(a, b);
    const world = createWorld(config, policy);
    const sideA = founderIds(world, 0);
    const sideB = founderIds(world, 1);
    const alive = new Int32Array(2);
    countSides(world, sideA, sideB, alive);
    const end = { aliveA: alive[0], aliveB: alive[1], lastAliveA: 0, lastAliveB: 0 };
    for (let t = 0; t < ticks && end.aliveA + end.aliveB > 0; t++) {
        step(world, policy);
        countSides(world, sideA, sideB, alive);
        end.aliveA = alive[0];
        end.aliveB = alive[1];
        end.lastAliveA = alive[0] > 0 ? world.tick : end.lastAliveA;
        end.lastAliveB = alive[1] > 0 ? world.tick : end.lastAliveB;
    }
    return { result: decide(end), ...end };
}

/**
 * @typedef {object} LeagueGame
 * @property {number} seed
 * @property {number} champion index into the champions list of the opponent
 * @property {'a' | 'b' | 'draw'} result `a` is the candidate
 */

/**
 * Replays the games in order, moving only the candidate's rating; the champions keep theirs.
 * @param {readonly { name: string, elo: number }[]} champions the admitted champions
 * @param {readonly LeagueGame[]} games the results in seed-then-list order
 * @returns {{ elo: number, wins: number, draws: number, losses: number, games: number,
 *   log: { seed: number, champion: string, result: string, eloBefore: number, eloAfter: number }[],
 *   metrics: Record<string, { value: number | null, reason?: string }> }} the candidate's standing
 */
export function runLeague(champions, games) {
    let elo = ELO_START;
    let wins = 0;
    let draws = 0;
    const log = [];
    for (const { seed, champion, result } of games) {
        const opponent = champions[champion];
        const score = result === 'a' ? 1 : result === 'draw' ? 0.5 : 0;
        const eloBefore = elo;
        elo = updateElo(elo, expectedScore(elo, opponent.elo), score);
        wins += result === 'a' ? 1 : 0;
        draws += result === 'draw' ? 1 : 0;
        log.push({ seed, champion: opponent.name, result, eloBefore, eloAfter: elo });
    }
    const metrics = {
        'eval.champion_elo': { value: elo },
        'eval.champion_win_rate':
            games.length === 0 ? { value: null, reason: 'no games' } : { value: (wins + 0.5 * draws) / games.length },
    };
    return { elo, wins, draws, losses: games.length - wins - draws, games: games.length, log, metrics };
}
