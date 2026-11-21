import { describe, expect, it } from 'vitest';
import { AFTER_MS, BEFORE_MS, clipName } from '../../js/app/reel-format.js';

describe('the reel clip format', () => {
    it('names a clip by its scene and tick', () => {
        expect(clipName('chase', 1234)).toBe('chase-1234.webm');
    });

    it('cuts 6 s before the moment and 4 s after, 10 s in all', () => {
        expect(BEFORE_MS).toBe(6000);
        expect(AFTER_MS).toBe(4000);
    });
});
