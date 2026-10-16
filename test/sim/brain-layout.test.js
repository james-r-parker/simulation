import { describe, expect, it } from 'vitest';
import { OUTPUT_COUNT, brainLayout } from '../../js/sim/brain-layout.js';
import { createConfig } from '../../js/sim/config.js';

describe('brainLayout', () => {
    it('gives 147 inputs and 5925 weights at the defaults', () => {
        const layout = brainLayout(createConfig());
        expect(layout.inputCount).toBe(147);
        expect(layout.weightCount).toBe(5925);
        expect(layout.outputCount).toBe(OUTPUT_COUNT);
    });

    it('lays the blocks out contiguously in contract order', () => {
        const config = createConfig({ rayCount: 4, brainHidden: 3 });
        const l = brainLayout(config);
        expect(l.wIn).toBe(0);
        expect(l.wRec).toBe(l.inputCount * 3);
        expect(l.bHidden).toBe(l.wRec + 9);
        expect(l.wOut).toBe(l.bHidden + 3);
        expect(l.bOut).toBe(l.wOut + 3 * OUTPUT_COUNT);
        expect(l.weightCount).toBe(l.bOut + OUTPUT_COUNT);
    });

    it('is frozen', () => {
        expect(Object.isFrozen(brainLayout(createConfig()))).toBe(true);
    });
});
