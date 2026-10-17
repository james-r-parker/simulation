import { describe, expect, it } from 'vitest';
import { titleCardView } from '../../../js/app/ui/title-card.js';
import { mountHelp } from '../../../js/app/ui/help.js';
import { KEYMAP, shortcutLabel } from '../../../js/app/ui/keymap.js';
import { UI_SCALES } from '../../../js/app/ui/ui-scale.js';
import { byClass, fakeDocument } from '../helpers/fake-dom.js';

/** @returns {any} a help body mounted over fakes, with the sizes asked for */
function setup() {
    const doc = fakeDocument();
    const root = doc.createElement('div');
    const asked = /** @type {(string | number)[]} */ ([]);
    const help = mountHelp(doc, root, {
        current: 'auto',
        onScale: (v) => asked.push(v),
        palette: 'default',
        onPalette: (v) => asked.push(v),
    });
    return { root, asked, help };
}

describe('mountHelp', () => {
    it('lists every binding with its keys and what it does', () => {
        const { root, help } = setup();
        expect(help.rows).toBe(KEYMAP.length);
        const [list] = byClass(root, 'help-keys');
        expect(list.children).toHaveLength(KEYMAP.length * 2);
        expect(list.children[0].textContent).toBe(shortcutLabel(KEYMAP[0]));
        expect(list.children[1].textContent).toBe(KEYMAP[0].title);
    });

    it('has a button for each HUD size, marks the one in force and reports a click', () => {
        const { root, asked, help } = setup();
        const buttons = byClass(root, 'help-size').slice(0, UI_SCALES.length);
        expect(buttons).toHaveLength(UI_SCALES.length);
        expect(buttons.map((b) => b.classList.contains('on'))).toEqual([true, false, false, false, false]);
        buttons[3].dispatch('click');
        expect(asked).toEqual([1.5]);
        help.setScale(1.5);
        expect(buttons.map((b) => b.classList.contains('on'))).toEqual([false, false, false, true, false]);
        expect(buttons[0].textContent).toBe('Auto');
        expect(buttons[2].textContent).toBe('1.25x');
    });

    it('has a button for each family palette, marks the one in force and reports a click', () => {
        const { root, asked, help } = setup();
        const buttons = byClass(root, 'help-size').slice(UI_SCALES.length);
        expect(buttons.map((b) => b.textContent)).toEqual(['default', 'cvd safe', 'high contrast']);
        expect(buttons.map((b) => b.classList.contains('on'))).toEqual([true, false, false]);
        buttons[1].dispatch('click');
        expect(asked).toEqual(['cvd-safe']);
        help.setPalette('cvd-safe');
        expect(buttons.map((b) => b.classList.contains('on'))).toEqual([false, true, false]);
    });

    it('fills the legend at the top and the debug lines, writing a line only when it changed', () => {
        const { root, help } = setup();
        help.setLegend(titleCardView([{ name: 'predator' }]));
        expect(byClass(root, 'legend-item')).toHaveLength(1);
        expect(root.children[0].className).toContain('help-legend');
        help.setDebug({ tick: 'tick 5', elapsed: '0:01' });
        expect(byClass(root, 'help-tick')[0].textContent).toBe('tick 5');
        expect(byClass(root, 'help-elapsed')[0].textContent).toBe('0:01');
        help.setDebug({ tick: 'tick 6', elapsed: '0:01' });
        expect(byClass(root, 'help-tick')[0].textContent).toBe('tick 6');
    });
});
