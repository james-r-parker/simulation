import { describe, expect, it } from 'vitest';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { DRILLS } from '../../js/evo/drill-scenarios.js';
import { ORACLE_DRILLS, oracleSubject } from '../../js/evo/lesson-oracles.js';
import { stageWorld } from '../../js/evo/pool-discrimination-stage.js';

/**
 * @param {{foods?: {x: number, y: number}[], agents?: Record<string, any>[]}} scene the staged food and agents
 * @returns {Record<string, any>} a staged world, the subject (a forager facing +x) in slot 0
 */
function scene({ foods = [], agents = [] }) {
    return stageWorld({
        foods,
        rocks: [],
        agents: /** @type {any} */ ([{ role: 'subject', x: 1500, y: 2000, angle: 0, spec: 0, energy: 800 }, ...agents]),
        seed: 1,
    }).world;
}

/**
 * @param {string} drill the drill
 * @param {Record<string, any>} world the world
 * @returns {Float32Array} the subject's outputs after the oracle acted
 */
function act(drill, world) {
    oracleSubject(drill).act?.(world);
    return world.outputs.slice(0, OUTPUT_COUNT);
}

describe('oracleSubject', () => {
    it('has an oracle for every drill and rejects other names', () => {
        expect(ORACLE_DRILLS).toEqual(DRILLS.map((d) => d.name));
        expect(() => oracleSubject('lucky')).toThrow(/oracle: expected one of food-ahead/);
    });

    it('is a scripted subject that takes the scenario specialisation', () => {
        expect(oracleSubject('food-ahead')).toMatchObject({ spec: null, weights: null, name: 'oracle:food-ahead' });
    });

    it('turns towards the food on either side and bites', () => {
        const left = act('food-ahead', scene({ foods: [{ x: 1700, y: 2100 }] }));
        const right = act('food-ahead', scene({ foods: [{ x: 1700, y: 1900 }] }));
        expect(left[OUTPUT_INDEX.TURN]).toBeGreaterThan(0);
        expect(right[OUTPUT_INDEX.TURN]).toBeLessThan(0);
        expect(left[OUTPUT_INDEX.BITE]).toBeGreaterThan(0);
    });

    it('goes for the safe food of two-foods, round the toxic one that sits on the way', () => {
        const world = scene({
            foods: [
                { x: 1700, y: 2000 },
                { x: 1900, y: 2000 },
            ],
        });
        world.foodTox[0] = 0.8;
        const turn = act('two-foods', world)[OUTPUT_INDEX.TURN];
        expect(Math.abs(turn)).toBeGreaterThan(0);
        world.foodTox[0] = 0;
        world.foodTox[1] = 0.8;
        expect(Math.abs(act('two-foods', world)[OUTPUT_INDEX.TURN])).toBe(0);
    });

    it('stands still in prey-too-big and does not bite', () => {
        const prey = { role: 'prey', x: 1600, y: 2000, angle: 0, spec: 0, energy: 800 };
        const out = act('prey-too-big', scene({ agents: [prey] }));
        expect(out[OUTPUT_INDEX.THRUST]).toBe(0);
        expect(out[OUTPUT_INDEX.BITE]).toBe(0);
    });

    it('sprints and bites after the prey in prey-ahead', () => {
        const prey = { role: 'prey', x: 1700, y: 2100, angle: 0, spec: 0, energy: 800 };
        const out = act('prey-ahead', scene({ agents: [prey] }));
        expect(out[OUTPUT_INDEX.SPRINT]).toBeGreaterThan(0);
        expect(out[OUTPUT_INDEX.BITE]).toBeGreaterThan(0);
        expect(out[OUTPUT_INDEX.TURN]).toBeGreaterThan(0);
    });

    it('runs from the hunter in hunter-closing, away from the side it stands on', () => {
        const hunter = { role: 'hunter', x: 1700, y: 2050, angle: Math.PI, spec: 1, energy: 1500 };
        const out = act('hunter-closing', scene({ agents: [hunter] }));
        expect(out[OUTPUT_INDEX.THRUST]).toBe(1);
        expect(out[OUTPUT_INDEX.SPRINT]).toBe(1);
    });

    it('does not act for a dead subject', () => {
        const world = scene({ foods: [{ x: 1700, y: 2100 }] });
        world.alive[0] = 0;
        expect(act('food-ahead', world).every((v) => v === 0)).toBe(true);
    });
});
