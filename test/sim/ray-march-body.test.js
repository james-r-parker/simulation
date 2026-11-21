// The body lanes the ray march writes beside the hue (docs/designs/body-genes.md, "Raw lanes"); the classes and the
// proximity are in ray-march.test.js.
import { describe, expect, it } from 'vitest';
import { castRays } from '../../js/sim/ray-march.js';
import { AGENT, KIND_STRIDE } from '../../js/sim/ray-gather.js';
import { createRng, nextFloat } from '../../js/sim/rng.js';
import { bodySenseReference } from './helpers/body-sense-reference.js';
import { addAgent, addFood, rebuild, senseWorld } from './helpers/sense-world.js';

/**
 * @param {ReturnType<typeof senseWorld>} w
 * @param {number} slot
 */
function cast(w, slot) {
    castRays(w, rebuild(w), slot);
}

describe('castRays body lanes', () => {
    /**
     * @param {ReturnType<typeof senseWorld>} w
     * @param {number} slot
     * @param {number} ray
     * @returns {number[]} the ray's size, speed and closing lanes
     */
    const lanes = (w, slot, ray) => {
        const at = slot * w.config.rayCount + ray;
        return [w.raySize[at], w.raySpeed[at], w.rayClosing[at]];
    };

    it('writes the size, speed and closing of an agent hit, as the reference reads them', () => {
        const w = senseWorld();
        const me = addAgent(w, 500, 500, 20);
        const them = addAgent(w, 600, 500, 10);
        w.vx[them] = -w.config.maxVelocity;
        cast(w, me);
        expect(lanes(w, me, 0)).toEqual(bodySenseReference(w, me, them).map(Math.fround));
        expect(lanes(w, me, 0)[0]).toBeLessThan(0);
        expect(lanes(w, me, 0)[2]).toBeGreaterThan(0);
    });

    it('writes 0 on all three for a food hit, a wall, an obstacle and a ray that hits nothing', () => {
        const w = senseWorld({ rayCount: 8 });
        const me = addAgent(w, 500, 500, 20);
        addFood(w, 600, 500, 20);
        w.obsX[0] = 500;
        w.obsY[0] = 600;
        w.obsRadius[0] = 30;
        cast(w, me);
        for (let ray = 0; ray < 8; ray++) {
            expect(lanes(w, me, ray), `ray ${ray}`).toEqual([0, 0, 0]);
        }
    });

    it('clears the lanes when the body leaves the ray', () => {
        const w = senseWorld();
        const me = addAgent(w, 500, 500, 20);
        const them = addAgent(w, 600, 500, 40);
        w.vx[them] = 1;
        cast(w, me);
        expect(lanes(w, me, 0)[0]).toBeGreaterThan(0);
        w.y[them] = 900;
        w.x[them] = 900;
        cast(w, me);
        expect(lanes(w, me, 0)).toEqual([0, 0, 0]);
    });

    it('throws when a hit body is sized against a caster of size 0, as detTanh refuses the ratio', () => {
        const w = senseWorld();
        const me = addAgent(w, 500, 500, 20);
        addAgent(w, 600, 500, 10);
        w.size[me] = 0;
        expect(() => cast(w, me)).toThrow(/size over its own is not finite/);
    });
});

/** Bodies in each fuzz world. */
const CROWD = 40;

/**
 * Fills a world with bodies at seeded positions, sizes, headings and velocities: some resting, some at a velocity of
 * -0, some sharing a centre with another, some far beyond the cap.
 * @param {number} seed the seed
 * @returns {ReturnType<typeof senseWorld>} the world
 */
function crowd(seed) {
    const w = senseWorld({ rayCount: 12, maxAgents: CROWD });
    const rng = createRng(seed);
    const cap = w.config.maxVelocity;
    for (let i = 0; i < CROWD; i++) {
        const shared = i > 0 && nextFloat(rng) < 0.1;
        const x = shared ? w.x[i - 1] : 200 + 600 * nextFloat(rng);
        const y = shared ? w.y[i - 1] : 200 + 600 * nextFloat(rng);
        const slot = addAgent(w, x, y, 4 + 40 * nextFloat(rng));
        w.angle[slot] = 2 * Math.PI * nextFloat(rng);
        const pick = nextFloat(rng);
        const scale = pick < 0.2 ? 0 : pick < 0.8 ? cap * 1.2 : cap * 12;
        w.vx[slot] = pick < 0.1 ? -0 : scale * (2 * nextFloat(rng) - 1);
        w.vy[slot] = scale * (2 * nextFloat(rng) - 1);
    }
    return w;
}

describe('the sense kernel body lanes against the naive reference', () => {
    it('match the reference in float32 bit for bit on every ray of every caster, and read 0 off an agent hit', () => {
        let agentHits = 0;
        for (let seed = 1; seed <= 8; seed++) {
            const w = crowd(seed);
            const hash = rebuild(w);
            const rays = w.config.rayCount;
            for (let slot = 0; slot < CROWD; slot++) {
                castRays(w, hash, slot);
                const { rayBestKey } = w.wasm.views;
                for (let k = 0; k < rays; k++) {
                    const key = rayBestKey[k];
                    const isAgent = key >= AGENT * KIND_STRIDE && key < (AGENT + 1) * KIND_STRIDE;
                    const want = isAgent
                        ? bodySenseReference(w, slot, key - AGENT * KIND_STRIDE).map(Math.fround)
                        : [0, 0, 0];
                    const got = lanesAt(w, slot * rays + k);
                    const same = got.every((v, i) => Object.is(v, want[i]));
                    expect(same, `seed ${seed} slot ${slot} ray ${k}: ${got} against ${want}`).toBe(true);
                    agentHits += isAgent ? 1 : 0;
                }
            }
        }
        expect(agentHits).toBeGreaterThan(200);
    });
});

/**
 * @param {ReturnType<typeof senseWorld>} w
 * @param {number} at the ray's index in the lanes
 * @returns {number[]} its size, speed and closing
 */
function lanesAt(w, at) {
    return [w.raySize[at], w.raySpeed[at], w.rayClosing[at]];
}
