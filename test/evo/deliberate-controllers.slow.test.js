import { describe, expect, it } from 'vitest';
import { computeMetrics } from '../../js/evo/metrics.js';
import {
    SURVIVABLE_PREDATOR_EVERY,
    playMicroWorld,
    runPredatorWorld,
    survivableWorld,
} from './helpers/predator-world.js';

const SHORT = { ticks: 5000, seeds: [1, 2] };
const LONG = { ticks: 20000, seeds: [1, 2, 3] };
const FACTOR = 0.5;

/** @type {Map<string, any>} */
const cache = new Map();

/**
 * Runs one arm pair on one seed once, and shares the metrics between the pairs that use it.
 * @param {{world: string, arms: Record<string, string> | string}} setup the world and arms
 * @param {number} ticks ticks to run
 * @param {number} seed the world seed
 * @returns {Record<string, {value: number | null}>} the run's metrics
 */
function metricsOf(setup, ticks, seed) {
    const key = `${setup.world}|${JSON.stringify(setup.arms)}|${ticks}|${seed}`;
    if (!cache.has(key)) {
        if (setup.world === 'micro') {
            const { world, observer } = playMicroWorld(seed, ticks, /** @type {string} */ (setup.arms));
            cache.set(key, computeMetrics(observer, world));
        } else if (setup.world === 'survivable') {
            const arms = {
                .../** @type {Record<string, string>} */ (setup.arms),
                world: survivableWorld,
                predatorEvery: SURVIVABLE_PREDATOR_EVERY,
            };
            cache.set(key, runPredatorWorld(seed, ticks, {}, /** @type {any} */ (arms)));
        } else {
            cache.set(key, runPredatorWorld(seed, ticks, {}, /** @type {any} */ (setup.arms)));
        }
    }
    return cache.get(key);
}

const micro = (/** @type {string} */ arms) => ({ world: 'micro', arms });
const duel = (/** @type {string} */ predator, /** @type {string} */ prey) => ({
    world: 'predator',
    arms: { predator, prey },
});

/** The survivable-prey duel (`evals/survivable-prey-world.json`, one predator in eight) for the pairs the duel starves. */
const survivable = (/** @type {string} */ predator, /** @type {string} */ prey) => ({
    world: 'survivable',
    arms: { predator, prey },
});

const FORAGE = micro('foodSeeker');
const SITTER = duel('jawSitter', 'foodSeeker');
const HUNT = duel('hunter', 'foodSeeker');
const FLEE = duel('hunter', 'fleer');
const SURVIVE_FLEE = survivable('hunter', 'fleer');

/** The pairs table of `docs/designs/world-balance.md`: metric, chance arm, skill arm, run length, direction. */
const PAIRS = /** @type {const} */ ([
    {
        id: 'D1',
        metric: 'eval.deliberate_food_share',
        chanceName: 'wanderer',
        chance: micro('wanderer'),
        skill: FORAGE,
        run: SHORT,
    },
    {
        id: 'D1',
        metric: 'eval.deliberate_food_share',
        chanceName: 'cruiser',
        chance: micro('cruiser'),
        skill: FORAGE,
        run: SHORT,
    },
    {
        id: 'D1',
        metric: 'eval.deliberate_food_share',
        chanceName: 'random',
        chance: micro('random'),
        skill: FORAGE,
        run: SHORT,
    },
    { id: 'D2', metric: 'eval.pursuit_bite_share', chanceName: 'jawSitter', chance: SITTER, skill: HUNT, run: SHORT },
    { id: 'D3', metric: 'eval.pack_convergence', chanceName: 'jawSitter', chance: SITTER, skill: HUNT, run: LONG },
    {
        id: 'D4',
        metric: 'eval.evasion_skill',
        chanceName: 'foodSeeker prey',
        chance: survivable('hunter', 'foodSeeker'),
        skill: SURVIVE_FLEE,
        run: SHORT,
    },
    {
        id: 'D6',
        metric: 'eval.alarm_precision',
        chanceName: 'alarmSpammer',
        chance: duel('hunter', 'alarmSpammer'),
        skill: FLEE,
        run: SHORT,
    },
    {
        id: 'D6',
        metric: 'eval.hunt_call_precision',
        chanceName: 'huntCallSpammer',
        chance: duel('huntCallSpammer', 'foodSeeker'),
        skill: HUNT,
        run: SHORT,
    },
    {
        id: 'D7',
        metric: 'eval.smoke_precision',
        chanceName: 'smokeSpammer',
        chance: duel('hunter', 'smokeSpammer'),
        skill: FLEE,
        run: SHORT,
    },
    {
        id: 'D8',
        metric: 'eval.undefended_bite_share',
        chanceName: 'foodSeeker prey',
        chance: HUNT,
        skill: FLEE,
        run: SHORT,
    },
]);

const LOWER = new Set(['eval.undefended_bite_share']);
/** Difference metrics: the chance value is clamped at 0 and the skill value must be above 0. */
const DIFFERENCE = new Set(['eval.group_cohesion_under_threat', 'eval.alarm_precision', 'eval.hunt_call_precision']);

/**
 * Applies the pairs-table rule to one seed's values.
 * @param {string} metric the metric name
 * @param {number | null} chance the chance arm's value
 * @param {number | null} skill the skill arm's value
 * @returns {boolean} whether the pair holds
 */
function holds(metric, chance, skill) {
    if (skill === null) {
        return false;
    }
    let c = chance ?? 0;
    if (DIFFERENCE.has(metric)) {
        c = Math.max(0, c);
        if (skill <= 0) {
            return false;
        }
    }
    return LOWER.has(metric) ? skill <= FACTOR * c : c <= FACTOR * skill;
}

describe('chance-or-waste controllers score below skill on the intent metrics', () => {
    it('applies the table rules', () => {
        expect(holds('eval.x', null, 0.4)).toBe(true);
        expect(holds('eval.x', 0.3, 0.4)).toBe(false);
        expect(holds('eval.x', 0.1, null)).toBe(false);
        expect(holds('eval.undefended_bite_share', 0.8, 0.4)).toBe(true);
        expect(holds('eval.undefended_bite_share', 0.5, 0.4)).toBe(false);
        expect(holds('eval.alarm_precision', -0.2, 0.1)).toBe(true);
        expect(holds('eval.hunt_call_precision', -0.2, 0)).toBe(false);
    });

    describe.each(PAIRS.map((pair) => ({ ...pair, name: `${pair.id} ${pair.metric}` })))(
        '$name',
        ({ metric, chanceName, chance: chanceSetup, skill: skillSetup, run: { ticks, seeds } }) => {
            it.each(seeds)(
                `${chanceName} vs skill on seed %i`,
                (seed) => {
                    const chance = metricsOf(chanceSetup, ticks, seed)[metric].value;
                    const skill = metricsOf(skillSetup, ticks, seed)[metric].value;
                    expect({ chance, skill, holds: holds(metric, chance, skill) }).toMatchObject({ holds: true });
                },
                120_000,
            );
        },
    );
});
