import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';
import { MODEL_DEFAULTS } from '../../js/evo/role-budget-model.js';
import { roleParams } from '../../js/evo/role-budget-params.js';
import {
    HERD_STEPS,
    budgetHerd,
    clearTicks,
    herdNumbers,
    herdTimeline,
    ticksToCover,
    trampleLoss,
} from '../../js/evo/role-budget-herd.js';

const config = createConfig({});
const herd = herdNumbers(config);
const params = (/** @type {string} */ spec) => roleParams(config, spec);

describe('herdNumbers', () => {
    it('reads the ring a herd spawns on: 8 animals of radius 80 on 224.09 px', () => {
        expect(herd.ring).toBeCloseTo(224.09016, 4);
        expect([herd.radius, herd.run, herd.walk, herd.damage, herd.maxVelocity, herd.stampede]).toEqual([
            80, 6.5, 1.5, 400, 8, 360,
        ]);
    });
});

describe('the pulled flag', () => {
    it('is set for a ring wider than 4 herd radii (a herd of 12), and not at the defaults', () => {
        expect(herd.pulled).toBe(false);
        expect(herdNumbers(createConfig({ herdSize: 12 })).pulled).toBe(true);
        const big = createConfig({ herdSize: 12 });
        expect(budgetHerd(big, roleParams(big, 'forager'), MODEL_DEFAULTS).pulled).toBe(true);
    });
});

describe('herdTimeline', () => {
    it('matches a naive loop of the relaxation, capped at the run speed', () => {
        const line = herdTimeline(herd, { ticks: 100 });
        let v = 0;
        let x = 0;
        for (let t = 0; t < 100; t++) {
            v = Math.min(6.5, v + (6.75 - v) * 0.05);
            x += v;
            expect(line.speed[t]).toBeCloseTo(v, 12);
            expect(line.position[t]).toBeCloseTo(x, 9);
        }
    });

    it('reaches the run speed after about 65 ticks, from a standing start or from a walk', () => {
        const line = herdTimeline(herd);
        const at = Array.from(line.speed).findIndex((v) => v >= 6.5) + 1;
        expect(at).toBe(65);
        expect(herdTimeline(herd, { start: 1.5, ticks: 3 }).speed[0]).toBeCloseTo(1.5 + 5.25 * 0.05, 12);
    });
});

describe('ticksToCover', () => {
    it('is the first tick the animal has gone far enough, with its speed then, and extends past the timeline at the last speed', () => {
        const line = herdTimeline(herd, { ticks: 50 });
        const near = ticksToCover(line, 271);
        expect(near.ticks).toBeGreaterThan(50);
        const short = herdTimeline(herd);
        expect(ticksToCover(short, 271)).toEqual({ ticks: 59, speed: short.speed[58] });
        const beyond = ticksToCover(herdTimeline(herd, { ticks: 10 }), 1000);
        expect(beyond.ticks).toBeGreaterThan(10);
        expect(beyond.speed).toBe(herdTimeline(herd, { ticks: 10 }).speed[9]);
    });
});

describe('clearTicks', () => {
    it('clears the half-width of a forager in 53 ticks at cruise and 39 sprinting, a predator in 55 and 36 (the anchors)', () => {
        const half = (/** @type {string} */ s) => herd.ring + herd.radius + params(s).size;
        expect(clearTicks(params('forager'), { distance: half('forager'), sprint: false })).toBe(53);
        expect(clearTicks(params('forager'), { distance: half('forager'), sprint: true })).toBe(39);
        expect(clearTicks(params('predator'), { distance: half('predator'), sprint: false })).toBe(55);
        expect(clearTicks(params('predator'), { distance: half('predator'), sprint: true })).toBe(36);
    });
});

