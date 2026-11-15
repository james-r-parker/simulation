// The chase envelope (docs/designs/senses-and-motor.md, Phase 2): a scripted pursuer that knows where its prey is and a
// scripted evader that knows where its pursuer is, played through the sim's own step in an empty arena for each pair of
// specialisations, start distance and bearing. It says whether the bodies as configured allow a chase to be won, and
// whether it can be escaped, with no brain in the loop. Reports only; nothing here is fitness, merit or rank.

import { detCos, detSin } from '../sim/det-math.js';
import { createRng, fork, nextFloat } from '../sim/rng.js';
import { step } from '../sim/step.js';
import { ARENA_CENTRE, arenaConfig, stageArena } from './chase-arena.js';
import { STORE_SHARE } from './chase-body.js';
import { evaderBrain, pursuerBrain } from './chase-oracles.js';

/** The longest a trial runs: 250 ticks at the fastest sprint (14.4) is 3600, inside the 4000 clear of the wall. */
export const MAX_TICKS = 250;
/** Start distances as shares of the pursuer's view. */
export const DISTANCE_SHARES = Object.freeze([0.2, 0.4, 0.6, 0.8, 1]);
/** The catch share band in which skill, not the body, decides the chase. */
export const FAIR_BAND = Object.freeze({ low: 0.2, high: 0.8 });
export const BEARINGS = 8;
export const TRIALS = 4;
/** Jitter of a trial's start, against a perfectly staged one: the bearing, the headings and the distance. */
const BEARING_JITTER = 0.5;
const HEADING_JITTER = 0.4;
const DISTANCE_JITTER = 0.05;

/**
 * @typedef {object} Trial one chase
 * @property {boolean} caught whether the pursuer killed the evader
 * @property {number} ticks the ticks played (the kill's tick when caught)
 * @property {number} spent the pursuer's energy spent on standing, moving, sprinting and bites
 * @property {number} returned the energy the kill and its bites returned to the pursuer
 */

/**
 * @param {import('../sim/rng.js').Rng} rng the trial's stream
 * @returns {number} a draw in [-1, 1)
 */
const signed = (rng) => 2 * nextFloat(rng) - 1;

/**
 * Plays one chase: the pursuer at the arena's centre heading +x, the evader `distance` away at `bearing` from that
 * heading and facing away from it, both at rest, both at half a store, the arena's rules the config's.
 * @param {Readonly<Record<string, any>>} config an `arenaConfig`
 * @param {{pursuer: number, evader: number, distance: number, bearing: number, rng: import('../sim/rng.js').Rng}} start
 *   the two specialisation indices, the start and a stream for the jitter
 * @param {{sprint: boolean, straight: boolean}} play whether both sprint, and whether the evader never breaks
 * @returns {Trial} the outcome
 */
export function playTrial(config, { pursuer, evader, distance, bearing, rng }, { sprint, straight }) {
    const heading = HEADING_JITTER * signed(rng);
    const line = heading + bearing + BEARING_JITTER * signed(rng) * (Math.PI / BEARINGS);
    const gap = distance * (1 + DISTANCE_JITTER * signed(rng));
    const bodies = [
        { spec: pursuer, ...ARENA_CENTRE, angle: heading, energyShare: STORE_SHARE },
        {
            spec: evader,
            x: ARENA_CENTRE.x + gap * detCos(line),
            y: ARENA_CENTRE.y + gap * detSin(line),
            angle: line + HEADING_JITTER * signed(rng),
            energyShare: STORE_SHARE,
        },
    ];
    const { world, policy } = stageArena(config, bodies);
    const hunt = pursuerBrain({ pursuer: 0, evader: 1, sprint });
    const flee = evaderBrain({ pursuer: 0, evader: 1, sprint, jinkRange: straight ? 0 : undefined });
    const brain = (/** @type {Record<string, any>} */ w) => {
        hunt(w);
        flee(w);
    };
    let ticks = 0;
    while (ticks < MAX_TICKS && world.alive[0] === 1 && world.alive[1] === 1) {
        step(world, policy, { brain });
        ticks += 1;
    }
    const spent = world.ledgerStanding[0] + world.ledgerMove[0] + world.ledgerSprint[0] + world.ledgerBiteCost[0];
    return {
        caught: world.alive[1] === 0 && world.alive[0] === 1,
        ticks,
        spent,
        returned: world.ledgerKillEnergy[0] + world.ledgerBiteGain[0],
    };
}

/**
 * @typedef {object} Cell one start distance and bearing
 * @property {number} share the share of its trials the pursuer caught the evader in
 * @property {number} caught trials caught
 * @property {number} trials trials played
 * @property {number} spent the pursuer's energy spent in the caught trials
 * @property {number} returned the energy those kills returned
 */

