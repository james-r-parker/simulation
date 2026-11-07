import { describe, expect, it } from 'vitest';
import { CLIENT_KIND } from '../../../js/app/renderer/client-kinds.js';
import { captionFor } from '../../../js/app/director/captions.js';
import { findMoments } from '../../../js/app/director/moments.js';
import {
    findWorldMoments,
    scoreFloorArrival,
    scoreOutbreak,
    scoreWorldEffect,
    SEASON_TURN_S,
} from '../../../js/app/director/moments-world.js';
import { MOMENT_KIND } from '../../../js/app/director/scoring.js';

const LAYOUT = {
    effectKinds: { BORN: 1, DIED: 2, STAMPEDE: 10, FIRST_KILL: 16 },
    deathCauses: { EATEN: 1, TRAMPLED: 5 },
    bornCauses: { MATE: 1, FLOOR: 3 },
};
const INFO = { ticksPerSecond: 60, seasonLength: 6000, worldWidth: 1000, worldHeight: 800, specs: [] };

/**
 * @param {number} kind the effect kind
 * @param {Partial<{tick: number, x: number, y: number, c: number, d: number}>} [over] fields
 * @returns {any} an effect record
 */
function fx(kind, over = {}) {
    return { kind, tick: 100, x: 10, y: 20, a: 1, b: 2, c: 0, d: 0, ...over };
}

describe('world moment scores', () => {
    it('scores outbreaks from 3 infections and floor arrivals from 4 births, capped', () => {
        expect([scoreOutbreak(2), scoreOutbreak(3), scoreOutbreak(10)]).toEqual([0, 65, 75]);
        expect([scoreFloorArrival(3), scoreFloorArrival(4), scoreFloorArrival(10)]).toEqual([0, 60, 60]);
    });

    it('scores a stampede, a first kill and a trampling, decaying with age', () => {
        const ctx = { kinds: LAYOUT.effectKinds, trampled: 5 };
        expect(scoreWorldEffect(fx(10), { ...ctx, ageS: 0 })).toEqual({ kind: MOMENT_KIND.STAMPEDE, score: 60 });
        expect(scoreWorldEffect(fx(16), { ...ctx, ageS: 3 })?.score).toBeCloseTo(42.5);
        expect(scoreWorldEffect(fx(2, { c: 5 << 8 }), { ...ctx, ageS: 1 })?.kind).toBe(MOMENT_KIND.TRAMPLE);
        expect(scoreWorldEffect(fx(2, { c: 1 << 8 }), { ...ctx, ageS: 1 })).toBeNull();
        expect(scoreWorldEffect(fx(10), { ...ctx, ageS: 6 })).toBeNull();
    });
});

describe('findWorldMoments', () => {
    it('finds an outbreak from clustered infections and an arrival from clustered floor births', () => {
        const effects = [
            ...[0, 1, 2].map((k) => fx(CLIENT_KIND.INFECTED, { x: 100 + k * 50 })),
            ...[0, 1, 2, 3].map((k) => fx(1, { d: 3, x: 500 + k * 10 })),
            fx(1, { d: 1 }),
        ];
        const found = findWorldMoments(effects, { tick: 160, ticksPerSecond: 60, layout: LAYOUT, info: INFO });
        const kinds = found.map((m) => m.kind);
        expect(kinds).toContain(MOMENT_KIND.OUTBREAK);
        expect(kinds).toContain(MOMENT_KIND.FLOOR_ARRIVAL);
        expect(found.find((m) => m.kind === MOMENT_KIND.OUTBREAK)?.count).toBe(3);
    });

    it('marks the first seconds of each season after the first as a season turn at the world centre', () => {
        const ctx = { ticksPerSecond: 60, layout: LAYOUT, info: INFO };
        expect(findWorldMoments([], { ...ctx, tick: 60 })).toEqual([]);
        const turn = findWorldMoments([], { ...ctx, tick: 3 * 6000 + 60 });
        expect(turn).toEqual([{ kind: MOMENT_KIND.SEASON_TURN, score: expect.any(Number), x: 500, y: 400, count: 3 }]);
        expect(findWorldMoments([], { ...ctx, tick: 6000 + SEASON_TURN_S * 60 })).toEqual([]);
    });

    it('feeds findMoments and gets captions', () => {
        const found = findMoments({ snapshot: [], effects: [fx(16)], info: INFO, layout: LAYOUT, tick: 100 });
        expect(found[0].kind).toBe(MOMENT_KIND.FIRST_KILL);
        expect(captionFor({ kind: MOMENT_KIND.SEASON_TURN, count: 3 })).toBe('Winter comes');
        expect(captionFor({ kind: MOMENT_KIND.OUTBREAK, count: 4 })).toBe('Outbreak - 4 infected');
        expect(captionFor({ kind: MOMENT_KIND.FLOOR_ARRIVAL, count: 5 })).toBe('5 newcomers arrive');
        for (const k of ['stampede', 'first-kill', 'trample']) {
            expect(captionFor({ kind: k })).not.toBe('');
        }
    });
});
