import { describe, expect, it } from 'vitest';
import { TWEEN } from '../../../js/app/renderer/body-tweens.js';
import {
    createHalos,
    HALO_ALPHA,
    HALO_LANE_MAX,
    HALO_MS,
    HALO_PX,
    haloAt,
    haloStrength,
} from '../../../js/app/renderer/rim-halo.js';

describe('haloStrength', () => {
    it('rises quickly, falls to nothing at 500 ms and stays there', () => {
        expect(haloStrength(0)).toBe(0);
        expect(haloStrength(HALO_MS * 0.08)).toBeCloseTo(0.92 * 0.92);
        expect(haloStrength(HALO_MS * 0.5)).toBeCloseTo(0.25);
        expect(haloStrength(HALO_MS)).toBe(0);
        expect(haloStrength(HALO_MS * 3)).toBe(0);
        expect(haloStrength(-10)).toBe(0);
        expect(haloStrength(NaN)).toBe(0);
    });

    it('never exceeds 1, and falls monotonically after its peak', () => {
        let last = 1;
        for (let ms = 0; ms <= HALO_MS; ms += 5) {
            const s = haloStrength(ms);
            expect(s).toBeLessThanOrEqual(1);
            if (ms >= HALO_MS * 0.1) {
                expect(s).toBeLessThanOrEqual(last + 1e-12);
                last = s;
            }
        }
    });

    it('keeps the stated caps: 6 px, 500 ms, half opacity at the rim, a lane fraction under 1', () => {
        expect(HALO_PX).toBe(6);
        expect(HALO_MS).toBe(500);
        expect(HALO_ALPHA).toBeLessThanOrEqual(0.5);
        expect(HALO_LANE_MAX).toBeLessThan(1);
    });
});

describe('haloAt', () => {
    /**
     * @param {number} kind a tween kind
     * @param {number} nowMs the wall time
     * @param {number} [start] the tween's start tick
     * @param {number} [genome] the body
     * @returns {{slot: number, genome: number, kind: number, start: number, nowMs: number}} the arguments
     */
    const at = (kind, nowMs, start = 100, genome = 7) => ({ slot: 2, genome, kind, start, nowMs });

    it('lights a kill, both births and a pack call, and nothing else', () => {
        for (const kind of [TWEEN.KILL, TWEEN.BUD, TWEEN.FISSION, TWEEN.HOWL]) {
            const halos = createHalos(4);
            haloAt(halos, at(kind, 1000));
            expect(haloAt(halos, at(kind, 1100)), `kind ${kind}`).toBeGreaterThan(0.3);
        }
        for (const kind of [
            TWEEN.NONE,
            TWEEN.LUNGE,
            TWEEN.FLINCH,
            TWEEN.GULP,
            TWEEN.CALL_THROB,
            TWEEN.COURT,
            TWEEN.SHAKE_OFF,
            TWEEN.BUMP,
            TWEEN.PIT,
        ]) {
            expect(haloAt(createHalos(4), at(kind, 1000)), `kind ${kind}`).toBe(0);
        }
    });

    it('runs on the wall clock from the first sight of the tween, whatever the tick speed', () => {
        const halos = createHalos(4);
        haloAt(halos, at(TWEEN.KILL, 5000));
        expect(haloAt(halos, at(TWEEN.KILL, 5000 + HALO_MS / 2))).toBeCloseTo(0.25);
        expect(haloAt(halos, at(TWEEN.KILL, 5000 + HALO_MS))).toBe(0);
        // the tween is still running (a slow sim): the falloff stays gone
        expect(haloAt(halos, at(TWEEN.KILL, 5000 + 3 * HALO_MS))).toBe(0);
    });

    it('starts again for a new tween in the slot or a new body, and does not carry over', () => {
        const halos = createHalos(4);
        haloAt(halos, at(TWEEN.BUD, 0));
        expect(haloAt(halos, at(TWEEN.BUD, HALO_MS))).toBe(0);
        expect(haloAt(halos, at(TWEEN.KILL, HALO_MS + 50, 140))).toBe(0);
        expect(haloAt(halos, at(TWEEN.KILL, HALO_MS + 100, 140))).toBeGreaterThan(0.5);
        expect(haloAt(halos, at(TWEEN.KILL, HALO_MS + 100, 140, 99))).toBe(0);
        expect(haloAt(halos, at(TWEEN.KILL, HALO_MS + 150, 140, 99))).toBeGreaterThan(0.5);
    });
});
