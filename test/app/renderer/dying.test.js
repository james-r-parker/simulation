import { describe, expect, it } from 'vitest';
import { createInterpolated } from '../../../js/app/interpolate.js';
import { DEATH_ANIMS } from '../../../js/app/renderer/death-anim.js';
import {
    beginDeath,
    createDying,
    isHidden,
    isPlaying,
    isUsed,
    MASS_LOSS,
    MAX_DYING,
    PENDING_MAX_MS,
    positionOf,
    stepDying,
    trackBodies,
} from '../../../js/app/renderer/dying.js';

const NAMES = ['STARVED', 'EATEN'];

/**
 * @param {{slot: number, genome: number, x?: number, speed?: number}[]} list agents
 * @returns {ReturnType<typeof createInterpolated>} the frame
 */
function frame(list) {
    const a = createInterpolated(256);
    a.count = list.length;
    list.forEach((s, i) => {
        a.slot[i] = s.slot;
        a.genomeId[i] = s.genome;
        a.x[i] = s.x ?? 100;
        a.y[i] = 50;
        a.size[i] = 10;
        a.speed[i] = s.speed ?? 0;
        a.spec[i] = 1;
        a.lineageId[i] = 7;
    });
    return a;
}

/** @param {ReturnType<typeof createDying>} d @returns {number} bodies in the pool */
function used(d) {
    let n = 0;
    for (let k = 0; k < MAX_DYING; k++) {
        n += isUsed(d, k) ? 1 : 0;
    }
    return n;
}

describe('trackBodies', () => {
    it('makes nothing of agents that stay, and a pending body of one that vanishes, at its last pose', () => {
        const d = createDying(256);
        trackBodies(d, frame([{ slot: 3, genome: 30, x: 120 }]), 0);
        expect(used(d)).toBe(0);
        expect(trackBodies(d, frame([]), 16)).toBe(1);
        expect(used(d)).toBe(1);
        expect(d.genome[0]).toBe(30);
        expect(d.spec[0]).toBe(1);
        expect(d.pose[0][0]).toBe(120);
        expect(isPlaying(d, 0)).toBe(false);
        expect(trackBodies(d, frame([]), 32)).toBe(0);
    });

    it('counts a slot taken by a new genome as the old body vanishing', () => {
        const d = createDying(256);
        trackBodies(d, frame([{ slot: 3, genome: 30 }]), 0);
        expect(trackBodies(d, frame([{ slot: 3, genome: 31 }]), 16)).toBe(1);
        expect(d.genome[0]).toBe(30);
    });

    it('spawns none for a mass loss (a reset or a hidden tab)', () => {
        const d = createDying(256);
        const many = Array.from({ length: MASS_LOSS + 1 }, (_, i) => ({ slot: i, genome: i + 1 }));
        trackBodies(d, frame(many), 0);
        expect(trackBodies(d, frame([]), 16)).toBe(0);
        expect(used(d)).toBe(0);
        trackBodies(d, frame(many.slice(0, MASS_LOSS)), 32);
        expect(trackBodies(d, frame([]), 48)).toBe(MASS_LOSS);
    });

    it('overwrites the oldest body when the pool is full', () => {
        const d = createDying(256);
        for (let g = 1; g <= MAX_DYING + 1; g++) {
            trackBodies(d, frame([{ slot: 0, genome: g }]), g);
            trackBodies(d, frame([]), g);
        }
        expect(used(d)).toBe(MAX_DYING);
        expect(d.genome[0]).toBe(MAX_DYING + 1);
    });
});

describe('beginDeath', () => {
    it('gives a pending body its cause and starts its clock', () => {
        const d = createDying(256);
        trackBodies(d, frame([{ slot: 3, genome: 30 }]), 0);
        trackBodies(d, frame([]), 16);
        expect(beginDeath(d, { genome: 30, cause: 1, nowMs: 40 })).toBe(true);
        expect(isPlaying(d, 0)).toBe(true);
        expect(d.cause[0]).toBe(1);
        expect(d.start[0]).toBe(40);
    });

    it('starts from the cache and hides the live row when the agent is still in the frame', () => {
        const d = createDying(256);
        trackBodies(d, frame([{ slot: 3, genome: 30 }]), 0);
        expect(isHidden(d, 3, 30)).toBe(false);
        expect(beginDeath(d, { genome: 30, cause: 0, nowMs: 5 })).toBe(true);
        expect(isHidden(d, 3, 30)).toBe(true);
        expect(isHidden(d, 3, 99)).toBe(false);
        expect(trackBodies(d, frame([{ slot: 3, genome: 30 }]), 16)).toBe(0);
        expect(trackBodies(d, frame([]), 32)).toBe(0);
        expect(used(d)).toBe(1);
        expect(isHidden(d, 3, 30)).toBe(false);
    });

    it('finds nothing for a genome never seen', () => {
        expect(beginDeath(createDying(8), { genome: 5, cause: 0, nowMs: 0 })).toBe(false);
    });
});

describe('stepDying', () => {
    it('frees a body when its death has run its length', () => {
        const d = createDying(256);
        trackBodies(d, frame([{ slot: 3, genome: 30 }]), 0);
        trackBodies(d, frame([]), 16);
        beginDeath(d, { genome: 30, cause: 1, nowMs: 100 });
        expect(stepDying(d, { nowMs: 100 + DEATH_ANIMS.EATEN.ms - 1, causeNames: NAMES })).toBe(1);
        expect(stepDying(d, { nowMs: 100 + DEATH_ANIMS.EATEN.ms, causeNames: NAMES })).toBe(0);
    });

    it('starts a pending body whose death never arrived, as a starvation', () => {
        const d = createDying(256);
        trackBodies(d, frame([{ slot: 3, genome: 30 }]), 0);
        trackBodies(d, frame([]), 0);
        stepDying(d, { nowMs: PENDING_MAX_MS + 1, causeNames: NAMES });
        expect(isPlaying(d, 0)).toBe(true);
        expect(d.cause[0]).toBe(0);
    });
});

describe('positionOf', () => {
    it('carries a body on at its last velocity while pending and slows it to rest once it dies', () => {
        const d = createDying(256);
        trackBodies(d, frame([{ slot: 3, genome: 30, x: 100, speed: 5 }]), 0);
        trackBodies(d, frame([]), 0);
        const early = positionOf(d, 0, 50).x;
        expect(early).toBeGreaterThan(100);
        expect(positionOf(d, 0, 100).x).toBeGreaterThan(early);
        beginDeath(d, { genome: 30, cause: 0, nowMs: 100 });
        const a = positionOf(d, 0, 400).x;
        const b = positionOf(d, 0, 2000).x;
        expect(b).toBeGreaterThan(a);
        expect(b - a).toBeLessThan(a - positionOf(d, 0, 100).x);
    });
});
