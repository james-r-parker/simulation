import { describe, expect, it } from 'vitest';
import { actionForKey, KEYMAP } from '../../../js/app/ui/keymap.js';

describe('actionForKey', () => {
    it('maps each phase 2 shortcut to its action', () => {
        expect(actionForKey({ code: 'Space' })).toBe('togglePause');
        expect(actionForKey({ code: 'Period' })).toBe('step');
        expect(actionForKey({ code: 'Period', shiftKey: true })).toBe('step10');
        expect(actionForKey({ code: 'BracketLeft' })).toBe('speedDown');
        expect(actionForKey({ code: 'BracketRight' })).toBe('speedUp');
        expect(actionForKey({ code: 'KeyN' })).toBe('newWorld');
        expect(actionForKey({ code: 'Home' })).toBe('home');
        expect(actionForKey({ code: 'NumpadAdd' })).toBe('zoomIn');
        expect(actionForKey({ code: 'Minus' })).toBe('zoomOut');
    });

    it('leaves Shift+F for fullscreen, which a later phase binds', () => {
        expect(actionForKey({ code: 'KeyF' })).toBe('follow');
        expect(actionForKey({ code: 'KeyF', shiftKey: true })).toBeNull();
    });

    it('ignores unbound keys and modified keys', () => {
        expect(actionForKey({ code: 'KeyQ' })).toBeNull();
        expect(actionForKey({ code: 'Space', ctrlKey: true })).toBeNull();
        expect(actionForKey({ code: 'KeyN', metaKey: true })).toBeNull();
        expect(actionForKey({ code: 'KeyN', altKey: true })).toBeNull();
    });

    it('ignores events aimed at a button, input, textarea or select', () => {
        for (const tagName of ['BUTTON', 'INPUT', 'TEXTAREA', 'SELECT']) {
            expect(actionForKey({ code: 'Space', target: { tagName } })).toBeNull();
        }
        expect(actionForKey({ code: 'Space', target: { tagName: 'DIV' } })).toBe('togglePause');
    });

    it('binds no key twice', () => {
        const seen = new Set();
        for (const b of KEYMAP) {
            for (const code of b.codes) {
                const key = `${code}/${b.shift ?? 'any'}`;
                expect(seen.has(key), key).toBe(false);
                seen.add(key);
            }
        }
    });
});
