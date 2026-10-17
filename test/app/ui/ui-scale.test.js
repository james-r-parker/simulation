import { describe, expect, it } from 'vitest';
import { autoScale, uiScaleFor } from '../../../js/app/ui/ui-scale.js';

describe('autoScale', () => {
    it('is 1 up to 1920 wide and 2 from 3840, in steps of a quarter', () => {
        expect(autoScale(1280)).toBe(1);
        expect(autoScale(1920)).toBe(1);
        expect(autoScale(2560)).toBe(1.25);
        expect(autoScale(3840)).toBe(2);
        expect(autoScale(7680)).toBe(2);
        expect(autoScale(2200)).toBe(1.0);
        expect(autoScale(2400)).toBe(1.25);
    });
});

describe('uiScaleFor', () => {
    it('draws 32 px type on a 3840 wide canvas on auto and 20 px at 1440p', () => {
        expect(uiScaleFor(3840, 'auto')).toBe(32);
        expect(uiScaleFor(2560, 'auto')).toBe(20);
    });

    it('uses a fixed factor whatever the width', () => {
        expect(uiScaleFor(3840, 1)).toBe(16);
        expect(uiScaleFor(1280, 1.5)).toBe(24);
        expect(uiScaleFor(1280, 2)).toBe(32);
    });

    it('falls back to auto for a value that is not a choice', () => {
        expect(uiScaleFor(3840, 3)).toBe(32);
        expect(uiScaleFor(3840, 'big')).toBe(32);
    });
});
