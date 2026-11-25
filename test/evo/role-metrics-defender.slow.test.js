// Gate 2 of fair-chase.md, "Before any training": the defender's metrics against the planted defence of role-budget.md Phase 2
// (docs/designs/metric-noise.md, Phase 6, T21 and T22). The scene is the trio of `role-scenes-defence.js` (a hunter creeping up
// on a standing caller, the caller's alarm, the defender running at the hunter) played under the eval observer, in the slow
// world with the shove on that the Phase 2 shove arm reads (`defenderRepelEnergy` 40, `defenderRepelImpulse` 4). The shoves
// are counted from the world by the scene's own rule, never by the metrics.

import { describe, expect, it } from 'vitest';
import { scaleTimeout } from '../../scripts/lib/test-timeout.mjs';
import { preStep5Arena } from '../helpers/pre-step5.js';
import { ROLE_METRICS } from '../../js/evo/metric-registry/roles.js';
import { playBiteChoice, playDefenceObserved } from './helpers/role-scene-defence.js';

/** The slow world of the Phase 2 shove arm: the defender arrives before the kill. */
const SHOVE_ON = {
    maxVelocity: 4.5,
    defenderRepelEnergy: 40,
    defenderRepelImpulse: 4,
    defenderRepelCost: 2,
    specialisations: { predator: { sprintBoost: 0.5 } },
};
const SHOVE_OFF = { ...SHOVE_ON, defenderRepelEnergy: 0, defenderRepelImpulse: 0 };
/** A defender that arrives while the hunter is on the caller, and a hunter that lets go once shoved. */
const LATE = { side: 40, defenderReaction: 14, ticks: 800 };
const SHOVES = 'eval.defender_repel_per_1k';
const BREAK = 'eval.defender_bite_break_share';
const RATIO = 'eval.hunter_defender_bite_ratio';
const timeout = scaleTimeout(60_000);

describe('the defender metrics against a planted defence', { timeout }, () => {
    const armed = playDefenceObserved(preStep5Arena(SHOVE_ON), { side: 40 });
    const disarmed = playDefenceObserved(preStep5Arena(SHOVE_OFF), { side: 40 });
    const absent = playDefenceObserved(preStep5Arena(SHOVE_ON), { side: null });

    it('plants shoves in one scene and none in the others', () => {
        expect(armed.shoveTicks.length).toBeGreaterThan(0);
        expect(armed.firstShoveAt).toBeGreaterThan(0);
        expect(disarmed.shoveTicks).toEqual([]);
        expect(absent.shoveTicks).toEqual([]);
    });

    it('defender_repel_per_1k is the shoves landed per 1000 defender-ticks played', () => {
        expect(armed.metrics[SHOVES].value).toBeCloseTo((1000 * armed.shoveTicks.length) / armed.defenderTicks, 6);
    });

    it('defender_repel_per_1k reads the shoves the hunter felt: its velocity jumps by the impulse at each, and at no other tick', () => {
        // independent of `world.contacts`: only a shove moves the hunter that fast along the defender-to-hunter line
        const felt = armed.kickTicks
            .filter(({ speed }) => speed > SHOVE_ON.defenderRepelImpulse * 0.75)
            .map(({ tick }) => tick);
        expect(felt.length).toBeGreaterThan(0);
        expect(felt).toEqual(armed.shoveTicks);
        expect(armed.metrics[SHOVES].value).toBeCloseTo((1000 * felt.length) / armed.defenderTicks, 6);
        expect(Math.max(...disarmed.kickTicks.map(({ speed }) => speed))).toBeLessThan(
            SHOVE_ON.defenderRepelImpulse * 0.75,
        );
    });

    it('defender_repel_per_1k reads 0 with the shove off and with no defender in reach', () => {
        expect(disarmed.metrics[SHOVES].value).toBe(0);
        expect(absent.metrics[SHOVES].value).toBe(0);
    });

    it('defender_bite_break_share reads 1 when the hunter lets go after a shove, and 0 when it lets go with no shove', () => {
        const broken = playDefenceObserved(preStep5Arena(SHOVE_ON), { ...LATE, letGo: true });
        const quiet = playDefenceObserved(preStep5Arena(SHOVE_OFF), { ...LATE, letGo: broken.firstShoveAt });
        expect(broken.shoveTicks.length).toBeGreaterThan(0);
        expect(broken.metrics['eval.escape_share'].value).toBe(1);
        expect(broken.metrics[BREAK].value).toBe(1);
        expect(quiet.shoveTicks).toEqual([]);
        expect(quiet.metrics['eval.escape_share'].value).toBe(1);
        expect(quiet.metrics[BREAK].value).toBe(0);
    });

    it('defender_bite_break_share reads 0 when the caller dies in spite of the shove', () => {
        expect(armed.killTick).not.toBeNull();
        expect(armed.shoveTicks.length).toBeGreaterThan(0);
        expect(armed.metrics[BREAK].value).toBe(0);
    });

    it('defender_bite_break_share has no episode to read when the hunter never bites', () => {
        const far = playDefenceObserved(preStep5Arena(SHOVE_ON), { side: 40, ticks: 20 });
        expect(far.metrics[BREAK].value).toBeNull();
    });

    it('hunter_defender_bite_ratio reads 0 when the hunter bites the forager and never the defender in its view', () => {
        const { metrics, samples } = playBiteChoice({ ahead: ['forager'], ticks: 200 });
        expect(samples.defender).toBeGreaterThan(0);
        expect(metrics[RATIO].value).toBe(0);
    });

    it('hunter_defender_bite_ratio is the defender bites per defender exposure over the others, when both are bitten', () => {
        const { metrics, samples } = playBiteChoice({ ahead: ['forager', 'defender'], ticks: 200 });
        // one bite start on each, so the ratio is the foragers' exposure over the defenders'
        expect(metrics[RATIO].value).toBeCloseTo(samples.forager / samples.defender, 9);
    });

    it('hunter_defender_bite_ratio has no ratio when the hunter bites only the defender', () => {
        const { metrics } = playBiteChoice({ ahead: ['defender'], ticks: 200 });
        expect(metrics[RATIO].value).toBeNull();
    });

    it('reads every defender metric of the role table', () => {
        for (const name of ROLE_METRICS.defender) {
            expect(Object.hasOwn(armed.metrics, name)).toBe(true);
        }
    });
});
