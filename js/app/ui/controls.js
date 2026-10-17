// The control buttons and the seed field. Every button has a `title` carrying its shortcut and an `aria-label`; the
// shortcut comes from `KEYMAP`, so a button never disagrees with the key. Over an injected document.

import { parseSeed } from '../seed.js';
import { shortcutFor } from './keymap.js';

/** The buttons, in order: the action each runs, its text and its description. */
export const CONTROL_BUTTONS = Object.freeze([
    { action: 'togglePause', text: 'Pause', label: 'Pause or resume' },
    { action: 'step', text: 'Step', label: 'Step one tick while paused' },
    { action: 'speedDown', text: 'Slower', label: 'Slower' },
    { action: 'speedUp', text: 'Faster', label: 'Faster' },
    { action: 'newWorld', text: 'New', label: 'New world with a new seed (press twice)' },
    { action: 'follow', text: 'Follow', label: 'Follow the selected agent' },
    { action: 'toggleCharts', text: 'Charts', label: 'Charts drawer' },
    { action: 'toggleInspector', text: 'Inspect', label: 'Inspector drawer' },
    { action: 'toggleHelp', text: '?', label: 'Help' },
]);

/**
 * @param {{label: string, action: string}} button a button's description and action
 * @returns {string} its title: the description and, in brackets, the shortcut
 */
export function buttonTitle({ label, action }) {
    const keys = shortcutFor(action);
    return keys === '' ? label : `${label} (${keys})`;
}

/**
 * @typedef {object} ControlsView
 * @property {boolean} paused whether the sim is paused
 * @property {number | null} seed the world's seed, null before one is ready
 * @property {string | null} drawer the open drawer, null for none
 */

/**
 * @param {{createElement: (tag: string) => any}} doc the document
 * @param {(seed: number) => void} onSeed called with a valid seed when Enter is pressed
 * @returns {{field: any, typing: () => boolean}} the input element and whether it has the keyboard
 */
function createSeedField(doc, onSeed) {
    const field = doc.createElement('input');
    field.className = 'control-seed';
    field.setAttribute('type', 'text');
    field.setAttribute('inputmode', 'numeric');
    field.setAttribute('spellcheck', 'false');
    field.setAttribute('aria-label', 'World seed');
    field.setAttribute(
        'title',
        `World seed: type a number and press Enter for a new world (${shortcutFor('focusSeed')})`,
    );
    let typing = false;
    field.addEventListener('focus', () => (typing = true));
    field.addEventListener('blur', () => (typing = false));
    field.addEventListener('keydown', (/** @type {any} */ e) => {
        if (e.key === 'Enter') {
            const seed = parseSeed(field.value);
            field.classList.toggle('invalid', seed === null);
            if (seed !== null) {
                onSeed(seed);
            }
        } else if (e.key === 'Escape') {
            field.blur?.();
        }
    });
    return { field, typing: () => typing };
}

/**
 * @param {{createElement: (tag: string) => any}} doc the document
 * @param {{appendChild: (child: any) => void}} root the controls element
 * @param {{perform: (action: string) => void, onSeed: (seed: number) => void}} handlers `perform` runs an action by
 *   name; `onSeed` starts a world from a seed typed into the field and confirmed with Enter
 * @returns {{update: (view: ControlsView) => void, focusSeed: () => void}} `update` shows the paused state, the open
 *   drawer and, unless the field has the keyboard, the seed; `focusSeed` moves the keyboard to the field
 */
export function mountControls(doc, root, { perform, onSeed }) {
    /** @type {Record<string, any>} */
    const buttons = {};
    for (const spec of CONTROL_BUTTONS) {
        const button = doc.createElement('button');
        button.className = `control control-${spec.action}`;
        button.textContent = spec.text;
        button.setAttribute('title', buttonTitle(spec));
        button.setAttribute('aria-label', spec.label);
        button.addEventListener('click', () => perform(spec.action));
        root.appendChild(button);
        buttons[spec.action] = button;
    }
    const seedField = createSeedField(doc, onSeed);
    const { field } = seedField;
    root.appendChild(field);
    return {
        focusSeed() {
            field.focus();
            field.select();
        },
        update({ paused, seed, drawer }) {
            const pauseText = paused ? 'Resume' : 'Pause';
            if (buttons.togglePause.textContent !== pauseText) {
                buttons.togglePause.textContent = pauseText;
            }
            buttons.toggleCharts.classList.toggle('on', drawer === 'charts');
            buttons.toggleInspector.classList.toggle('on', drawer === 'inspector');
            buttons.toggleHelp.classList.toggle('on', drawer === 'help');
            if (!seedField.typing() && seed !== null && field.value !== String(seed)) {
                field.value = String(seed);
                field.classList.remove('invalid');
            }
        },
    };
}
