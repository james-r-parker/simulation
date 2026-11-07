import { describe, expect, it } from 'vitest';
import { CONTROL_BUTTONS } from '../../../js/app/ui/controls.js';
import { KEYMAP } from '../../../js/app/ui/keymap.js';
import { mountOverflowMenu, OVERFLOW_ITEMS } from '../../../js/app/ui/overflow-menu.js';
import { byClass, fakeDocument } from '../helpers/fake-dom.js';

/**
 * @param {{clip?: boolean}} [options] whether clips are supported
 * @returns {any} the menu over a fake page, its button, panel and the actions it ran
 */
function setup(options) {
    const doc = fakeDocument();
    const bar = doc.createElement('div');
    const hud = doc.createElement('div');
    const calls = /** @type {string[]} */ ([]);
    const menu = mountOverflowMenu(doc, { bar, hud }, { perform: (a) => calls.push(a), ...options });
    return {
        doc,
        hud,
        calls,
        menu,
        button: byClass(bar, 'control-overflow')[0],
        panel: byClass(hud, 'overflow-menu')[0],
    };
}

describe('mountOverflowMenu', () => {
    it('lists keymap actions that have no top-bar button, including the ones the doc names', () => {
        const keyed = new Set(KEYMAP.map((b) => b.action));
        const buttoned = new Set(CONTROL_BUTTONS.map((b) => b.action));
        const actions = OVERFLOW_ITEMS.map((i) => i.action);
        for (const action of actions) {
            expect(keyed.has(action), action).toBe(true);
            expect(buttoned.has(action), action).toBe(false);
        }
        expect(actions).toEqual(
            expect.arrayContaining([
                'step10',
                'lens1',
                'lens2',
                'lens3',
                'lens4',
                'screenshot',
                'recordClip',
                'exportArchive',
                'exportBundle',
                'toggleAudio',
                'toggleWakeLock',
                'fullscreen',
                'toggleHud',
            ]),
        );
    });

    it('starts closed, toggles on the button, and gives each item its shortcut in the title', () => {
        const { button, panel, hud } = setup();
        expect(panel.hidden).toBe(true);
        expect(button.getAttribute('aria-expanded')).toBe('false');
        button.dispatch('click');
        expect(panel.hidden).toBe(false);
        expect(button.getAttribute('aria-expanded')).toBe('true');
        expect(byClass(hud, 'overflow-screenshot')[0].getAttribute('title')).toBe(
            'Screenshot with a caption plate (P)',
        );
        button.dispatch('click');
        expect(panel.hidden).toBe(true);
    });

    it('runs an item and closes', () => {
        const { button, panel, hud, calls } = setup();
        button.dispatch('click');
        byClass(hud, 'overflow-lens2')[0].dispatch('click');
        expect(calls).toEqual(['lens2']);
        expect(panel.hidden).toBe(true);
    });

    it('closes on Escape and on a press outside, but not on a press inside or on the button', () => {
        const { doc, button, panel, hud } = setup();
        const item = byClass(hud, 'overflow-lens1')[0];
        button.dispatch('click');
        doc.dispatch('pointerdown', { target: item });
        doc.dispatch('pointerdown', { target: button });
        doc.dispatch('keydown', { key: 'a' });
        expect(panel.hidden).toBe(false);
        doc.dispatch('keydown', { key: 'Escape' });
        expect(panel.hidden).toBe(true);
        button.dispatch('click');
        doc.dispatch('pointerdown', { target: hud });
        expect(panel.hidden).toBe(true);
    });

    it('leaves out the clip item when clips are unsupported', () => {
        const { hud } = setup({ clip: false });
        expect(byClass(hud, 'overflow-recordClip')).toEqual([]);
        expect(byClass(hud, 'overflow-screenshot')).toHaveLength(1);
    });

    it('opens, toggles and closes through the returned controls', () => {
        const { menu, panel, button } = setup();
        expect(menu.open()).toBe(false);
        menu.toggle();
        expect(menu.open()).toBe(true);
        expect(panel.hidden).toBe(false);
        expect(button.getAttribute('aria-expanded')).toBe('true');
        menu.close();
        expect(menu.open()).toBe(false);
        menu.toggle();
        menu.toggle();
        expect(panel.hidden).toBe(true);
    });
});
