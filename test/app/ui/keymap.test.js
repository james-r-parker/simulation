import { describe, expect, it } from 'vitest';
import { actionForKey, KEYMAP, shortcutFor, shortcutLabel } from '../../../js/app/ui/keymap.js';

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

    it('splits the shifted keys: Shift+F is fullscreen, Shift+N the seed field', () => {
        expect(actionForKey({ code: 'KeyF' })).toBe('follow');
        expect(actionForKey({ code: 'KeyF', shiftKey: true })).toBe('fullscreen');
        expect(actionForKey({ code: 'KeyN' })).toBe('newWorld');
        expect(actionForKey({ code: 'KeyN', shiftKey: true })).toBe('focusSeed');
    });

    it('maps the digits 1 to 4 to the four lenses', () => {
        expect(['Digit1', 'Digit2', 'Digit3', 'Digit4'].map((code) => actionForKey({ code }))).toEqual([
            'lens1',
            'lens2',
            'lens3',
            'lens4',
        ]);
    });

    it('maps each phase 3 shortcut to its action', () => {
        expect(actionForKey({ code: 'KeyC' })).toBe('toggleCharts');
        expect(actionForKey({ code: 'KeyI' })).toBe('toggleInspector');
        expect(actionForKey({ code: 'Slash', shiftKey: true })).toBe('toggleHelp');
        expect(actionForKey({ code: 'F1' })).toBe('toggleHelp');
        expect(actionForKey({ code: 'KeyH' })).toBe('toggleHud');
        expect(actionForKey({ code: 'KeyE' })).toBe('exportArchive');
        expect(actionForKey({ code: 'KeyB' })).toBe('exportBundle');
        expect(actionForKey({ code: 'Escape' })).toBe('escape');
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

describe('shortcutLabel', () => {
    it('reads keys as a person does', () => {
        expect(shortcutFor('togglePause')).toBe('Space');
        expect(shortcutFor('focusSeed')).toBe('Shift+N');
        expect(shortcutFor('toggleHelp')).toBe('? or F1');
        expect(shortcutFor('speedUp')).toBe(']');
        expect(shortcutFor('zoomIn')).toBe('+');
        expect(shortcutFor('nothing')).toBe('');
        expect(shortcutLabel({ action: 'x', codes: ['Digit1'], title: '' })).toBe('1');
    });
});
