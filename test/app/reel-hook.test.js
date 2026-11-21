import { describe, expect, it } from 'vitest';
import { installReelHook } from '../../js/app/reel-hook.js';

/** @returns {any} a reel part with one clip and a recorder that is running */
function part() {
    const clip = { scene: 'call', tick: 9, score: 2, genomeId: 4, name: 'call-9.webm', url: 'blob:x', blob: {} };
    return { reel: { clips: () => [clip], pending: () => null }, recorder: { running: () => true } };
}

describe('window.__reel', () => {
    it('lists the clips without their blobs, and says whether the recorder runs', () => {
        const target = /** @type {any} */ ({});
        installReelHook(target, part());
        expect(target.__reel.recording()).toBe(true);
        expect(target.__reel.clips()).toEqual([
            { scene: 'call', tick: 9, score: 2, genomeId: 4, name: 'call-9.webm', url: 'blob:x' },
        ]);
    });

    it('says whether a clip is waiting for its 4 s after the moment', () => {
        const target = /** @type {any} */ ({});
        const waiting = part();
        installReelHook(target, waiting);
        expect(target.__reel.pending()).toBe(false);
        waiting.reel.pending = () => ({ scene: 'call' });
        expect(target.__reel.pending()).toBe(true);
    });
});
