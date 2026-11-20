import { describe, expect, it } from 'vitest';
import { LANE_KINDS } from '../helpers/lane-kinds.js';
import { createInterpolated } from '../../../js/app/interpolate.js';
import { DEATH_ANIMS } from '../../../js/app/renderer/death-anim.js';
import {
    beginDeath,
    createDying,
    deathBody,
    DRIFT,
    driftOf,
    isHidden,
    isPlaying,
    isUsed,
    MASS_LOSS,
    MAX_DYING,
    PENDING_MAX_MS,
    positionOf,
    speedShare,
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
        a.angle[i] = 0;
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

describe.each(LANE_KINDS)('trackBodies (%s lanes)', (_kind, lanes) => {
    it('makes nothing of agents that stay, and a pending body of one that vanishes, at its last pose', () => {
        const d = createDying(256, lanes());
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
        const d = createDying(256, lanes());
        trackBodies(d, frame([{ slot: 3, genome: 30 }]), 0);
        expect(trackBodies(d, frame([{ slot: 3, genome: 31 }]), 16)).toBe(1);
        expect(d.genome[0]).toBe(30);
    });

    it('ignores an agent in a slot past the cache', () => {
        const d = createDying(4, lanes());
        trackBodies(d, frame([{ slot: 9, genome: 90 }]), 0);
        expect(trackBodies(d, frame([]), 16)).toBe(0);
    });

    it('spawns none for a mass loss (a reset or a hidden tab)', () => {
        const d = createDying(256, lanes());
        const many = Array.from({ length: MASS_LOSS + 1 }, (_, i) => ({ slot: i, genome: i + 1 }));
        trackBodies(d, frame(many), 0);
        expect(trackBodies(d, frame([]), 16)).toBe(0);
        expect(used(d)).toBe(0);
        trackBodies(d, frame(many.slice(0, MASS_LOSS)), 32);
        expect(trackBodies(d, frame([]), 48)).toBe(MASS_LOSS);
    });

    it('overwrites the oldest body when the pool is full', () => {
        const d = createDying(256, lanes());
        for (let g = 1; g <= MAX_DYING + 1; g++) {
            trackBodies(d, frame([{ slot: 0, genome: g }]), g);
            trackBodies(d, frame([]), g);
        }
        expect(used(d)).toBe(MAX_DYING);
        expect(d.genome[0]).toBe(MAX_DYING + 1);
    });
});

describe.each(LANE_KINDS)('beginDeath (%s lanes)', (_kind, lanes) => {
    it('gives a pending body its cause and starts its clock', () => {
        const d = createDying(256, lanes());
        trackBodies(d, frame([{ slot: 3, genome: 30 }]), 0);
        trackBodies(d, frame([]), 16);
        expect(beginDeath(d, { genome: 30, cause: 1, nowMs: 40 })).toBe(true);
        expect(isPlaying(d, 0)).toBe(true);
        expect(d.cause[0]).toBe(1);
        expect(d.start[0]).toBe(40);
    });

    it('starts from the cache and hides the live row when the agent is still in the frame', () => {
        const d = createDying(256, lanes());
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
        expect(beginDeath(createDying(8, lanes()), { genome: 5, cause: 0, nowMs: 0 })).toBe(false);
    });
});

describe.each(LANE_KINDS)('stepDying (%s lanes)', (_kind, lanes) => {
    it('frees a body when its death has run its length', () => {
        const d = createDying(256, lanes());
        trackBodies(d, frame([{ slot: 3, genome: 30 }]), 0);
        trackBodies(d, frame([]), 16);
        beginDeath(d, { genome: 30, cause: 1, nowMs: 100 });
        expect(stepDying(d, { nowMs: 100 + DEATH_ANIMS.EATEN.ms - 1, causeNames: NAMES })).toBe(1);
        expect(stepDying(d, { nowMs: 100 + DEATH_ANIMS.EATEN.ms, causeNames: NAMES })).toBe(0);
    });

    it('starts a pending body whose death never arrived, as a starvation', () => {
        const d = createDying(256, lanes());
        trackBodies(d, frame([{ slot: 3, genome: 30 }]), 0);
        trackBodies(d, frame([]), 0);
        stepDying(d, { nowMs: PENDING_MAX_MS, causeNames: NAMES });
        expect(isPlaying(d, 0)).toBe(false);
        stepDying(d, { nowMs: PENDING_MAX_MS + 1, causeNames: NAMES });
        expect(PENDING_MAX_MS).toBe(400);
        expect(isPlaying(d, 0)).toBe(true);
        expect(d.cause[0]).toBe(0);
    });
});

describe.each(LANE_KINDS)('positionOf (%s lanes)', (_kind, lanes) => {
    it('carries a body on at its last velocity and slows it to rest from the moment it vanished, dead or not', () => {
        const d = createDying(256, lanes());
        trackBodies(d, frame([{ slot: 3, genome: 30, x: 100, speed: 5 }]), 0);
        trackBodies(d, frame([]), 0);
        expect(positionOf(d, 0, 0).x).toBe(100);
        const early = positionOf(d, 0, 50).x;
        expect(early).toBeGreaterThan(100);
        const mid = positionOf(d, 0, 400).x;
        const rest = positionOf(d, 0, 4000).x;
        expect(mid).toBeGreaterThan(early);
        expect(rest - mid).toBeLessThan(mid - early);
        expect(positionOf(d, 0, 8000).x).toBeCloseTo(rest, 2);
        beginDeath(d, { genome: 30, cause: 0, nowMs: 100 });
        expect(positionOf(d, 0, 400).x).toBe(mid);
    });

    it('never moves a body backwards before it vanished', () => {
        const d = createDying(256, lanes());
        trackBodies(d, frame([{ slot: 3, genome: 30, x: 100, speed: 5 }]), 100);
        trackBodies(d, frame([]), 100);
        expect(positionOf(d, 0, 50).x).toBe(100);
    });
});

describe('speedShare and driftOf', () => {
    it('start at full speed and no travel, and decay to rest', () => {
        expect(speedShare(0)).toBe(1);
        expect(speedShare(-5)).toBe(1);
        expect(speedShare(DRIFT.decayMs)).toBeCloseTo(Math.exp(-1));
        expect(speedShare(PENDING_MAX_MS)).toBeLessThan(0.1);
        expect(driftOf(0)).toBe(0);
        expect(driftOf(1e6)).toBeCloseTo(DRIFT.decayMs);
    });
});

describe.each(LANE_KINDS)('what a body carries (%s lanes)', (_kind, lanes) => {
    it('keeps the live lanes of its last frame: temperature, state word, flags and heading', () => {
        const d = createDying(256, lanes());
        const a = frame([{ slot: 3, genome: 30 }]);
        a.temperature[0] = 0.4;
        a.state[0] = 0x05000203;
        a.flags[0] = 0x21;
        a.angle[0] = 1.25;
        trackBodies(d, a, 0);
        trackBodies(d, frame([]), 16);
        expect(d.pose[7][0]).toBeCloseTo(0.4);
        expect(d.word[0]).toBe(0x05000203);
        expect(d.flags[0]).toBe(0x21);
        expect(d.bearing[0]).toBeCloseTo(1.25);
    });

    it('takes the bearing a death names and keeps the heading when it names none', () => {
        const d = createDying(256, lanes());
        trackBodies(
            d,
            frame([
                { slot: 3, genome: 30 },
                { slot: 4, genome: 31 },
            ]),
            0,
        );
        trackBodies(d, frame([]), 16);
        beginDeath(d, { genome: 30, cause: 1, nowMs: 40, bearing: -2.5 });
        beginDeath(d, { genome: 31, cause: 1, nowMs: 40 });
        expect(d.bearing[0]).toBeCloseTo(-2.5);
        expect(d.bearing[1]).toBe(0);
    });

    it('finds the playing body of a genome, the newest when it died twice, and none while pending', () => {
        const d = createDying(256, lanes());
        trackBodies(d, frame([{ slot: 3, genome: 30 }]), 0);
        trackBodies(d, frame([]), 16);
        expect(deathBody(d, 30)).toBe(-1);
        beginDeath(d, { genome: 30, cause: 0, nowMs: 40 });
        expect(deathBody(d, 30)).toBe(0);
        trackBodies(d, frame([{ slot: 3, genome: 30 }]), 50);
        trackBodies(d, frame([]), 60);
        beginDeath(d, { genome: 30, cause: 0, nowMs: 90 });
        expect(deathBody(d, 30)).toBe(1);
        expect(deathBody(d, 31)).toBe(-1);
    });
});
