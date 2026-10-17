import { describe, expect, it } from 'vitest';
import { SPARK_FRAGMENT, SPARK_VERTEX } from '../../../js/app/renderer/sparks-shader.js';

describe('spark shader', () => {
    it('reads pose, colour and shape per instance', () => {
        for (const a of ['iPose', 'iColor', 'iShape']) {
            expect(SPARK_VERTEX).toContain(`attribute vec4 ${a}`);
        }
        expect(SPARK_FRAGMENT).toContain('colorspace_fragment');
    });
});
