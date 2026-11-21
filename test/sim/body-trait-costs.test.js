// The paired cost keys (body-genes T13): each prices its trait through a lane, a no-op at its default exponent of 0,
// and at an exponent above 0 moves that lane by `r^(sign x k)`, which the lane's reader then sees.

import { describe, expect, it } from 'vitest';
import { laneTable } from '../../js/sim/body-lanes.js';
import { TRAITS, traitRatio } from '../../js/sim/body-traits.js';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { createConfig } from '../../js/sim/config.js';
import { applyCosts } from '../../js/sim/energy.js';
import { actAll } from '../../js/sim/physics.js';
import { applyGenes } from '../../js/sim/traits.js';
import { setGene, setSpan, traitWorld } from './helpers/trait-world.js';

const trait = (/** @type {string} */ name) => /** @type {any} */ (TRAITS.find((candidate) => candidate.name === name));

/** Each cost key: its trait, the span used, the lane it prices and the sign of its exponent. */
/** @type {Array<[string, string, number, string, number]>} */
const COSTS = [
    ['sizeTurn', 'size', 0.3, 'maxTurn', -1],
    ['speedHeat', 'speed', 0.2, 'temperatureGainMove', 1],
    ['sprintStoreHeat', 'sprintStore', 0.3, 'sprintHeat', 1],
    ['fatSlow', 'fat', 0.3, 'fatSlowShare', 1],
    ['burnThrust', 'burn', 0.2, 'maxThrust', 1],
    ['smokeSightRange', 'smokeSight', 0.3, 'visionRange', -1],
];

/**
 * A world whose slot carries a planted gene of 1 for `name` at `span`, with the cost key at `k` and the lanes that
 * default to 0 given a base to scale.
 * @param {string} name the trait
 * @param {number} span its span
 * @param {Record<string, number>} over config overrides
 * @returns {{world: Record<string, any>, slot: number}} the world and its slot, lanes rebuilt
 */
function planted(name, span, over) {
    const { world, slot } = traitWorld();
    const config = createConfig({ ...world.config, sprintHeat: 0.1, fatSlowShare: 0.2, ...over });
    const w = /** @type {Record<string, any>} */ ({ ...world, config, laneBases: laneTable(config) });
    setSpan(w, slot, trait(name).index, span);
    setGene(w, slot, trait(name).index, 1);
    applyGenes(w, slot);
    return { world: w, slot };
}

describe.each(COSTS)('%s', (key, name, span, lane, sign) => {
    it('is 0 by default, so a planted gene leaves its lane at the base', () => {
        expect(createConfig()[key]).toBe(0);
        const base = planted(name, 0, {});
        const gene = planted(name, span, {});
        const r = traitRatio(trait(name), 1, span);
        const power = trait(name).effects.find((/** @type {any} */ e) => e.lane === lane)?.power ?? 0;
        expect(gene.world.lanes[lane][gene.slot]).toBeCloseTo(base.world.lanes[lane][base.slot] * r ** power, 12);
    });

    it('multiplies its lane by r^(sign x k) above 0', () => {
        const free = planted(name, span, {});
        const priced = planted(name, span, { [key]: 2 });
        const r = traitRatio(trait(name), 1, span);
        expect(priced.world.lanes[lane][priced.slot]).toBeCloseTo(
            free.world.lanes[lane][free.slot] * r ** (sign * 2),
            9,
        );
    });
});

describe('the readers see a cost', () => {
    it('a large body turns slower with sizeTurn, and a hard-burning one thrusts harder with burnThrust', () => {
        /** @param {Record<string, number>} over @returns {{turn: number, thrust: number}} */
        const act = (over) => {
            const big = planted('size', 0.3, over);
            const { world, slot } = big;
            setSpan(world, slot, trait('burn').index, 0.2);
            setGene(world, slot, trait('burn').index, 1);
            applyGenes(world, slot);
            world.outputs.fill(0, slot * OUTPUT_COUNT, (slot + 1) * OUTPUT_COUNT);
            world.outputs[slot * OUTPUT_COUNT + OUTPUT_INDEX.TURN] = 1;
            world.outputs[slot * OUTPUT_COUNT + OUTPUT_INDEX.THRUST] = 1;
            world.vx[slot] = 0;
            world.vy[slot] = 0;
            world.angle[slot] = 0;
            actAll(world);
            return { turn: world.turnRate[slot], thrust: Math.hypot(world.vx[slot], world.vy[slot]) };
        };
        const free = act({});
        const priced = act({ sizeTurn: 1, burnThrust: 1 });
        expect(priced.turn).toBeLessThan(free.turn);
        expect(priced.thrust).toBeGreaterThan(free.thrust);
    });
});

describe('the standing loss of hearing and nose (body-genes T46)', () => {
    /**
     * @param {string} name the trait, `hearing` or `nose`
     * @param {number} gene its planted gene
     * @param {Record<string, number>} over config overrides
     * @returns {number} the energy a 100-energy slot has lost after one cost tick
     */
    const lost = (name, gene, over) => {
        const { world, slot } = traitWorld();
        const config = createConfig({ ...world.config, ...over });
        const w = /** @type {Record<string, any>} */ ({ ...world, config, laneBases: laneTable(config) });
        setSpan(w, slot, trait(name).index, 0.3);
        setGene(w, slot, trait(name).index, gene);
        applyGenes(w, slot);
        w.alive[slot] = 1;
        w.energy[slot] = 100;
        w.size[slot] = 20;
        applyCosts(/** @type {any} */ (w));
        return 100 - w.energy[slot];
    };

    describe.each([
        ['hearingCost', 'hearing'],
        ['noseCost', 'nose'],
    ])('%s', (key, name) => {
        it('is 0 by default, so a longer ear or nose costs nothing extra', () => {
            expect(createConfig()[key]).toBe(0);
            expect(lost(name, 40, {})).toBe(lost(name, 0, {}));
        });

        it('charges passiveLoss x key x (ratio - 1) above ratio 1 only', () => {
            const config = createConfig();
            const extra = lost(name, 40, { [key]: 2 }) - lost(name, 0, { [key]: 2 });
            expect(extra).toBeCloseTo(config.passiveLoss * 2 * 0.3 * Math.tanh(40), 9);
            expect(lost(name, -40, { [key]: 2 })).toBe(lost(name, 0, { [key]: 2 }));
        });
    });
});
