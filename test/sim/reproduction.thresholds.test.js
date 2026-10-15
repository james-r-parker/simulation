import { describe, expect, it } from 'vitest';
import { BLOCKED_CAUSE, EVENT_STRIDE, EVENT_TYPE } from '../../js/sim/events.js';
import { advancePregnancies, mate, splitAll } from '../../js/sim/reproduction.js';
import { detCos, detSin } from '../../js/sim/det-math.js';
import { nextFloat } from '../../js/sim/rng.js';
import { createConfig } from '../../js/sim/config.js';
import { addBlob, contact, lifeWorld, recordingPolicy } from './helpers/life-world.js';

const MATE = { mateOut: 1, energy: 700 };

/**
 * @param {any} w the world
 * @param {number} i event index
 * @returns {number[]} the record's fields
 */
function event(w, i) {
    return Array.from(w.events.data.subarray(i * EVENT_STRIDE, (i + 1) * EVENT_STRIDE));
}

/**
 * @param {Record<string, any>} [over] config overrides
 * @returns {any} a world with two mating-ready agents in contact
 */
function pair(over = {}) {
    const w = lifeWorld(over);
    const a = addBlob(w, { ...MATE, spec: 2 });
    const b = addBlob(w, { ...MATE, spec: 2 });
    contact(w, a, b);
    return w;
}

/**
 * @param {any} w the world
 * @returns {number} the next lifecycle draw, without consuming it
 */
function peekLifecycle(w) {
    return nextFloat({ seed: 0, s: Uint32Array.from(w.rng.lifecycle.s) });
}

/**
 * @param {number} bonus the reproduction bonus of every season
 * @returns {any[]} four seasons
 */
function seasonsWith(bonus) {
    const base = createConfig({}).seasons;
    return base.map((/** @type {any} */ season) => ({ ...season, reproductionBonus: bonus }));
}

describe('mate thresholds', () => {
    it.each([
        ['exactly the size ratio limit', 20, 10, true],
        ['exactly the inverse size ratio limit', 10, 20, true],
        ['just over the size ratio limit', 21, 10, false],
        ['just under the inverse size ratio limit', 10, 21, false],
    ])('pairs agents at %s', (_name, sizeA, sizeB, mates) => {
        const w = pair({ huntSizeRatio: 2 });
        w.size[0] = sizeA;
        w.size[1] = sizeB;
        mate(w, recordingPolicy([]));
        expect(w.pregnancy[0] > 0).toBe(mates);
    });

    it('copies the father weights into the mother row of a higher mother slot', () => {
        const w = lifeWorld();
        addBlob(w, { ...MATE, spec: 2 });
        const m = addBlob(w, { ...MATE, spec: 2 });
        const f = addBlob(w, { ...MATE, spec: 2 });
        contact(w, f, m);
        const n = w.layout.weightCount;
        for (let i = 0; i < 4 * n; i++) {
            w.weights[i] = i + 1;
        }
        mate(w, recordingPolicy([]));
        expect(Array.from(w.fatherWeights.subarray(m * n, (m + 1) * n))).toEqual(
            Array.from(w.weights.subarray(f * n, (f + 1) * n)),
        );
        expect(w.fatherWeights[(m - 1) * n + 0]).toBe(0);
        expect(w.fatherWeights[f * n]).toBe(0);
        expect(w.fatherId[m]).toBe(w.genomeId[f]);
    });

    it.each([
        ['at exactly the chance', 1, false],
        ['just under the chance', 1.01, true],
    ])('draws %s and mates only when under it', (_name, factor, mates) => {
        let seed = 1;
        let draw = 1;
        for (; seed < 200; seed++) {
            draw = peekLifecycle(pair({ seed }));
            if (draw < 0.4) {
                break;
            }
        }
        const w = pair({ seed, mateChanceScale: 2, seasons: seasonsWith(2 * draw * factor) });
        mate(w, recordingPolicy([]));
        expect(w.pregnancy[0] > 0).toBe(mates);
    });
});

describe('pregnancy and split guards', () => {
    it('leaves a non-pregnant agent at pregnancy 0 and a dead slot untouched', () => {
        const w = lifeWorld();
        const a = addBlob(w);
        const d = addBlob(w, { pregnancy: 5 });
        w.alive[d] = 0;
        advancePregnancies(w, recordingPolicy([]));
        expect(w.pregnancy[a]).toBe(0);
        expect(w.pregnancy[d]).toBe(5);
        expect(w.events.count).toBe(0);
    });

    it('does not split a dead slot that still holds ready fields', () => {
        const w = lifeWorld();
        const d = addBlob(w, { energy: 2000 });
        w.alive[d] = 0;
        w.population = 0;
        splitAll(w, recordingPolicy([]));
        expect(w.events.count).toBe(0);
        expect(w.alive.indexOf(1)).toBe(-1);
    });

    it('starts the splitter cooldown when the child takes slot 0', () => {
        const w = lifeWorld();
        addBlob(w);
        const b = addBlob(w, { energy: 2000 });
        w.alive[0] = 0;
        w.population = 1;
        splitAll(w, recordingPolicy([]));
        expect(w.alive[0]).toBe(1);
        expect(w.cooldown[b]).toBeGreaterThan(0);
    });

    it('hands out consecutive genome ids', () => {
        const w = lifeWorld();
        addBlob(w, { energy: 2000 });
        const next = w.nextId;
        splitAll(w, recordingPolicy([]));
        expect(w.genomeId[1]).toBe(next);
        expect(w.nextId).toBe(next + 1);
    });

    it('reports a blocked birth against the blocked slot, not slot 0', () => {
        const w = lifeWorld({ maxAgents: 2 });
        addBlob(w);
        const b = addBlob(w, { pregnancy: 1, energy: 900 });
        advancePregnancies(w, recordingPolicy([]));
        expect(event(w, 0).slice(0, 4)).toEqual([EVENT_TYPE.BIRTH_BLOCKED, 0, b, BLOCKED_CAUSE.CAPACITY]);
    });
});

describe('child placement', () => {
    it.each([
        ['mid world', 500],
        ['against the far wall', 995],
        ['against the near wall', 5],
    ])('puts the child touching the mother, clamped inside, %s', (_name, at) => {
        for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
            const w = lifeWorld({ seed });
            const mother = addBlob(w, { x: at, y: at, pregnancy: 1, energy: 900 });
            const draw = peekLifecycle(w);
            advancePregnancies(w, recordingPolicy([]));
            const c = 1;
            const theta = draw * 6.283185307179586;
            const rc = w.size[c];
            const reach = w.size[mother] + rc;
            const limit = 1000;
            expect(w.x[c]).toBe(Math.fround(Math.min(limit - rc, Math.max(rc, at + reach * detCos(theta)))));
            expect(w.y[c]).toBe(Math.fround(Math.min(limit - rc, Math.max(rc, at + reach * detSin(theta)))));
            expect(w.angle[c]).toBe(Math.fround(theta - Math.PI));
        }
    });
});
