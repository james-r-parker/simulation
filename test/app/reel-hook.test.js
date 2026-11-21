import { describe, expect, it } from 'vitest';
import { installReelHook } from '../../js/app/reel-hook.js';

/** @returns {any} a reel part with one clip and a recorder that is running */
function part() {
    const clip = { scene: 'call', tick: 9, score: 2, genomeId: 4, name: 'call-9.webm', url: 'blob:x', blob: {} };
    return { reel: { clips: () => [clip] }, recorder: { running: () => true } };
}

describe('window.__reel', () => {
    it('lists the clips without their blobs, and says whether the recorder runs, in development', () => {
        const target = /** @type {any} */ ({});
        installReelHook(target, { production: false, part: part() });
        expect(target.__reel.recording()).toBe(true);
        expect(target.__reel.clips()).toEqual([
            { scene: 'call', tick: 9, score: 2, genomeId: 4, name: 'call-9.webm', url: 'blob:x' },
        ]);
    });

    it('is not installed in a production build', () => {
        const target = /** @type {any} */ ({});
        installReelHook(target, { production: true, part: part() });
        expect(target.__reel).toBeUndefined();
    });
});
