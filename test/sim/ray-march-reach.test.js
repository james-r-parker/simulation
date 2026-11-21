// The per-ray reach of the sense kernel (docs/designs/senses-and-motor.md, Phase 5): a predator with a short rear
// reach misses what lies behind it, and every ray's nearest hit equals a naive per-ray JS march with the same reach.
import { describe, expect, it } from 'vitest';
import { RAY_CHANNELS } from '../../js/sim/brain-layout.js';
import { detCos, detSin } from '../../js/sim/det-math.js';
import { castRays } from '../../js/sim/ray-march.js';
import { AGENT, FOOD, KIND_STRIDE, WALL } from '../../js/sim/ray-gather.js';
import { createRng, nextFloat } from '../../js/sim/rng.js';
import { visionOf } from '../../js/sim/traits.js';
import { addAgent, addFood, rebuild, senseWorld } from './helpers/sense-world.js';
import { setSpec } from './helpers/body.js';

const CH_WALL = 6;
const FORAGER = 0;
const PREDATOR = 1;
const BEHIND = 2; // of four rays, the one at 180 degrees

/**
 * @param {Record<string, number>} shares `rearVisionShare` by specialisation name
 * @param {Record<string, any>} [over] other config overrides
 * @returns {ReturnType<typeof senseWorld>} an empty sense world with those shares
 */
function reachWorld(shares, over = {}) {
    const specialisations = Object.fromEntries(
        Object.entries(shares).map(([name, share]) => [name, { rearVisionShare: share }]),
    );
    const w = senseWorld({ specialisations, ...over });
    w.herdAlive.fill(0);
    return w;
}

/**
 * @param {ReturnType<typeof senseWorld>} w the world
 * @param {number} slot the caster
 * @param {number} ray the ray index
 * @returns {number[]} that ray's channels after a cast
 */
function castRay(w, slot, ray) {
    castRays(w, rebuild(w), slot);
    const base = slot * w.layout.rawInputCount + ray * RAY_CHANNELS;
    return Array.from(w.inputs.subarray(base, base + RAY_CHANNELS));
}

describe('a forward-weighted eye', () => {
    it('hides a body behind a predator at half its range that a forager sees', () => {
        const w = reachWorld({ predator: 0.4 });
        const me = addAgent(w, 500, 500, 10);
        setSpec(w, me, PREDATOR);
        const range = w.visionBySpec[PREDATOR];
        addAgent(w, 500 - 10 - range / 2 - 10, 500, 10);
        expect(castRay(w, me, BEHIND)[0]).toBe(0);
        setSpec(w, me, FORAGER);
        expect(castRay(w, me, BEHIND)[0]).toBeGreaterThan(0);
    });

    it('sees the same body dead ahead', () => {
        const w = reachWorld({ predator: 0.4 });
        const me = addAgent(w, 500, 500, 10);
        setSpec(w, me, PREDATOR);
        const range = w.visionBySpec[PREDATOR];
        addAgent(w, 500 + 10 + range / 2 + 10, 500, 10);
        expect(castRay(w, me, 0)[0]).toBeCloseTo(1 - (range / 2 + 10) / range, 6);
    });

    it('reads a rear hit by the full range, so a body reads the same distance on every ray', () => {
        const w = reachWorld({ predator: 0.4 });
        const me = addAgent(w, 500, 500, 10);
        setSpec(w, me, PREDATOR);
        addAgent(w, 400, 500, 10);
        expect(castRay(w, me, BEHIND)[0]).toBeCloseTo(1 - 90 / w.visionBySpec[PREDATOR], 6);
    });

    it('misses a wall behind past the rear reach and sees it at a share of 1', () => {
        const w = reachWorld({ predator: 0.4 });
        const me = addAgent(w, w.visionBySpec[PREDATOR] / 2, 500, 10); // the wall at half the range, beyond 0.4 of it
        setSpec(w, me, PREDATOR);
        expect(castRay(w, me, BEHIND)[CH_WALL]).toBe(0);
        const open = reachWorld({ predator: 1 });
        const them = addAgent(open, open.visionBySpec[PREDATOR] / 2, 500, 10);
        setSpec(open, them, PREDATOR);
        expect(castRay(open, them, BEHIND)[CH_WALL]).toBe(1);
    });
});

/**
 * @param {number} b the ray-circle `b`
 * @param {number} c the ray-circle `c`
 * @returns {number} the distance to the surface (0 from inside), or -1 for none
 */
function circleHit(b, c) {
    const disc = b * b - c;
    if (disc < 0 || (b > 0 && c > 0)) {
        return -1;
    }
    const t = -b - Math.sqrt(disc);
    return t < 0 ? 0 : t;
}

/**
 * @param {number} origin the caster's coordinate
 * @param {number} dir the ray's direction component
 * @param {number} extent the world's extent on that axis
 * @returns {number} the distance to the boundary the ray heads for
 */
