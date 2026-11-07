import { describe, expect, it } from 'vitest';
import { createInterpolated, interpolateInto } from '../../../js/app/interpolate.js';
import { createEffectsPlayer } from '../../../js/app/renderer/effects-player.js';
import { BREATH_TICKS, playBreaths } from '../../../js/app/renderer/effects-weather.js';
import { makeSnapshot } from '../helpers/snapshots.js';

/** @returns {any} a player whose cold-stress line is 0.3 of the maximum */
function build() {
    return createEffectsPlayer({
        layout: { effectKinds: {}, deathCauses: {} },
        info: { callRadius: 1, callTicks: 1, maxAgents: 8, temperatureMax: 40, temperatureColdStress: 12 },
    });
}

describe('playBreaths', () => {
    it('a cold agent breathes once per period, ahead of its heading; a warm one never', () => {
        const player = build();
        const agents = createInterpolated(8);
        interpolateInto(
            null,
            makeSnapshot(1, [
                { slot: 0, genomeId: 1, x: 10, y: 10, angle: 0, size: 5, temperature: 0.1 },
                { slot: 1, genomeId: 2, temperature: 0.9 },
            ]),
            1,
            agents,
        );
        let total = 0;
        for (let tick = 0; tick < 4 * BREATH_TICKS; tick++) {
            total += playBreaths(player, agents, tick);
        }
        expect(total).toBe(3);
        expect(player.fx.pool.pose[0]).toBeCloseTo(15);
    });
});

describe('playBreaths under the budget', () => {
    it('counts no breath when the weather item is off', () => {
        const player = build();
        player.fx.budget.tier.fill(-1);
        const agents = createInterpolated(8);
        interpolateInto(null, makeSnapshot(1, [{ slot: 0, genomeId: 1, temperature: 0.1 }]), 1, agents);
        let total = 0;
        for (let tick = 0; tick < 3 * BREATH_TICKS; tick++) {
            total += playBreaths(player, agents, tick);
        }
        expect(total).toBe(0);
    });
});
