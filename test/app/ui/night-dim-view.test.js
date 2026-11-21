import { describe, expect, it } from 'vitest';
import { mountNightDim } from '../../../js/app/ui/night-dim-view.js';
import { fakeDocument } from '../helpers/fake-dom.js';

describe('mountNightDim', () => {
    it('adds one black, pointer-transparent layer that is hidden at full brightness', () => {
        const doc = fakeDocument();
        const parent = doc.createElement('body');
        const view = mountNightDim(doc, parent);
        expect(parent.children).toEqual([view.element]);
        expect(view.element.id).toBe('night-dim');
        expect(view.element.style.pointerEvents).toBe('none');
        expect(view.element.style.background).toBe('#000');
        expect(view.element.style.display).toBe('none');
        expect(view.element.getAttribute('aria-hidden')).toBe('true');
    });

    it('is as opaque as the dim is deep', () => {
        const doc = fakeDocument();
        const view = mountNightDim(doc, doc.createElement('body'));
        view.set(0.55);
        expect(view.element.style.display).toBe('block');
        expect(Number(view.element.style.opacity)).toBeCloseTo(0.45);
        view.set(1);
        expect(view.element.style.display).toBe('none');
    });
});
