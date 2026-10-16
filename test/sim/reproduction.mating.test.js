import { describe, expect, it } from 'vitest';
import { mate } from '../../js/sim/reproduction.js';
import { createRng, nextFloat } from '../../js/sim/rng.js';
import { buildHash } from '../../js/sim/spatial-hash.js';
import { addBlob, lifeWorld, recordingPolicy } from './helpers/life-world.js';

const MATE = { mateOut: 1, energy: 700, spec: 2 };

/**
 * @param {number[][]} points `[x, y]` for each ready agent
 * @param {Record<string, any>} [over] config overrides
 * @returns {any} the world with the hash built
 */
function placed(points, over = {}) {
    const w = lifeWorld({ maxAgents: 64, ...over });
    for (const [x, y] of points) {
        const s = addBlob(w, MATE);
        w.x[s] = x;
        w.y[s] = y;
    }
    buildHash(w.hash, w);
    return w;
}

describe('mate with a range', () => {
    it('mates two agents that do not touch but are within mateRange', () => {
        const gap = 60;
        const w = lifeWorld({ mateRange: 100 });
        const a = addBlob(w, MATE);
        const b = addBlob(w, MATE);
        w.x[b] = w.x[a] + w.size[a] + w.size[b] + gap;
        buildHash(w.hash, w);
        mate(w, recordingPolicy([]));
        expect(w.pregnancy[a]).toBe(w.config.pregnancyTicks);
    });

    it('does not mate two agents beyond mateRange', () => {
        const w = lifeWorld({ mateRange: 100 });
        const a = addBlob(w, MATE);
        const b = addBlob(w, MATE);
        w.x[b] = w.x[a] + w.size[a] + w.size[b] + 101;
        buildHash(w.hash, w);
        mate(w, recordingPolicy([]));
        expect(w.pregnancy[a]).toBe(0);
    });

    it('lets the lower slot choose first, so it is the mother of the first partner in scan order', () => {
        const w = placed([
            [500, 500],
            [520, 500],
            [540, 500],
        ]);
        mate(w, recordingPolicy([]));
        expect(w.pregnancy[0]).toBeGreaterThan(0);
        expect(w.fatherId[0]).toBe(w.genomeId[1]);
        expect(w.pregnancy[1]).toBe(0);
        expect(w.cooldown[2]).toBe(0);
    });

    it('lets the third agent mate with nobody when the other two are taken', () => {
        const w = placed([
            [500, 500],
            [520, 500],
            [540, 500],
        ]);
        mate(w, recordingPolicy([]));
        expect(w.cooldown[2]).toBe(0);
        expect(w.pregnancy[2]).toBe(0);
    });
});

describe('mate in crowded random worlds', () => {
    it('puts no agent in two matings in one tick', () => {
        for (let seed = 1; seed <= 50; seed++) {
            const rng = createRng(seed);
            const points = [];
            for (let i = 0; i < 30; i++) {
                points.push([300 + nextFloat(rng) * 300, 300 + nextFloat(rng) * 300]);
            }
            const w = placed(points, { seed, mateRange: 100 });
            /** @type {number[]} */
            const mothers = [];
            /** @type {number[]} */
            const fathers = [];
            mate(w, {
                childBrain() {},
                onMate: (/** @type {any} */ _w, /** @type {number} */ m, /** @type {number} */ f) => {
                    mothers.push(m);
                    fathers.push(f);
                },
            });
            const everyone = [...mothers, ...fathers];
            expect(mothers.length).toBeGreaterThan(0);
            expect(new Set(everyone).size).toBe(everyone.length);
        }
    });
});
