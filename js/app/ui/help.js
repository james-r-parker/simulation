// The help drawer body: the settings buttons (HUD size and family palette), and every shortcut from `KEYMAP`, one row each, so the help
// can never disagree with the keys.

import { PALETTE_NAMES } from '../prefs.js';
import { KEYMAP, shortcutLabel } from './keymap.js';
import { mountLegend } from './title-card.js';
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
 * Adds a heading and a row of buttons that mark the one in force.
 * @param {{createElement: (tag: string) => any}} doc the document
 * @param {any} root the drawer body
 * @param {{title: string, values: readonly (string | number)[], label: (value: string | number) => string,
 *   current: string | number, onPick: (value: string | number) => void}} group the heading, the choices, how each is
 *   named, the one in force and what a click does
 * @returns {(value: string | number) => void} marks a choice as the one in force
 */
function buttonRow(doc, root, { title, values, label, current, onPick }) {
    add(doc, root, 'h3', 'help-heading').textContent = title;
    const row = add(doc, root, 'div', 'help-sizes');
    /** @type {Map<string | number, any>} */
    const buttons = new Map();
    for (const value of values) {
        const button = add(doc, row, 'button', 'control help-size');
        button.textContent = label(value);
        button.setAttribute('aria-label', `${title} ${button.textContent}`);
        button.addEventListener('click', () => onPick(value));
        buttons.set(value, button);
    }
    const mark = (/** @type {string | number} */ value) => {
        for (const [key, button] of buttons) {
            button.classList.toggle('on', key === value);
        }
    };
    mark(current);
    return mark;
}

/**
 * @param {{createElement: (tag: string) => any, createElementNS: (ns: string, tag: string) => any}} doc the document
 * @param {any} root the help drawer body
 * @param {{current: string | number, onScale: (value: string | number) => void, palette: string,
 *   onPalette: (value: string) => void}} settings the current `uiScale` and palette and what a click on each does
 * @returns {{rows: number, setScale: (value: string | number) => void, setPalette: (value: string) => void,
 *   setLegend: (view: import('./title-card.js').TitleCardView) => void,
 *   setDebug: (debug: {tick: string, elapsed: string}) => void}} the shortcut rows written, the functions that mark
 *   the size and the palette in force, fill the legend at the top, and write the debug lines
 */
export function mountHelp(doc, root, { current, onScale, palette, onPalette }) {
    const legend = add(doc, root, 'div', 'legend help-legend');
    const setScale = buttonRow(doc, root, {
        title: 'HUD size',
        values: UI_SCALES,
        label: (value) => (value === 'auto' ? 'Auto' : `${value}x`),
        current,
        onPick: onScale,
    });
    const setPalette = buttonRow(doc, root, {
        title: 'Family colours',
        values: PALETTE_NAMES,
        label: (value) => String(value).replace('-', ' '),
        current: palette,
        onPick: (value) => onPalette(String(value)),
    });
    add(doc, root, 'h3', 'help-heading').textContent = 'Keyboard';
    const list = add(doc, root, 'dl', 'help-keys');
    for (const binding of KEYMAP) {
        add(doc, list, 'dt', 'help-key').textContent = shortcutLabel(binding);
        add(doc, list, 'dd', 'help-what').textContent = binding.title;
    }
    add(doc, root, 'h3', 'help-heading').textContent = 'Debug';
    const debug = add(doc, root, 'p', 'help-debug');
    const tick = add(doc, debug, 'span', 'help-tick');
    const elapsed = add(doc, debug, 'span', 'help-elapsed');
    return {
        rows: KEYMAP.length,
        setScale,
        setPalette,
        setLegend: (view) => mountLegend(doc, legend, view),
        setDebug(values) {
            if (tick.textContent !== values.tick) {
                tick.textContent = values.tick;
            }
            if (elapsed.textContent !== values.elapsed) {
                elapsed.textContent = values.elapsed;
            }
        },
    };
}
