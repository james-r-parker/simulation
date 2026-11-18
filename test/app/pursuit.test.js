import { describe, expect, it } from 'vitest';
import { createInterpolated } from '../../js/app/interpolate.js';
import {
    createPursuits,
    findPursuits,
    HUNTER_RUN_SHARE,
    MAX_PURSUITS,
    PREY_RUN_SHARE,
    PURSUIT_AWAY,
    PURSUIT_CONE,
    PURSUIT_RANGE,
    pursuitRules,
} from '../../js/app/pursuit.js';

const info = {
    maxVelocity: 10,
    specs: [
        { index: 0, canHunt: false },
        { index: 1, canHunt: true },
    ],
};
const rules = pursuitRules(info);

/**
 * @param {{x: number, y: number, angle: number, size: number, speed: number, spec: number}[]} list agents
 * @returns {ReturnType<typeof createInterpolated>} the frame's agents
 */
function frameOf(list) {
    const a = createInterpolated(Math.max(list.length, 4));
    list.forEach((g, i) => {
        a.x[i] = g.x;
        a.y[i] = g.y;
        a.angle[i] = g.angle;
        a.size[i] = g.size;
        a.speed[i] = g.speed;
        a.spec[i] = g.spec;
    });
    a.count = list.length;
    return a;
}

const hunter = { x: 0, y: 0, angle: 0, size: 10, speed: 8, spec: 1 };
const prey = { x: 200, y: 0, angle: 0, size: 5, speed: 6, spec: 0 };

describe('pursuitRules', () => {
    it('marks the hunter specs and guards a zero speed scale', () => {
        expect(Array.from(rules.canHunt)).toEqual([0, 1]);
        expect(pursuitRules({ specs: [] }).maxVelocity).toBe(1);
    });
});

describe('findPursuits', () => {
    it('pairs a running hunter with the fleeing smaller prey ahead of it', () => {
        const out = findPursuits(frameOf([hunter, prey]), rules, createPursuits());
        expect(out.count).toBe(1);
        expect([out.hunter[0], out.prey[0]]).toEqual([0, 1]);
        expect(out.closeness[0]).toBeCloseTo(1 - 200 / PURSUIT_RANGE, 5);
    });

    it('picks the nearest of two targets', () => {
        const far = { ...prey, x: 350 };
        const out = findPursuits(frameOf([hunter, far, prey]), rules, createPursuits());
        expect(out.prey[0]).toBe(2);
    });

    it.each([
        ['prey that is bigger', { ...prey, size: 12 }],
        ['prey that hunts', { ...prey, spec: 1 }],
        ['prey behind the hunter', { ...prey, x: -200 }],
        ['prey out of range', { ...prey, x: PURSUIT_RANGE + 50 }],
        ['prey that is standing still', { ...prey, speed: 1 }],
        ['prey running at the hunter', { ...prey, angle: Math.PI }],
    ])('does not pair %s', (_name, p) => {
        expect(findPursuits(frameOf([hunter, p]), rules, createPursuits()).count).toBe(0);
    });

    it('ignores a hunter that is not running', () => {
        expect(findPursuits(frameOf([{ ...hunter, speed: 2 }, prey]), rules, createPursuits()).count).toBe(0);
    });

    it('wraps angles across the pi seam', () => {
        const h = { ...hunter, angle: Math.PI - 0.1 };
        const p = { ...prey, x: -200, y: 5, angle: -Math.PI + 0.1 };
        expect(findPursuits(frameOf([h, p]), rules, createPursuits()).count).toBe(1);
    });

    it('clears the table each call and caps the pairs', () => {
        const out = createPursuits();
        findPursuits(frameOf([hunter, prey]), rules, out);
        findPursuits(frameOf([prey]), rules, out);
        expect(out.count).toBe(0);
        const many = [];
        for (let i = 0; i < MAX_PURSUITS + 10; i++) {
            many.push({ ...hunter, y: i * 1000 });
            many.push({ ...prey, y: i * 1000 });
        }
        expect(findPursuits(frameOf(many), rules, out).count).toBe(MAX_PURSUITS);
    });
});

/** @param {number} a @param {number} b @returns {number} the unsigned angle between two headings */
function arcRef(a, b) {
    const d = Math.abs(((((a - b) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
    return d;
}

/**
 * The rule as first written: every running hunter against every agent. The reference the filtered search must match.
 * @param {ReturnType<typeof createInterpolated>} a the frame's agents
 * @returns {number[][]} [hunter, prey] pairs in order
 */
function naivePursuits(a) {
    const pairs = [];
    for (let i = 0; i < a.count && pairs.length < MAX_PURSUITS; i++) {
        if (rules.canHunt[a.spec[i]] !== 1 || a.speed[i] < HUNTER_RUN_SHARE * rules.maxVelocity) {
            continue;
        }
        let best = -1;
        let bestD = Infinity;
        for (let j = 0; j < a.count; j++) {
            const dx = a.x[j] - a.x[i];
            const dy = a.y[j] - a.y[i];
            const d = Math.hypot(dx, dy);
            const bearing = Math.atan2(dy, dx);
            const ok =
                j !== i &&
                a.size[j] < a.size[i] &&
                rules.canHunt[a.spec[j]] !== 1 &&
                d > 0 &&
                d <= PURSUIT_RANGE &&
                arcRef(bearing, a.angle[i]) <= PURSUIT_CONE &&
                a.speed[j] >= PREY_RUN_SHARE * rules.maxVelocity &&
                arcRef(a.angle[j], bearing) <= PURSUIT_AWAY;
            if (ok && d < bestD) {
                best = j;
                bestD = d;
            }
        }
        if (best >= 0) {
            pairs.push([i, best]);
        }
    }
    return pairs;
}

describe('findPursuits against the naive search', () => {
    it('finds the same pairs on crowded random frames', () => {
        let s = 12345;
        const rand = () => (s = (s * 1103515245 + 12345) >>> 0) / 4294967296;
        for (let trial = 0; trial < 20; trial++) {
            const list = Array.from({ length: 400 }, () => ({
                x: rand() * 1500,
                y: rand() * 1500,
                angle: (rand() * 2 - 1) * Math.PI,
                size: 3 + rand() * 10,
                speed: rand() * 10,
                spec: rand() < 0.25 ? 1 : 0,
            }));
            const a = frameOf(list);
            const out = findPursuits(a, rules, createPursuits());
            const got = Array.from({ length: out.count }, (_, k) => [out.hunter[k], out.prey[k]]);
            expect(got).toEqual(naivePursuits(a));
        }
    });
});
