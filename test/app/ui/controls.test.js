import { describe, expect, it } from 'vitest';
import { buttonTitle, CONTROL_BUTTONS, mountControls } from '../../../js/app/ui/controls.js';
import { KEYMAP } from '../../../js/app/ui/keymap.js';
import { byClass, fakeDocument } from '../helpers/fake-dom.js';

/** @returns {any} controls over a fake page and the calls they made */
function setup() {
    const doc = fakeDocument();
    const root = doc.createElement('div');
    const calls = /** @type {any[]} */ ([]);
    const controls = mountControls(doc, root, {
        perform: (a) => calls.push(a),
        onSeed: (s) => calls.push(`seed ${s}`),
    });
    return { root, calls, controls, field: byClass(root, 'control-seed')[0] };
}

describe('mountControls', () => {
    it('gives every button a title with its shortcut and an aria-label, from the keymap', () => {
        const { root } = setup();
        const buttons = root.children.filter((/** @type {any} */ c) => c.tagName === 'BUTTON');
        expect(buttons).toHaveLength(CONTROL_BUTTONS.length);
        for (const b of buttons) {
            expect(b.getAttribute('aria-label')).toBeTruthy();
            expect(b.getAttribute('title')).toMatch(/\(.+\)$/);
        }
        expect(byClass(root, 'control-togglePause')[0].getAttribute('title')).toBe('Pause or resume (Space)');
        expect(byClass(root, 'control-toggleHelp')[0].getAttribute('title')).toBe('Help (? or F1)');
    });

    it('binds every button to an action the keymap also has', () => {
        const actions = new Set(KEYMAP.map((b) => b.action));
        for (const spec of CONTROL_BUTTONS) {
            expect(actions.has(spec.action), spec.action).toBe(true);
        }
    });

    it('runs the action on click', () => {
        const { root, calls } = setup();
        byClass(root, 'control-speedUp')[0].dispatch('click');
        expect(calls).toEqual(['speedUp']);
    });

    it('shows Resume while paused and marks the open drawer', () => {
        const { root, controls } = setup();
        controls.update({ paused: true, seed: 5, drawer: 'charts' });
        expect(byClass(root, 'control-togglePause')[0].textContent).toBe('Resume');
        expect(byClass(root, 'control-toggleCharts')[0].classList.contains('on')).toBe(true);
        expect(byClass(root, 'control-toggleInspector')[0].classList.contains('on')).toBe(false);
        controls.update({ paused: false, seed: 5, drawer: null });
        expect(byClass(root, 'control-togglePause')[0].textContent).toBe('Pause');
        expect(byClass(root, 'control-toggleCharts')[0].classList.contains('on')).toBe(false);
    });

    it('shows the seed, but not while the field has the keyboard', () => {
        const { field, controls } = setup();
        controls.update({ paused: false, seed: 42, drawer: null });
        expect(field.value).toBe('42');
        field.dispatch('focus');
        field.value = '7';
        controls.update({ paused: false, seed: 43, drawer: null });
        expect(field.value).toBe('7');
        field.dispatch('blur');
        controls.update({ paused: false, seed: 43, drawer: null });
        expect(field.value).toBe('43');
    });

    it('starts a world from a valid seed on Enter and flags an invalid one', () => {
        const { field, calls } = setup();
        field.value = ' 1234 ';
        field.dispatch('keydown', { key: 'Enter' });
        expect(calls).toEqual(['seed 1234']);
        expect(field.classList.contains('invalid')).toBe(false);
        field.value = 'nope';
        field.dispatch('keydown', { key: 'Enter' });
        expect(calls).toHaveLength(1);
        expect(field.classList.contains('invalid')).toBe(true);
    });

    it('moves the keyboard to the field', () => {
        const { field, controls } = setup();
        controls.focusSeed();
        expect(field.focused).toBe(true);
    });

    it('omits brackets from a title when the action has no key', () => {
        expect(buttonTitle({ label: 'Thing', action: 'none' })).toBe('Thing');
    });
});
