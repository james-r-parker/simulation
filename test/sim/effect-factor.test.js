import { describe, expect, it } from 'vitest';
import { ruleFactor } from '../../js/sim/effect-factor.js';
import { LANE_ID, LEVEL, NUMBER, compileRef } from '../../js/sim/effect-refs.js';
import { smallWorld } from './helpers/small-world.js';

/**
 * @param {Record<string, any>} over fields of the rule
 * @returns {any} a rule with no table, no `by` lane and no power
 */
const rule = (over) => ({ effect: 0, per: null, levels: null, by: -1, power: false, ...over });

/**
 * @param {any} world the world
 * @param {any} r the rule
 * @param {number} level the level
 * @returns {number} the factor `ruleFactor` leaves
 */
function factor(world, r, level) {
    LEVEL[0] = level;
    ruleFactor(world, 0, r);
    return NUMBER[0];
}

describe('ruleFactor', () => {
    const world = smallWorld({ maxAgents: 4 });
    world.effectConfig = Float64Array.of(0.5);

    it('gives 1 + perStack x level, never below 0', () => {
        expect(factor(world, rule({ per: compileRef(-0.25, []) }), 2)).toBe(0.5);
        expect(factor(world, rule({ per: compileRef(-0.75, []) }), 2)).toBe(0);
        expect(factor(world, rule({ per: compileRef('someKey', []) }), 3)).toBe(2.5);
    });

    it('multiplies perStack by the `by` lane of the body', () => {
        world.laneArrays[LANE_ID.maxTurn][0] = 4;
        expect(factor(world, rule({ per: compileRef(0.25, []), by: LANE_ID.maxTurn }), 1)).toBe(2);
    });

    it('raises perStack to the level for a power rule', () => {
        expect(factor(world, rule({ per: compileRef(1.5, []), power: true }), 3)).toBe(1.5 * 1.5 * 1.5);
    });

    it('reads the table entry of the level', () => {
        const levels = [compileRef(1, []), compileRef(0.7, []), compileRef(0.4, [])];
        expect(factor(world, rule({ levels }), 2)).toBe(0.4);
    });
});
