import { describe, expect, it } from 'vitest';
import { MOTE_FRAGMENT, MOTE_VERTEX } from '../../../js/app/renderer/particles-shader.js';

describe('mote shader', () => {
    it('places points from the seed and time, and keeps alpha in the 0.05 to 0.14 band', () => {
        expect(MOTE_VERTEX).toContain('attribute vec4 seed');
        expect(MOTE_VERTEX).toContain('uTime');
        expect(MOTE_VERTEX).toContain('0.05 + 0.09');
        expect(MOTE_FRAGMENT).toContain('uColor');
    });
});
