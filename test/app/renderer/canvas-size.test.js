import { describe, expect, it } from 'vitest';
import { canvasPixelSize, MAX_PIXEL_RATIO } from '../../../js/app/renderer/canvas-size.js';

const element = { clientWidth: 1920, clientHeight: 1080 };

describe('canvasPixelSize', () => {
    it('uses the device pixel content box when the entry has one', () => {
        const entry = { devicePixelContentBoxSize: [{ inlineSize: 3840, blockSize: 2160 }] };
        expect(canvasPixelSize(entry, element, 2.5)).toEqual({ width: 3840, height: 2160 });
    });

    it('falls back to the client size times the ratio, rounded', () => {
        expect(canvasPixelSize({}, element, 2)).toEqual({ width: 3840, height: 2160 });
        expect(canvasPixelSize({}, { clientWidth: 1001, clientHeight: 563 }, 1.25)).toEqual({
            width: 1251,
            height: 704,
        });
    });

    it('caps the ratio at 2 and floors it at 1', () => {
        expect(MAX_PIXEL_RATIO).toBe(2);
        expect(canvasPixelSize({}, element, 3)).toEqual({ width: 3840, height: 2160 });
        expect(canvasPixelSize({}, element, 0.5)).toEqual({ width: 1920, height: 1080 });
        expect(canvasPixelSize({}, element, 0)).toEqual({ width: 1920, height: 1080 });
    });

    it('never returns a zero size, and ignores an empty box', () => {
        expect(canvasPixelSize({}, { clientWidth: 0, clientHeight: 0 }, 1)).toEqual({ width: 1, height: 1 });
        const entry = { devicePixelContentBoxSize: [{ inlineSize: 0, blockSize: 0 }] };
        expect(canvasPixelSize(entry, element, 1)).toEqual({ width: 1920, height: 1080 });
    });
});