describe('trampleLoss', () => {
    it('is 306.3 at the run speed and 16.3 at the walk speed for a forager, 475.3 and 25.3 for a predator (the anchors)', () => {
        expect(trampleLoss(herd, params('forager'), 6.5)).toBeCloseTo(306.3, 1);
        expect(trampleLoss(herd, params('forager'), 1.5)).toBeCloseTo(16.3, 1);
        expect(trampleLoss(herd, params('predator'), 6.5)).toBeCloseTo(475.3, 1);
        expect(trampleLoss(herd, params('predator'), 1.5)).toBeCloseTo(25.3, 1);
    });

    it('grows with the square of the closing speed', () => {
        expect(trampleLoss(herd, params('forager'), 4)).toBeCloseTo(4 * trampleLoss(herd, params('forager'), 2), 9);
    });
});

describe('budgetHerd at the defaults', () => {
    const b = (/** @type {string} */ s) => budgetHerd(config, params(s), MODEL_DEFAULTS);

    it('reads the forager: it sees the front 271 px off, 59 ticks before it arrives (41.7 at a constant run speed)', () => {
        const f = b('forager');
        expect(HERD_STEPS).toEqual(['see', 'turn', 'run', 'survive']);
        expect(Object.keys(f.cells)).toEqual(HERD_STEPS);
        expect(f.worst.sight).toBe(271);
        expect(f.worst.warning).toBe(59);
        expect(f.worst.constant).toBeCloseTo(41.69, 2);
        expect(f.worst.turn).toBeCloseTo(10.47, 2);
    });

    it('is tight for the forager, binding on the tramples it survives, and run has 7.5 ticks to spare after the sprint', () => {
        const f = b('forager');
        expect(f.row.status).toBe('tight');
        expect(f.row.binding).toBe('survive');
        expect(f.cells.survive.margin).toBe(3);
        expect(f.cells.run.margin).toBeCloseTo(59 - 2 - 10.47 - 39, 1);
        expect(f.trample.survives).toBe(3);
        expect(f.trample.walkSurvives).toBe(61);
    });

    it('is impossible on run for a predator, which sees the herd 115 px off from behind and needs 36 ticks to clear', () => {
        const p = b('predator');
        expect(p.row.status).toBe('impossible');
        expect(p.row.binding).toBe('run');
        expect(p.worst.sight).toBeCloseTo(400 * 0.4 - 45, 6);
        expect(p.typical.sight).toBe(355);
        expect(p.cells.survive.margin).toBe(14);
    });

    it('a body that can outrun the herd straight ahead says so: 8 against 6.5', () => {
        expect(b('forager').worst.straight).toEqual({ ahead: 8, outrun: true });
    });

    it('a scout, which sees 400 px, has more warning than a defender, which sees 240 behind it', () => {
        expect(b('scout').worst.warning).toBeGreaterThan(b('defender').worst.warning);
        expect(b('scout').row.status).toBe('tight');
        expect(b('defender').row.status).toBe('impossible');
    });
});

describe('budgetHerd where the numbers move', () => {
    it('a slower herd leaves the predator time: with a run speed of 2 the row is no longer impossible on run', () => {
        const slow = createConfig({ herdRunSpeed: 2 });
        expect(budgetHerd(slow, roleParams(slow, 'predator'), MODEL_DEFAULTS).cells.run.status).not.toBe('impossible');
    });

    it('a body with less than one trample of energy cannot survive: survive is impossible', () => {
        const brutal = createConfig({ trampleDamage: 4000 });
        const f = budgetHerd(brutal, roleParams(brutal, 'forager'), MODEL_DEFAULTS);
        expect(f.cells.survive.status).toBe('impossible');
        expect(f.row.binding).toBe('survive');
    });

    it('a body that cannot see past its own size sees nothing: see is impossible', () => {
        const blind = createConfig({ specialisations: { forager: { visionRange: 20 } } });
        const f = budgetHerd(blind, roleParams(blind, 'forager'), MODEL_DEFAULTS);
        expect(f.cells.see.status).toBe('impossible');
    });

    it('a slow reaction costs the run its slack', () => {
        const slow = { ...MODEL_DEFAULTS, reactionTicks: 12 };
        const f = budgetHerd(config, params('forager'), slow);
        expect(f.cells.run.status).toBe('impossible');
    });
});