/**
 * @param {Readonly<Record<string, any>>} config an `arenaConfig`
 * @param {{pursuer: number, evader: number, share: number, bearing: number}} cell the pair, the start distance as a
 *   share of the pursuer's view and the bearing
 * @param {{trials: number, seed: number, sprint: boolean, straight: boolean}} options the trials and the play
 * @returns {Cell} the cell's tally
 */
export function playCell(config, { pursuer, evader, share, bearing }, { trials, seed, sprint, straight }) {
    const view = Object.values(config.specialisations).find((s) => /** @type {any} */ (s).index === pursuer);
    const distance = share * /** @type {any} */ (view).visionRange;
    const rng = fork(createRng(seed), `chase-envelope:${pursuer}:${evader}:${share}:${bearing.toFixed(3)}`);
    const cell = { share: 0, caught: 0, trials, spent: 0, returned: 0 };
    for (let k = 0; k < trials; k++) {
        const t = playTrial(config, { pursuer, evader, distance, bearing, rng }, { sprint, straight });
        if (t.caught) {
            cell.caught += 1;
            cell.spent += t.spent;
            cell.returned += t.returned;
        }
    }
    cell.share = cell.caught / trials;
    return cell;
}

/**
 * @param {readonly number[]} shares the mean catch share at each start distance, in `DISTANCE_SHARES` order
 * @returns {number[]} the start distances (as shares of view) whose catch share lies in `FAIR_BAND`
 */
export function fairBand(shares) {
    return DISTANCE_SHARES.filter((_, d) => shares[d] >= FAIR_BAND.low && shares[d] <= FAIR_BAND.high);
}

/**
 * @typedef {object} PairResult one pursuer and evader pair
 * @property {string} pursuer the pursuer's specialisation name
 * @property {string} evader the evader's
 * @property {Cell[][]} grid `grid[d][b]`, by start distance then bearing
 * @property {number[]} byDistance the mean catch share at each start distance
 * @property {number[]} band the start distances of the fair band, as shares of view
 * @property {{spent: number, returned: number}[]} energy per start distance: mean energy spent and returned per kill
 *   (both 0 where nothing was caught)
 */

/**
 * @param {Readonly<Record<string, any>>} config an `arenaConfig`
 * @param {{pursuer: number, evader: number}} pair the two specialisation indices
 * @param {{trials?: number, seed?: number, sprint?: boolean, straight?: boolean}} [options] the play (4 trials, seed 1,
 *   both sprinting, the evader breaking)
 * @returns {Omit<PairResult, 'pursuer' | 'evader'>} the grid and what is read from it
 */
export function playPair(config, pair, { trials = TRIALS, seed = 1, sprint = true, straight = false } = {}) {
    const bearings = Array.from({ length: BEARINGS }, (_, b) => (2 * Math.PI * b) / BEARINGS - Math.PI);
    const grid = DISTANCE_SHARES.map((share) =>
        bearings.map((bearing) => playCell(config, { ...pair, share, bearing }, { trials, seed, sprint, straight })),
    );
    const byDistance = grid.map((row) => row.reduce((sum, c) => sum + c.share, 0) / row.length);
    const energy = grid.map((row) => {
        const caught = row.reduce((sum, c) => sum + c.caught, 0);
        const total = (/** @type {'spent' | 'returned'} */ k) => row.reduce((sum, c) => sum + c[k], 0);
        return {
            spent: caught === 0 ? 0 : total('spent') / caught,
            returned: caught === 0 ? 0 : total('returned') / caught,
        };
    });
    return { grid, byDistance, band: fairBand(byDistance), energy };
}

/**
 * Plays every hunting specialisation against every specialisation.
 * @param {Readonly<Record<string, any>>} [config] an `arenaConfig`
 * @param {{trials?: number, seed?: number, sprint?: boolean, straight?: boolean, pairs?: [string, string][]}} [options]
 *   the play, and the named pairs to play instead of every hunter against every body
 * @returns {PairResult[]} one result per pair
 */
export function runEnvelope(config = arenaConfig(), options = {}) {
    const specs = Object.entries(config.specialisations);
    const indexOf = (/** @type {string} */ name) => {
        if (!Object.hasOwn(config.specialisations, name)) {
            throw new Error(
                `unknown specialisation "${name}"; known: ${Object.keys(config.specialisations).join(', ')}`,
            );
        }
        return /** @type {any} */ (config.specialisations)[name].index;
    };
    const pairs =
        options.pairs ??
        specs.flatMap(([hunter, h]) =>
            /** @type {any} */ (h).canHunt
                ? specs.map(([prey]) => /** @type {[string, string]} */ ([hunter, prey]))
                : [],
        );
    return pairs.map(([pursuer, evader]) => ({
        pursuer,
        evader,
        ...playPair(config, { pursuer: indexOf(pursuer), evader: indexOf(evader) }, options),
    }));
}
