// Release cross-play (docs/designs/training-stages.md, Release competence contracts, Opponents and exported populations):
// one predator against opponents of every guild, in juvenile and mature bodies, in open ground, cover, sparse encounters
// and depleted patches, with the outcome and the failed-pursuit cost recorded per condition and each opponent's
// provenance. A report, not a bar: hunters need viable opportunities in the mixed world, and beating every defended prey is
// not a requirement. A detector only: nothing here reaches fitness, merit, mate rank, archive rank or an offer filter.
// Pure: no files, no clock.

import { createConfig } from '../sim/config.js';
import { createRng, fork, nextFloat } from '../sim/rng.js';
import { wilsonInterval } from './binomial.js';
import { CROSS_SEED, CROSS_TRIALS } from './crossplay.js';
import { ringRocks } from './drill-scenarios.js';
import { GENOME_SPECS } from './genome.js';
import { playTrial, viewOf } from './memory-probe-run.js';
import {
    CENTRE_X,
    CENTRE_Y,
    HUNTER_ENERGY,
    PREDATOR_SPEC,
    PREY_VIEW_SHARE,
    around,
    heading,
} from './memory-probe-scenarios.js';

/** The opponent's body: a juvenile is this share of the mature base size (the staged world has no ageing). */
export const JUVENILE_SIZE_SHARE = 0.6;
/** The predator's energy in a depleted patch: the least a staged agent holds (`initialEnergy`), so little is left to spend. */
export const DEPLETED_HUNTER_ENERGY = 800;
/** The share of its view at which a sparse encounter begins: at the edge of sight. */
export const SPARSE_VIEW_SHARE = 0.95;
/** The prey's energy in the other habitats. */
const PREY_ENERGY = 800;
const MAX_TICKS = 900;

export const AGES = Object.freeze(['juvenile', 'mature']);
export const HABITATS = Object.freeze(['open', 'cover', 'sparse', 'depleted']);

/**
 * @typedef {object} Provenance where an opponent came from
 * @property {string} run the run it was trained in (the manifest's git sha, curriculum hash and seed offset, joined)
 * @property {number} seedOffset the training-seed offset of that run
 */

/**
 * @typedef {object} Opponent
 * @property {import('./memory-probe-run.js').Subject} subject the opponent genome (its specialisation is its guild)
 * @property {Provenance} provenance where it came from
 */

/**
 * Whether an opponent counts as independent of a candidate: trained in another run, on another training-seed offset, and
 * in no run the candidate's pool drew from. An opponent that is not independent is still played and reported, but not as
 * independent evidence.
 * @param {Candidate} candidate the candidate's own provenance and the runs its opponent pool drew from
 * @param {Provenance} opponent the opponent's provenance
 * @returns {{independent: boolean, reason: string | null}} the verdict; `reason` says why not
 */
export function independence(candidate, opponent) {
    if (opponent.run === candidate.provenance.run) {
        return { independent: false, reason: "the candidate's own run" };
    }
    if (candidate.poolRuns.includes(opponent.run)) {
        return { independent: false, reason: "in the candidate's training pool" };
    }
    if (opponent.seedOffset === candidate.provenance.seedOffset) {
        return { independent: false, reason: "the candidate's training-seed offset" };
    }
    return { independent: true, reason: null };
}

/**
 * @param {import('../sim/rng.js').Rng} rng the trial's stream
 * @param {number} view the predator's ray length
 * @param {{age: string, habitat: string}} condition the condition
 * @returns {import('./memory-probe-run.js').Plan['stage']} the staged arena: the predator, one opponent and the habitat's rocks
 */
function stageOf(rng, view, { age, habitat }) {
    const angle = heading(rng);
    const share = habitat === 'sparse' ? SPARSE_VIEW_SHARE : PREY_VIEW_SHARE;
    const spread = habitat === 'sparse' ? 1.5 : 0.8;
    const spot = around(angle + (nextFloat(rng) - 0.5) * spread, share * view);
    const depleted = habitat === 'depleted';
    const size = age === 'juvenile' ? JUVENILE_SIZE_SHARE * createConfig({}).baseSize : undefined;
    const hunter = { role: 'subject', x: CENTRE_X, y: CENTRE_Y, angle, spec: PREDATOR_SPEC };
    return {
        foods: [],
        rocks: habitat === 'cover' ? ringRocks(spot) : [],
        agents: [
            { ...hunter, energy: depleted ? DEPLETED_HUNTER_ENERGY : HUNTER_ENERGY },
            {
                role: 'prey',
                ...spot,
                angle: heading(rng),
                spec: 0,
                energy: PREY_ENERGY,
                baseSize: size,
            },
        ],
    };
}

/**
 * Plays one condition's trials: the predator as the subject, the opponent as the prey role, on seeded plans that are the
 * same for every opponent. A kill is the predator's own deliberate kill.
 * @param {import('./memory-probe-run.js').Subject} predator the predator genome
 * @param {import('./memory-probe-run.js').Subject} opponent the opponent genome
 * @param {{age: string, habitat: string, trials?: number, config?: Record<string, any>}} condition the condition, the
 *   trials (default `CROSS_TRIALS`) and the arena's config overrides
 * @returns {{kills: number, trials: number, failedCost: number | null}} the kills, and the mean energy the predator spent
 *   in the trials that did not kill (null when every trial killed)
 */
