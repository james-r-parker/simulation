// Leak against skill (brain-capacity-and-memory.md, Metrics): does a life's mean leak rate go with how well it foraged,
// hunted or fled? At each death at or after burn-in the life's mean `leakRate` (from the genome row, since the slot's
// `leakRate` row is already cleared) and three per-life skills go into a log; the three correlations are Pearson's over
// the lives where the skill is defined. A skill is undefined for a life with nothing to measure it on: no food eaten,
// no kill (or a specialisation that cannot hunt), no escaped bite episode. All `watch`.

import { createLog, ensureRoom } from './growable-log.js';
import { leakRateOf } from '../sim/traits.js';
import { none, ok, pearson } from './metrics-stats.js';

/** Lives needed for the forage correlation. */
export const MIN_FORAGE_LIVES = 200;

/** Lives needed for the hunt and flee correlations. */
export const MIN_SKILL_LIVES = 100;

/** The direction of each metric here. */
export const LEAK_SKILL_DIRECTIONS = Object.freeze({
    'eval.leak_forage_corr': 'watch',
    'eval.leak_hunt_corr': 'watch',
    'eval.leak_flee_corr': 'watch',
});

/**
 * @returns {Record<string, any>} an empty per-life log with columns `leak`, `forage`, `hunt`, `flee` (NaN where the
 *   skill is undefined) and the row count
 */
export function createLeakSkillPools() {
    return { log: createLog(['leak', 'forage', 'hunt', 'flee']), rows: 0 };
}

/**
 * @param {number} part the numerator
 * @param {number} whole the denominator
 * @returns {number} the share, NaN when `whole` is 0
 */
const ratio = (part, whole) => (whole > 0 ? part / whole : NaN);

/**
 * @param {Record<string, any>} world the world (its weight row of the slot is the dead agent's)
 * @param {number} slot the slot
 * @returns {number} the mean of `leakRateOf` over the slot's leak genes
 */
export function lifeLeak(world, slot) {
    const { layout, weights, config } = world;
    const genes = slot * layout.weightCount + layout.leakStart;
    let sum = 0;
    for (let j = 0; j < layout.hidden; j++) {
        sum += leakRateOf(weights[genes + j], config.leakMin);
    }
    return sum / layout.hidden;
}

/**
 * Adds a dying life to the log. Call for deaths at or after burn-in, before the slot is reset. A slot the world has
 * already refilled (its genome id differs) has lost its row, so the life is skipped.
 * @param {Record<string, any>} pools the leak-skill pools
 * @param {{observer: Record<string, any>, world: Record<string, any>}} state the observer and the world
 * @param {{slot: number, genomeId: number}} agent the dying agent
 * @returns {void}
 */
export function noteLeakSkillDeath(pools, state, agent) {
    const { observer, world } = state;
    const { slot } = agent;
    if (world.genomeId[slot] !== agent.genomeId) {
        return;
    }
    const { intent } = observer;
    const { log } = pools;
    ensureRoom(log, pools.rows);
    const row = pools.rows++;
    const hunts = intent.hunterSpec[observer.spec[slot]] === 1;
    log.leak[row] = lifeLeak(world, slot);
    log.forage[row] = ratio(intent.deliberateFood[slot], intent.deliberateFood[slot] + intent.chanceFood[slot]);
    log.hunt[row] = hunts ? ratio(intent.deliberateKills[slot], observer.kills[slot]) : NaN;
    log.flee[row] = ratio(intent.respondedEscape[slot], intent.escapedLife[slot]);
}

/**
 * @param {Record<string, any>} pools the leak-skill pools
 * @param {'forage' | 'hunt' | 'flee'} skill the skill column
 * @param {number} minLives the lives needed
 * @returns {import('./metrics-stats.js').MetricResult} Pearson's correlation of leak with the skill
 */
function correlation(pools, skill, minLives) {
    const { log } = pools;
    const leak = [];
    const values = [];
    for (let i = 0; i < pools.rows; i++) {
        if (!Number.isNaN(log[skill][i])) {
            leak.push(log.leak[i]);
            values.push(log[skill][i]);
        }
    }
    if (leak.length < minLives) {
        return none(`fewer than ${minLives} lives with a ${skill} skill`);
    }
    const r = pearson(leak, values);
    return Number.isNaN(r) ? none('no variance in leak or in the skill') : ok(r);
}

/**
 * @param {Record<string, any>} observer the observer
 * @returns {Record<string, import('./metrics-stats.js').MetricResult>} the three correlations
 */
export function leakSkillMetrics(observer) {
    const pools = observer.leakSkill;
    return {
        'eval.leak_forage_corr': correlation(pools, 'forage', MIN_FORAGE_LIVES),
        'eval.leak_hunt_corr': correlation(pools, 'hunt', MIN_SKILL_LIVES),
        'eval.leak_flee_corr': correlation(pools, 'flee', MIN_SKILL_LIVES),
    };
}
