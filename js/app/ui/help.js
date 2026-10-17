// The help drawer body: the settings buttons (HUD size), and every shortcut from `KEYMAP`, one row each, so the help
// can never disagree with the keys.

import { KEYMAP, shortcutLabel } from './keymap.js';
import { UI_SCALES } from './ui-scale.js';

/**
 * @param {{createElement: (tag: string) => any}} doc the document
 * @param {any} parent where it goes
 * @param {string} tag the element
 * @param {string} className its class
 * @returns {any} the new element, already appended
 */
function add(doc, parent, tag, className) {
    const node = doc.createElement(tag);
    node.className = className;
    parent.appendChild(node);
    return node;
}

/**
 * @param {{createElement: (tag: string) => any}} doc the document
 * @param {any} root the help drawer body
 * @param {{current: string | number, onScale: (value: string | number) => void}} settings the current `uiScale` and
 *   what a click on a size button does
 * @returns {{rows: number, setScale: (value: string | number) => void}} the shortcut rows written, and `setScale`
 *   to mark the size that is in force
 */
export function mountHelp(doc, root, { current, onScale }) {
    add(doc, root, 'h3', 'help-heading').textContent = 'HUD size';
    const sizes = add(doc, root, 'div', 'help-sizes');
    /** @type {Map<string | number, any>} */
    const buttons = new Map();
    for (const value of UI_SCALES) {
        const button = add(doc, sizes, 'button', 'control help-size');
        button.textContent = value === 'auto' ? 'Auto' : `${value}x`;
        button.setAttribute('aria-label', `HUD size ${button.textContent}`);
        button.addEventListener('click', () => onScale(value));
        buttons.set(value, button);
    }
    const setScale = (/** @type {string | number} */ value) => {
        for (const [key, button] of buttons) {
            button.classList.toggle('on', key === value);
        }
    };
    setScale(current);
    add(doc, root, 'h3', 'help-heading').textContent = 'Keyboard';
    const list = add(doc, root, 'dl', 'help-keys');
    for (const binding of KEYMAP) {
        add(doc, list, 'dt', 'help-key').textContent = shortcutLabel(binding);
        add(doc, list, 'dd', 'help-what').textContent = binding.title;
    }
    return { rows: KEYMAP.length, setScale };
}