export function playCondition(predator, opponent, { age, habitat, trials = CROSS_TRIALS, config = {} }) {
    const view = viewOf({ spec: PREDATOR_SPEC, weights: null }, createConfig(config));
    let kills = 0;
    let spent = 0;
    let failed = 0;
    for (let t = 0; t < trials; t++) {
        const seed = CROSS_SEED + t;
        const stage = stageOf(fork(createRng(seed), `crossplay-release:${habitat}:${age}`), view, { age, habitat });
        const start = stage.agents[0].energy;
        let end = start;
        const killed = (/** @type {Record<string, any>} */ w) => w.alive[1] === 0 && w.deliberateKills[0] > 0;
        const plan = {
            stage,
            timing: null,
            scent: false,
            maxTicks: MAX_TICKS,
            done: (/** @type {Record<string, any>} */ w) => {
                end = w.alive[0] === 1 ? w.energy[0] : 0;
                return w.alive[0] === 0 || w.alive[1] === 0;
            },
            won: killed,
        };
        const won = playTrial({
            plan,
            subject: predator,
            controlSpec: { name: 'intact' },
            seed,
            config,
            opponent: { role: 'prey', subject: opponent },
        });
        kills += won ? 1 : 0;
        if (!won) {
            failed += 1;
            spent += start - end;
        }
    }
    return { kills, trials, failedCost: failed === 0 ? null : spent / failed };
}

/**
 * @typedef {object} ReleaseRow one opponent in one condition
 * @property {string} opponent the opponent's name
 * @property {string} guild its specialisation's name
 * @property {string} age `juvenile` or `mature`
 * @property {string} habitat one of `HABITATS`
 * @property {boolean} independent whether the opponent is independent of the candidate (`independence`)
 * @property {string | null} notIndependent why not
 * @property {number} kills trials the predator killed
 * @property {number} trials trials played
 * @property {number | null} failedCost mean energy spent in the trials that did not kill
 */

/**
 * @typedef {object} Candidate the predator's provenance
 * @property {Provenance} provenance the run it was trained in
 * @property {string[]} poolRuns the runs its opponent pool drew from
 */

/**
 * @typedef {object} Release one release matrix
 * @property {Candidate} candidate the candidate's provenance and pool runs
 * @property {Opponent[]} opponents the opponents
 * @property {number} [trials] trials per condition (default `CROSS_TRIALS`)
 * @property {Record<string, any>} [config] the arena's config overrides
 */

/**
 * Plays the predator against every opponent in every age and habitat.
 * @param {import('./memory-probe-run.js').Subject} predator the candidate predator
 * @param {Release} release the candidate, the opponents, the trials and the config
 * @returns {ReleaseRow[]} a row per opponent, age and habitat, opponents in the order given
 */
export function releaseMatrix(predator, { candidate, opponents, trials, config }) {
    return opponents.flatMap((opponent) => {
        const { independent, reason } = independence(candidate, opponent.provenance);
        const guild = GENOME_SPECS[opponent.subject.spec ?? 0];
        return AGES.flatMap((age) =>
            HABITATS.map((habitat) => ({
                opponent: opponent.subject.name,
                guild,
                age,
                habitat,
                independent,
                notIndependent: reason,
                ...playCondition(predator, opponent.subject, { age, habitat, trials, config }),
            })),
        );
    });
}

/**
 * Pools the rows by one or more of `guild`, `age`, `habitat` and `independent`.
 * @param {readonly ReleaseRow[]} rows the release rows
 * @param {readonly ('guild' | 'age' | 'habitat' | 'independent')[]} keys the fields to group by
 * @returns {{key: Record<string, string | boolean>, kills: number, trials: number, killShare: number, low: number, high: number,
 *   failedCost: number | null}[]} one entry per group, in first-seen order: the pooled kill share with its Wilson bounds and
 *   the mean failed-pursuit cost weighted by the trials that failed
 */
export function reportByCondition(rows, keys) {
    /** @type {Map<string, {key: Record<string, any>, kills: number, trials: number, failed: number, spent: number}>} */
    const groups = new Map();
    for (const row of rows) {
        const key = Object.fromEntries(keys.map((k) => [k, row[k]]));
        const id = JSON.stringify(key);
        const group = groups.get(id) ?? { key, kills: 0, trials: 0, failed: 0, spent: 0 };
        const failed = row.trials - row.kills;
        group.kills += row.kills;
        group.trials += row.trials;
        group.failed += failed;
        group.spent += (row.failedCost ?? 0) * failed;
        groups.set(id, group);
    }
    return [...groups.values()].map(({ key, kills, trials, failed, spent }) => {
        const { low, high } = wilsonInterval(kills, trials);
        return {
            key,
            kills,
            trials,
            killShare: kills / trials,
            low,
            high,
            failedCost: failed === 0 ? null : spent / failed,
        };
    });
}
