// Leak against skill (brain-capacity-and-memory.md, Metrics): does a life's mean leak rate go with how well it foraged,
// hunted or fled? At each birth the life's mean `leakRate` is read from its genome row and kept per slot, because the step
// frees a dead agent's slot (zeroing its genome row) before the observer sees the death. At each death at or after
// burn-in that kept leak and three per-life skills go into a log; the three correlations are Pearson's over
// the lives where the skill is defined. A skill is undefined for a life with nothing to measure it on: no food eaten,
// no kill (or a specialisation that cannot hunt), no escaped bite episode. All `watch`.

import { createLog, ensureRoom } from './growable-log.js';
import { leakRateOf } from '../sim/traits.js';
import { none, ok, pearson } from './metrics-stats.js';

/** Lives needed for the forage correlation. */
export const MIN_FORAGE_LIVES = 200;

/** Lives needed for the hunt and flee correlations. */
export const MIN_SKILL_LIVES = 100;

/**
 * @param {number} maxAgents the world's slot count
 * @returns {Record<string, any>} an empty per-life log with columns `leak`, `forage`, `hunt`, `flee` (NaN where the
 *   skill is undefined), the row count, and `birthLeak`, each slot's life leak kept at birth (NaN when unknown)
 */
export function createLeakSkillPools(maxAgents) {
    return {
        log: createLog(['leak', 'forage', 'hunt', 'flee']),
        rows: 0,
        birthLeak: new Float64Array(maxAgents).fill(NaN),
    };
}

/**
 * Keeps a newborn's life leak while its genome row is in the slot. A slot the world has already refilled (its genome id
 * differs: the newborn died within its birth tick) keeps NaN, and that life is skipped at death.
 * @param {Record<string, any>} pools the leak-skill pools
 * @param {Record<string, any>} world the world
 * @param {number} slot the newborn's slot
 * @param {number} genomeId the newborn's genome id
 * @returns {void}
 */
export function noteLeakSkillBirth(pools, world, slot, genomeId) {
    pools.birthLeak[slot] = world.genomeId[slot] === genomeId ? lifeLeak(world, slot) : NaN;
}

/**
 * Forgets a slot's kept leak, for a reused slot.
 * @param {Record<string, any>} pools the leak-skill pools
 * @param {number} slot the slot
 * @returns {void}
 */
export function resetLeakSkillSlot(pools, slot) {
    pools.birthLeak[slot] = NaN;
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
 * Adds a dying life to the log, with the leak kept at its birth. Call for deaths at or after burn-in, before the
 * observer resets the slot. A life with no kept leak is skipped.
 * @param {Record<string, any>} pools the leak-skill pools
 * @param {Record<string, any>} observer the observer
 * @param {number} slot the dying agent's slot
 * @returns {void}
 */
export function noteLeakSkillDeath(pools, observer, slot) {
    const leak = pools.birthLeak[slot];
    if (Number.isNaN(leak)) {
        return;
    }
    const { intent } = observer;
    const { log } = pools;
    ensureRoom(log, pools.rows);
    const row = pools.rows++;
    const hunts = intent.hunterSpec[observer.spec[slot]] === 1;
    log.leak[row] = leak;
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
 * @returns {import('./metrics-stats.js').MetricRecord} the three correlations
 */
export function leakSkillMetrics(observer) {
    const pools = observer.leakSkill;
    return {
        'eval.leak_forage_corr': correlation(pools, 'forage', MIN_FORAGE_LIVES),
        'eval.leak_hunt_corr': correlation(pools, 'hunt', MIN_SKILL_LIVES),
        'eval.leak_flee_corr': correlation(pools, 'flee', MIN_SKILL_LIVES),
    };
}
