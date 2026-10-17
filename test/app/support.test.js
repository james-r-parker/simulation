import { describe, expect, it } from 'vitest';
import { unsupportedReason } from '../../js/app/support.js';

const canvasWith = (/** @type {() => unknown} */ getContext) => () => ({ getContext });

describe('unsupportedReason', () => {
    it('is null when workers and WebGL2 exist', () => {
        expect(unsupportedReason({ Worker: class {}, createCanvas: canvasWith(() => ({})) })).toBeNull();
    });

    it('names missing workers', () => {
        expect(unsupportedReason({ Worker: undefined, createCanvas: canvasWith(() => ({})) })).toMatch(/Web Workers/);
    });

    it('names missing WebGL2, whether the context is null or creating it throws', () => {
        expect(unsupportedReason({ Worker: class {}, createCanvas: canvasWith(() => null) })).toMatch(/WebGL2/);
        const throwing = canvasWith(() => {
            throw new Error('no gl');
        });
        expect(unsupportedReason({ Worker: class {}, createCanvas: throwing })).toMatch(/WebGL2/);
    });
});