function wallDistance(origin, dir, extent) {
    if (dir < 0) {
        return -origin / dir;
    }
    return dir > 0 ? (extent - origin) / dir : Infinity;
}

/**
 * @param {ReturnType<typeof senseWorld>} w the world
 * @param {number} slot the caster
 * @returns {{x: number, y: number, r: number, key: number}[]} every circle its rays may hit, concealed agents left out
 */
function circlesFor(w, slot) {
    const conceals = w.refugeCentres.length > 0;
    const out = [];
    for (let i = 0; i < w.config.maxAgents; i++) {
        const hidden = conceals && w.coverRing[i] !== 0 && w.coverRing[i] !== w.coverRing[slot];
        if (i !== slot && w.alive[i] === 1 && !hidden) {
            out.push({ x: w.x[i], y: w.y[i], r: w.size[i], key: AGENT * KIND_STRIDE + i });
        }
    }
    const seesPlant = w.plantFoodBySpec[w.spec[slot]] > 0;
    for (let f = 0; f < w.config.maxFood; f++) {
        if (w.foodAlive[f] === 1 && w.foodKind[f] === 0 && seesPlant) {
            out.push({ x: w.foodX[f], y: w.foodY[f], r: w.foodRadius[f], key: FOOD * KIND_STRIDE + f });
        }
    }
    return out;
}

/**
 * The naive march: each ray alone, every circle, its own reach.
 * @param {ReturnType<typeof senseWorld>} w the world
 * @param {number} slot the caster
 * @returns {{t: number[], key: number[]}} every ray's nearest distance and key (Infinity and the wall key for none)
 */
function naiveMarch(w, slot) {
    const rays = w.config.rayCount;
    const range = visionOf(w, slot);
    const px = w.x[slot];
    const py = w.y[slot];
    const cosH = detCos(w.angle[slot]);
    const sinH = detSin(w.angle[slot]);
    const circles = circlesFor(w, slot);
    const t = [];
    const key = [];
    for (let k = 0; k < rays; k++) {
        const reach = range * w.rayReachBySpec[w.spec[slot] * rays + k];
        const dx = cosH * w.rayCos[k] - sinH * w.raySin[k];
        const dy = sinH * w.rayCos[k] + cosH * w.raySin[k];
        const wall = Math.min(wallDistance(px, dx, w.config.worldWidth), wallDistance(py, dy, w.config.worldHeight));
        let best = { t: wall >= 0 && wall <= reach ? wall : Infinity, key: WALL * KIND_STRIDE };
        for (const c of circles) {
            const ox = px - c.x;
            const oy = py - c.y;
            const hit = circleHit(dx * ox + dy * oy, ox * ox + oy * oy - c.r * c.r);
            if (hit >= 0 && hit <= reach && (hit < best.t || (hit === best.t && c.key < best.key))) {
                best = { t: hit, key: c.key };
            }
        }
        t.push(best.t);
        key.push(best.key);
    }
    return { t, key };
}

/**
 * @param {boolean} rings whether the world has a refuge ring (the covered path)
 * @param {number} seed the scene seed
 * @returns {ReturnType<typeof senseWorld>} a world of agents of mixed specialisations and shares, with plant food
 */
function randomScene(rings, seed) {
    const w = reachWorld({ predator: 0.3, defender: 0.8, scout: 0.55 }, { rayCount: 16 });
    w.refugeCentres = rings ? Float64Array.of(2000, 2000) : new Float64Array(0);
    const rng = createRng(seed);
    for (let i = 0; i < w.config.maxAgents; i++) {
        const slot = addAgent(w, 50 + 900 * nextFloat(rng), 50 + 900 * nextFloat(rng), 5 + 20 * nextFloat(rng));
        setSpec(w, slot, Math.floor(5 * nextFloat(rng)));
        w.angle[slot] = 2 * Math.PI * nextFloat(rng);
        w.coverRing[slot] = rings ? Math.floor(3 * nextFloat(rng)) : 0;
    }
    for (let f = 0; f < w.config.maxFood; f++) {
        addFood(w, 50 + 900 * nextFloat(rng), 50 + 900 * nextFloat(rng), 5 + 10 * nextFloat(rng));
    }
    return w;
}

describe('the reach-shaped kernel against a naive JS march', () => {
    for (const rings of [false, true]) {
        it(`finds every ray's nearest hit and key (${rings ? 'covered' : 'plain'} path)`, () => {
            for (let seed = 1; seed <= 12; seed++) {
                const w = randomScene(rings, seed);
                for (let slot = 0; slot < w.config.maxAgents; slot++) {
                    castRays(w, rebuild(w), slot);
                    const { rayBestT, rayBestKey } = w.wasm.views;
                    const want = naiveMarch(w, slot);
                    expect(Array.from(rayBestT)).toEqual(want.t);
                    expect(Array.from(rayBestKey)).toEqual(want.key);
                }
            }
        });
    }
});
