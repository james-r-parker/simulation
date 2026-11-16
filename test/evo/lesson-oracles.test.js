import { describe, expect, it } from 'vitest';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { DRILLS } from '../../js/evo/drill-scenarios.js';
import { ORACLE_DRILLS, oracleSubject } from '../../js/evo/lesson-oracles.js';
import { stageWorld } from '../../js/evo/pool-discrimination-stage.js';

/**
 * @param {{foods?: {x: number, y: number}[], agents?: Record<string, any>[], rocks?: {x: number, y: number, r: number}[]}} scene the staged
 *   food, agents and rocks
 * @returns {Record<string, any>} a staged world, the subject (a forager facing +x) in slot 0
 */
function scene({ foods = [], agents = [], rocks = [] }) {
    return stageWorld({
        foods,
        rocks,
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

/**
 * @param {Float32Array} out an output row
 * @returns {boolean} whether it neither moves, sprints nor bites
 */
const idle = (out) =>
    [OUTPUT_INDEX.THRUST, OUTPUT_INDEX.TURN, OUTPUT_INDEX.SPRINT, OUTPUT_INDEX.BITE].every((o) => out[o] === 0);

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

    it('plays prey-crossing as prey-ahead and hunter-flank as hunter-closing', () => {
        const prey = { role: 'prey', x: 1700, y: 2100, angle: 2, spec: 0, energy: 800 };
        const strike = act('prey-crossing', scene({ agents: [prey] }));
        expect(strike[OUTPUT_INDEX.SPRINT]).toBeGreaterThan(0);
        expect(strike[OUTPUT_INDEX.BITE]).toBeGreaterThan(0);
        const hunter = { role: 'hunter', x: 1700, y: 2050, angle: Math.PI, spec: 1, energy: 1500 };
        const run = act('hunter-flank', scene({ agents: [hunter] }));
        expect([run[OUTPUT_INDEX.THRUST], run[OUTPUT_INDEX.SPRINT]]).toEqual([1, 1]);
    });

    it('chases the prey in kin-spared but bites only when it is touching, so a sibling in the jaws is spared', () => {
        const at = (/** @type {number} */ x) => ({ role: 'prey', x, y: 2000, angle: 0, spec: 0, energy: 800 });
        const far = act('kin-spared', scene({ agents: [at(1700)] }));
        expect(far[OUTPUT_INDEX.SPRINT]).toBeGreaterThan(0);
        expect(far[OUTPUT_INDEX.BITE]).toBe(0);
        expect(act('kin-spared', scene({ agents: [at(1540)] }))[OUTPUT_INDEX.BITE]).toBe(1);
    });

    it('sends every hunter of a pack at the first forager in pack-converge, and nobody when it is gone', () => {
        const hunter = { role: 'subject', x: 1500, y: 1920, angle: 0, spec: 1, energy: 1500 };
        const prey = { role: 'prey', x: 1800, y: 2000, angle: 0, spec: 0, energy: 2000 };
        const world = scene({ agents: [hunter, prey] });
        world.spec[0] = 1;
        const first = act('pack-converge', world);
        expect([first[OUTPUT_INDEX.SPRINT], first[OUTPUT_INDEX.BITE]]).toEqual([1, 1]);
        expect(world.outputs[OUTPUT_COUNT + OUTPUT_INDEX.SPRINT]).toBe(1);
        expect(world.outputs[OUTPUT_COUNT + OUTPUT_INDEX.TURN]).toBeGreaterThan(0);
        expect(world.outputs[2 * OUTPUT_COUNT + OUTPUT_INDEX.BITE]).toBe(0);
        world.alive[2] = 0;
        world.outputs.fill(0);
        oracleSubject('pack-converge').act?.(world);
        expect(world.outputs.every((/** @type {number} */ v) => v === 0)).toBe(true);
    });

    it('does not act for a dead subject', () => {
        const world = scene({ foods: [{ x: 1700, y: 2100 }] });
        world.alive[0] = 0;
        expect(act('food-ahead', world).every((v) => v === 0)).toBe(true);
    });

    it('goes for the nearer of two foods whichever is listed first', () => {
        const far = act(
            'food-ahead',
            scene({
                foods: [
                    { x: 1900, y: 2300 },
                    { x: 1700, y: 2100 },
                ],
            }),
        );
        const near = act(
            'food-ahead',
            scene({
                foods: [
                    { x: 1700, y: 2100 },
                    { x: 1900, y: 2300 },
                ],
            }),
        );
        expect(far[OUTPUT_INDEX.TURN]).toBeCloseTo(near[OUTPUT_INDEX.TURN], 6);
    });

    it('stands still when no food is left, and does not divide by zero for a food on the subject', () => {
        expect(idle(act('food-ahead', scene({})))).toBe(true);
        const onTop = act('food-ahead', scene({ foods: [{ x: 1500, y: 2000 }] }));
        expect(onTop.every((v) => Number.isFinite(v))).toBe(true);
        expect(onTop[OUTPUT_INDEX.BITE]).toBeGreaterThan(0);
    });

    it('runs from the hunter in rock-refuge when there is no ring', () => {
        const hunter = { role: 'hunter', x: 1700, y: 2050, angle: Math.PI, spec: 1, energy: 1500 };
        const out = act('rock-refuge', scene({ agents: [hunter] }));
        expect(out[OUTPUT_INDEX.THRUST]).toBe(1);
    });

    it('sprints for the centre of the ring in rock-refuge and settles once inside', () => {
        const rocks = [
            { x: 1500, y: 2400, r: 20 },
            { x: 1500, y: 2600, r: 20 },
        ];
        const hunter = { role: 'hunter', x: 1200, y: 2000, angle: 0, spec: 1, energy: 1500 };
        const toward = act('rock-refuge', scene({ rocks, agents: [hunter] }));
        expect(toward[OUTPUT_INDEX.THRUST]).toBe(1);
        expect(toward[OUTPUT_INDEX.SPRINT]).toBe(1);
        const inside = scene({ rocks, agents: [hunter] });
        inside.y[0] = 2500;
        expect(idle(act('rock-refuge', inside))).toBe(true);
    });

    it('passes a toxic food on whichever side the straight line misses it', () => {
        const foods = [
            { x: 1700, y: 2000 },
            { x: 1700, y: 1990 },
            { x: 1900, y: 2000 },
        ];
        const below = scene({ foods: [foods[0], foods[2]] });
        const above = scene({ foods: [foods[1], foods[2]] });
        for (const w of [below, above]) {
            w.foodTox[0] = 0.8;
        }
        below.foodY[0] = 2010;
        above.foodY[0] = 1990;
        const turnBelow = act('two-foods', below)[OUTPUT_INDEX.TURN];
        const turnAbove = act('two-foods', above)[OUTPUT_INDEX.TURN];
        expect(Math.sign(turnBelow)).toBe(-Math.sign(turnAbove));
        expect(turnBelow).not.toBe(0);
    });

    it('does not turn in prey-ahead when the prey is dead ahead', () => {
        const prey = { role: 'prey', x: 1700, y: 2000, angle: 0, spec: 0, energy: 800 };
        const out = act('prey-ahead', scene({ agents: [prey] }));
        expect(out[OUTPUT_INDEX.TURN]).toBe(0);
        expect(out[OUTPUT_INDEX.BITE]).toBeGreaterThan(0);
    });
});
