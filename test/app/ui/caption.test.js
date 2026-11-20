import { describe, expect, it } from 'vitest';
import { mountCaption } from '../../../js/app/ui/caption.js';
import { fakeDocument } from '../helpers/fake-dom.js';

describe('mountCaption', () => {
    it('shows text with the on class, keeps the text while it fades and writes only changes', () => {
        const doc = fakeDocument();
        const parent = doc.createElement('body');
        const caption = mountCaption(doc, parent);
        expect(parent.children).toEqual([caption.element]);
        expect(caption.element.classList.contains('caption-on')).toBe(false);
        expect(caption.set('Kill')).toBe(true);
        expect(caption.set('Kill')).toBe(false);
        expect(caption.element.textContent).toBe('Kill');
        expect(caption.element.classList.contains('caption-on')).toBe(true);
        expect(caption.set('')).toBe(true);
        expect(caption.element.textContent).toBe('Kill');
        expect(caption.element.classList.contains('caption-on')).toBe(false);
    });
});
