import { describe, expect, it } from 'vitest';
import { fitnessV5 } from '../../js/evo/fitness-v5.js';
import { createConfig } from '../../js/sim/config.js';

const config = createConfig();
const GRID = 72 * 41;
const FIELDS = [
    'ageTicks',
    'foodEnergy',
    'children',
    'childrenFromSplit',
    'kills',
    'cellsVisited',
    'collisions',
    'distance',
    'turnsTowardsFood',
];

/**
 * @param {Record<string, number>} values counters for slot 0
 * @param {string} specName
 * @returns {Record<string, any>} a fake observer
 */
function fake(values, specName = 'forager') {
    /** @type {Record<string, any>} */
    const observer = { spec: new Uint8Array([config.specialisations[specName].index]) };
    for (const f of FIELDS) {
        observer[f] = new Float64Array([values[f] ?? 0]);
    }
    return observer;
}

describe('fitnessV5', () => {
    it('is 0 for an agent with no counters', () => {
        expect(fitnessV5(fake({}), 0, config)).toBe(0);
    });

    it('scores survival: 5 per second plus 0.5 per collision-free tick above 200', () => {
        // 1200 ticks = 20 s -> 100; collisionFree = 1200 - 2 * 30 = 1140 -> 570; both x 0.3; defender adds 1200 * 0.3 * 2 * 0.4
        const v = fitnessV5(fake({ ageTicks: 1200, collisions: 2 }, 'scout'), 0, config);
        expect(v).toBeCloseTo((100 + 570) * 0.3, 9);
    });

    it('gives no damage-avoidance bonus at 200 collision-free ticks or fewer', () => {
        expect(fitnessV5(fake({ ageTicks: 200 }, 'scout'), 0, config)).toBeCloseTo((200 / 60) * 5 * 0.3, 9);
        expect(fitnessV5(fake({ ageTicks: 1200, collisions: 40 }, 'scout'), 0, config)).toBeCloseTo(20 * 5 * 0.3, 9);
    });

    it('scores action: food, exploration percent, movement and capped navigation', () => {
        const items = 2;
        const v = fitnessV5(
            fake(
                {
                    foodEnergy: items * config.foodEnergy,
                    cellsVisited: GRID / 10,
                    distance: 400,
                    turnsTowardsFood: 500,
                },
                'defender',
            ),
            0,
            config,
        );
        const action = items * 150 + 10 * 200 + 400 * 0.5 + 100 * 8;
        expect(v).toBeCloseTo(action * 0.3, 6);
    });

    it('gives no movement or navigation reward at 100 distance or less', () => {
        const v = fitnessV5(fake({ distance: 100, turnsTowardsFood: 50 }, 'defender'), 0, config);
        expect(v).toBe(0);
    });

    it('scores a predator on kills', () => {
        expect(fitnessV5(fake({ kills: 3 }, 'predator'), 0, config)).toBeCloseTo((3 * 100 * 10 + 3 * 800) * 0.4, 9);
    });

    it('scores a forager on its gathering rate and estimated shouts', () => {
        const v = fitnessV5(fake({ ageTicks: 3600, foodEnergy: 6 * config.foodEnergy }, 'forager'), 0, config);
        const survival = 60 * 5 + (3600 - 0) * 0.5;
        const action = 6 * 150;
        const spec = (6 / 60) * 60 * 100 + 6 * 0.1 * 50;
        expect(v).toBeCloseTo(survival * 0.3 + action * 0.3 + spec * 0.4, 6);
    });

    it('scores a scout on cells visited', () => {
        const v = fitnessV5(fake({ cellsVisited: 100 }, 'scout'), 0, config);
        const action = (100 / GRID) * 100 * 200;
        expect(v).toBeCloseTo(action * 0.3 + (100 * 5 + 100 * 0.05 * 50) * 0.4, 6);
    });

    it('scores a defender on age and kills', () => {
        const v = fitnessV5(fake({ ageTicks: 100, kills: 2 }, 'defender'), 0, config);
        const survival = (100 / 60) * 5;
        expect(v).toBeCloseTo(survival * 0.3 + (100 * 0.3 * 2 + 2 * 250) * 0.4, 6);
    });

    it('scores a reproducer on children', () => {
        const v = fitnessV5(fake({ children: 4 }, 'reproducer'), 0, config);
        expect(v).toBeCloseTo((4 * 300 + 4 * 0.3 * 300) * 0.4, 9);
    });

    it('adds the split bonus of 400 per child from a split for a reproducer only', () => {
        const v = fitnessV5(fake({ children: 3, childrenFromSplit: 2 }, 'reproducer'), 0, config);
        expect(v).toBeCloseTo((3 * 300 + 3 * 0.3 * 300 + 2 * 400) * 0.4, 9);
        expect(fitnessV5(fake({ childrenFromSplit: 2 }, 'predator'), 0, config)).toBe(0);
    });

    it('ignores kills for a reproducer and children for a predator', () => {
        expect(fitnessV5(fake({ kills: 5 }, 'reproducer'), 0, config)).toBe(0);
        expect(fitnessV5(fake({ children: 5 }, 'predator'), 0, config)).toBe(0);
    });

    it('adds no specialisation score for an unknown specialisation', () => {
        const bare = fake({ ageTicks: 1200 });
        const busy = fake({ ageTicks: 1200, children: 3, childrenFromSplit: 2, kills: 4 });
        bare.spec[0] = 99;
        busy.spec[0] = 99;
        expect(fitnessV5(busy, 0, config)).toBe(fitnessV5(bare, 0, config));
    });

    it('reads only the given slot', () => {
        const observer = fake({ children: 1 }, 'reproducer');
        observer.children = new Float64Array([1, 9]);
        observer.spec = new Uint8Array([config.specialisations.reproducer.index, 0]);
        expect(fitnessV5(observer, 0, config)).toBeCloseTo((300 + 90) * 0.4, 9);
    });
});
