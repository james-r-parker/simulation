// Every keyboard shortcut as data, and the lookup from a key event to an action. Phase 2 bound pause, step, speed, new
// world and the camera; Phase 3 adds the drawers, help, the HUD, the seed field, fullscreen, the exports and the
// lenses; Phase 4 adds the director, TV mode, audio and the wake lock.

/**
 * @typedef {object} KeyBinding
 * @property {string} action the action name `createActions` performs
 * @property {readonly string[]} codes `KeyboardEvent.code` values that trigger it
 * @property {boolean} [shift] true when the binding needs Shift, false when it needs it up; absent means either
 * @property {string} title what the key does, for button titles and the help drawer
 */

/** @type {readonly KeyBinding[]} */
export const KEYMAP = Object.freeze([
    { action: 'togglePause', codes: ['Space'], title: 'Pause or resume' },
    { action: 'step10', codes: ['Period'], shift: true, title: 'Step ten ticks (paused)' },
    { action: 'step', codes: ['Period'], shift: false, title: 'Step one tick (paused)' },
    { action: 'speedDown', codes: ['BracketLeft'], title: 'Slower' },
    { action: 'speedUp', codes: ['BracketRight'], title: 'Faster' },
    { action: 'newWorld', codes: ['KeyN'], shift: false, title: 'New world with a new seed (press twice)' },
    { action: 'focusSeed', codes: ['KeyN'], shift: true, title: 'Focus the seed field' },
    { action: 'follow', codes: ['KeyF'], shift: false, title: 'Follow the selected agent' },
    { action: 'fullscreen', codes: ['KeyF'], shift: true, title: 'Fullscreen' },
    { action: 'lens1', codes: ['Digit1'], title: 'Temperature lens' },
    { action: 'lens2', codes: ['Digit2'], title: 'Scent trails lens' },
    { action: 'lens3', codes: ['Digit3'], title: 'Family territories lens' },
    { action: 'lens4', codes: ['Digit4'], title: 'Vision and calls lens' },
    { action: 'toggleCharts', codes: ['KeyC'], title: 'Charts drawer' },
    { action: 'toggleInspector', codes: ['KeyI'], title: 'Inspector drawer' },
    { action: 'toggleHelp', codes: ['Slash', 'F1'], title: 'Help' },
    { action: 'toggleHud', codes: ['KeyH'], title: 'Hide or show the HUD' },
    { action: 'toggleWakeLock', codes: ['KeyK'], title: 'Wake lock on or off' },
    { action: 'exportArchive', codes: ['KeyE'], title: 'Export the archive' },
    { action: 'exportBundle', codes: ['KeyB'], title: 'Download the debug bundle' },
    { action: 'home', codes: ['Home'], title: 'Reset the camera' },
    { action: 'escape', codes: ['Escape'], title: 'Close a drawer, else clear the selection' },
    { action: 'panLeft', codes: ['ArrowLeft'], title: 'Pan left' },
    { action: 'panRight', codes: ['ArrowRight'], title: 'Pan right' },
    { action: 'panUp', codes: ['ArrowUp'], title: 'Pan up' },
    { action: 'panDown', codes: ['ArrowDown'], title: 'Pan down' },
    { action: 'zoomIn', codes: ['Equal', 'NumpadAdd'], title: 'Zoom in' },
    { action: 'zoomOut', codes: ['Minus', 'NumpadSubtract'], title: 'Zoom out' },
]);

/** Elements whose own key handling a shortcut must not steal. */
const TYPING_TARGETS = new Set(['BUTTON', 'INPUT', 'TEXTAREA', 'SELECT']);

/**
 * @param {{code: string, shiftKey?: boolean, ctrlKey?: boolean, metaKey?: boolean, altKey?: boolean,
 *   target?: EventTarget | {tagName?: string} | null}} event a key event
 * @returns {string | null} the action it triggers, null when it triggers none: a modified key (Ctrl, Alt, Meta), an
 *   unbound key, or an event whose target is a button, input, textarea or select
 */
export function actionForKey(event) {
    if (
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        TYPING_TARGETS.has(/** @type {{tagName?: string}} */ (event.target)?.tagName ?? '')
    ) {
        return null;
    }
    const shift = event.shiftKey === true;
    const hit = KEYMAP.find((b) => b.codes.includes(event.code) && (b.shift === undefined || b.shift === shift));
    return hit === undefined ? null : hit.action;
}

/** @type {Readonly<Record<string, string>>} */
const KEY_NAMES = Object.freeze({
    Space: 'Space',
    Period: '.',
    BracketLeft: '[',
    BracketRight: ']',
    Slash: '?',
    Equal: '+',
    Minus: '-',
    NumpadAdd: '+',
    NumpadSubtract: '-',
    Escape: 'Esc',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
});

/**
 * @param {string} code a `KeyboardEvent.code`
 * @returns {string} how a person reads it: `KeyN` is `N`, `Digit1` is `1`, `Period` is `.`
 */
function keyName(code) {
    return KEY_NAMES[code] ?? code.replace(/^(Key|Digit)/, '');
}

/**
 * @param {KeyBinding} binding a binding
 * @returns {string} its keys as text for a button title or the help drawer: `Shift+N`, `C`, `? or F1`
 */
export function shortcutLabel(binding) {
    const keys = [...new Set(binding.codes.map(keyName))];
    const prefix = binding.shift === true ? 'Shift+' : '';
    return keys.map((k, i) => (i === 0 ? prefix + k : k)).join(' or ');
}

/**
 * @param {string} action an action name
 * @returns {string} the label of its first binding, empty when it has none
 */
export function shortcutFor(action) {
    const binding = KEYMAP.find((b) => b.action === action);
    return binding === undefined ? '' : shortcutLabel(binding);
}
