// Every keyboard shortcut as data, and the lookup from a key event to an action. Phase 2 binds pause, step, speed, new
// world and the camera; the later phases add rows.

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
    { action: 'newWorld', codes: ['KeyN'], title: 'New world with a new seed (press twice)' },
    { action: 'follow', codes: ['KeyF'], shift: false, title: 'Follow the selected agent' },
    { action: 'home', codes: ['Home'], title: 'Reset the camera' },
    { action: 'clearSelection', codes: ['Escape'], title: 'Clear the selection' },
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
