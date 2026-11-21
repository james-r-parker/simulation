import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';
import { createRng, fork } from '../../js/sim/rng.js';
import { SPEC, SPEC_NAMES } from '../../js/sim/specs.js';
import { arenaConfig } from '../../js/evo/chase-arena.js';
import { layerArena } from '../../js/evo/drill-body-rules.js';
import { LIVING_ROW, MAKE_A_LIVING, hunterReference, livingPlan, reasonOf } from '../../js/evo/drill-role-living.js';
import { ROLE_ARENA } from '../../js/evo/drill-role-staging.js';
import { drillSubject, randomBrains } from '../../js/evo/drill.js';
import { playTrial } from '../../js/evo/memory-probe-run.js';
import { simChase } from '../../js/evo/role-budget-check.js';
import { gapAtAwareness } from '../../js/evo/role-budget-frame.js';
import { roleParams } from '../../js/evo/role-budget-params.js';

/** A hunter that kills each prey and keeps most of what it takes (`predator:living` is ok): bites of 400 and a faster sprint. */
const REACHABLE = { biteEnergy: 400, specialisations: { predator: { sprintBoost: 2.2 } } };
const PREYS = ['forager', 'reproducer', 'scout', 'defender'];

/**
 * @param {Record<string, any>} over config overrides
 * @param {{angle: number, prey: string}} at the plan's heading and prey
 * @returns {{won: boolean, trace: Record<string, any>}} the reference's trial
 */
function play(over, at) {
    const config = layerArena(over, ROLE_ARENA);
    const plan = livingPlan(createConfig(config), at);
    const won = playTrial({ plan, subject: hunterReference(), controlSpec: { name: 'intact' }, seed: 1, config });
    return { won, trace: /** @type {any} */ (plan.trace)(won) };
}

describe('the make-a-living drill', () => {
    it('is the hunter drill of the row predator:living, won by the eat step alone, in the role arena', () => {
        expect(MAKE_A_LIVING).toMatchObject({
            name: 'make-a-living',
            spec: SPEC.PREDATOR,
            row: LIVING_ROW,
            scene: 'A real chase',
            needsHunter: true,
            arena: ROLE_ARENA,
        });
        expect(MAKE_A_LIVING.goals).toBeUndefined();
    });

    it('stages a prey ahead of the hunter at the gap it first sees it, facing away, one of the four preys from the stream', () => {
        const plan = (/** @type {number} */ seed) =>
            MAKE_A_LIVING.plan(fork(createRng(seed), 'drill:make-a-living'), 300, createConfig(ROLE_ARENA));
        const [prey, hunter] = /** @type {any[]} */ (plan(1).stage.agents);
        expect([prey.role, hunter.role]).toEqual(['herd', 'subject']);
        expect(hunter.spec).toBe(SPEC.PREDATOR);
        const a = arenaConfig();
        const gap = gapAtAwareness(roleParams(a, 'predator'), roleParams(a, SPEC_NAMES[prey.spec]));
        expect(Math.hypot(prey.x - hunter.x, prey.y - hunter.y)).toBeCloseTo(gap, 6);
        const seen = new Set(
            Array.from({ length: 16 }, (_, s) => /** @type {any} */ (plan(s + 1).stage.agents[0]).spec),
        );
        expect(seen.size).toBeGreaterThan(1);
        expect(
            [...seen].every((spec) => [SPEC.FORAGER, SPEC.REPRODUCER, SPEC.SCOUT, SPEC.DEFENDER].includes(spec)),
        ).toBe(true);
    });

    it('plays the chase of simChase for the oracle hunter: the same net energy at the kill, turned', () => {
        const a = arenaConfig(REACHABLE);
        for (const prey of ['forager', 'reproducer', 'defender']) {
            const gap = gapAtAwareness(roleParams(a, 'predator'), roleParams(a, prey));
            const sim = simChase(a, { hunter: 'predator', prey, distance: gap, bearing: 0, straight: false });
            const { won, trace } = play(REACHABLE, { angle: 0.7, prey });
            expect(won).toBe(true);
            expect(trace.net).toBeCloseTo(/** @type {number} */ (sim.net), 3);
            expect(trace).toMatchObject({ prey, reason: null });
        }
    });

    it('loses the scout a slower hunter cannot catch, and says it did not kill', () => {
        const { won, trace } = play({ biteEnergy: 400 }, { angle: 0.7, prey: 'scout' });
        expect(won).toBe(false);
        expect(trace).toEqual({ prey: 'scout', net: null, reason: 'no-kill' });
    });

    it('wins nothing at the defaults, where a chase costs more than a kill returns', () => {
        for (const prey of PREYS) {
            expect(play({}, { angle: 0.7, prey }).won).toBe(false);
        }
    });

    it('is lost by a kill that does not pay for the chase, and says so', () => {
        expect(reasonOf(-30)).toBe('did-not-pay');
        expect(reasonOf(null)).toBe('no-kill');
    });

    it('is won by no random brain, and replays from its seed', () => {
        for (const brain of randomBrains(MAKE_A_LIVING, { config: REACHABLE })) {
            expect(drillSubject(MAKE_A_LIVING, brain, { trials: 3, config: REACHABLE }).wins).toBe(0);
        }
        const run = { trials: 4, seed: 5, config: REACHABLE };
        const a = drillSubject(MAKE_A_LIVING, hunterReference(), run);
        expect(drillSubject(MAKE_A_LIVING, hunterReference(), run)).toEqual(a);
        expect(a.wins).toBeGreaterThan(0);
    });

    it('plans without a config from the role arena', () => {
        const plan = MAKE_A_LIVING.plan(fork(createRng(1), 'drill:make-a-living'), 300);
        expect(plan.stage.agents).toHaveLength(2);
    });
});
