// The overflow menu: a button at the end of the top bar that opens a panel of every `KEYMAP` action the bar has no
// button for (the lenses, step ten, screenshot, clip, the exports, audio, wake lock, fullscreen and the HUD), so a
// touch screen reaches what a keyboard reaches. Over an injected document. Each item's title carries its shortcut.

import { buttonTitle } from './controls.js';

/** The menu's items, in order: the action each runs, its text and its description. */
export const OVERFLOW_ITEMS = Object.freeze([
    { action: 'step10', text: 'Step 10', label: 'Step ten ticks (paused)' },
    { action: 'lens1', text: 'Temperature', label: 'Temperature lens' },
    { action: 'lens2', text: 'Scent trails', label: 'Scent trails lens' },
    { action: 'lens3', text: 'Territories', label: 'Family territories lens' },
    { action: 'lens4', text: 'Vision and calls', label: 'Vision and calls lens' },
    { action: 'screenshot', text: 'Screenshot', label: 'Screenshot with a caption plate' },
    { action: 'recordClip', text: 'Record clip', label: 'Record a 15 s clip' },
    { action: 'exportArchive', text: 'Export archive', label: 'Export the archive' },
    { action: 'exportBundle', text: 'Debug bundle', label: 'Download the debug bundle' },
    { action: 'toggleAudio', text: 'Audio', label: 'Audio on or off' },
    { action: 'toggleWakeLock', text: 'Wake lock', label: 'Wake lock on or off' },
    { action: 'fullscreen', text: 'Fullscreen', label: 'Fullscreen' },
    { action: 'toggleHud', text: 'Hide HUD', label: 'Hide or show the HUD' },
]);

/**
 * @param {any} node a node, or undefined
 * @param {any} root the node to look for among its ancestors
 * @returns {boolean} whether `node` is `root` or inside it (reads `parentNode`, or `parent` on a test double)
 */
function within(node, root) {
    for (let n = node; n !== undefined && n !== null; n = n.parentNode ?? n.parent) {
        if (n === root) {
            return true;
        }
    }
    return false;
}

/**
 * @param {{createElement: (tag: string) => any, addEventListener: (type: string, fn: (e?: any) => void) => void}} doc
 *   the document
 * @param {{bar: {appendChild: (child: any) => void}, hud: {appendChild: (child: any) => void}}} roots `bar` takes the
 *   button; `hud` takes the panel, which is fixed beside the bar because the bar scrolls on a narrow screen
 * @param {{perform: (action: string) => void, clip?: boolean}} handlers `perform` runs an action by name; `clip` false
 *   (no `MediaRecorder`) leaves out the clip item
 * @returns {{open: () => boolean, toggle: () => void, close: () => void}} the menu's state and controls
 */
export function mountOverflowMenu(doc, { bar, hud }, { perform, clip = true }) {
    const button = doc.createElement('button');
    button.className = 'control control-overflow';
    button.textContent = '⋯';
    button.setAttribute('title', 'More actions (lenses, screenshot, exports, audio)');
    button.setAttribute('aria-label', 'More actions');
    button.setAttribute('aria-haspopup', 'true');
    button.setAttribute('aria-expanded', 'false');
    const panel = doc.createElement('div');
    panel.className = 'overflow-menu';
    panel.setAttribute('role', 'menu');
    panel.hidden = true;
    const set = (/** @type {boolean} */ open) => {
        panel.hidden = !open;
        button.setAttribute('aria-expanded', String(open));
        button.classList.toggle('on', open);
    };
    for (const item of OVERFLOW_ITEMS.filter((i) => clip || i.action !== 'recordClip')) {
        const entry = doc.createElement('button');
        entry.className = `control overflow-item overflow-${item.action}`;
        entry.textContent = item.text;
        entry.setAttribute('role', 'menuitem');
        entry.setAttribute('title', buttonTitle(item));
        entry.setAttribute('aria-label', item.label);
        entry.addEventListener('click', () => {
            set(false);
            perform(item.action);
        });
        panel.appendChild(entry);
    }
    button.addEventListener('click', () => set(panel.hidden));
    doc.addEventListener('pointerdown', (e) => {
        if (!panel.hidden && !within(e?.target, button) && !within(e?.target, panel)) {
            set(false);
        }
    });
    doc.addEventListener('keydown', (e) => {
        if (!panel.hidden && e?.key === 'Escape') {
            set(false);
        }
    });
    bar.appendChild(button);
    hud.appendChild(panel);
    return { open: () => !panel.hidden, toggle: () => set(panel.hidden), close: () => set(false) };
}
