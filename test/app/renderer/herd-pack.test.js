import { describe, expect, it } from 'vitest';
import { bakeClips } from '../../../js/app/renderer/clip-sampler.js';
import { CLIPS } from '../../../js/app/renderer/clips.js';
import { createHerdPack, packHerds } from '../../../js/app/renderer/herd-pack.js';
import { createHerdTrack, trackHerds } from '../../../js/app/renderer/herd-track.js';
import { NEON_LIGHTNESS } from '../../../js/app/renderer/palette.js';
import { makeSnapshot } from '../helpers/snapshots.js';

const TABLE = bakeClips(CLIPS);

/** @param {number[][]} herds rows @param {number} timeSec time @returns {ReturnType<typeof createHerdPack>} packed */
function packed(herds, timeSec = 0.3) {
    const track = createHerdTrack(4);
    trackHerds(null, makeSnapshot(1, [], { herds }), 1, { track, runSpeed: 6, radius: 80 });
    const pack = createHerdPack(4);
    packHerds(track, pack, { table: TABLE, radius: 80, timeSec });
    return pack;
}

describe('packHerds', () => {
    it('packs pose, the animal radius and a neon group colour', () => {
        const pack = packed([[10, 20, 0, 0.5, 1.2, 2]]);
        expect(Array.from(pack.pose.slice(0, 4)).map((v) => Math.round(v * 10) / 10)).toEqual([10, 20, 1.2, 80]);
        const rgb = Array.from(pack.neon.slice(0, 3));
        expect((Math.max(...rgb) + Math.min(...rgb)) / 2).toBeCloseTo(NEON_LIGHTNESS, 3);
        expect(pack.count).toBe(1);
    });

    it('dips the head when grazing and swings the legs when running', () => {
        let head = 0;
        let limb = 0;
        for (let t = 0; t < 3; t += 0.1) {
            head = Math.max(head, packed([[0, 0, 0, 0, 0, 0]], t).rig2[3]);
            limb = Math.max(limb, Math.abs(packed([[0, 0, 0, 0.95, 0, 0]], t).rig2[2]));
        }
        expect(head).toBeGreaterThan(0.2);
        expect(limb).toBeGreaterThan(0.6);
    });
});
