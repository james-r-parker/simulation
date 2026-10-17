// Toasts: short messages that stack at the bottom left and go after a few seconds. Over an injected `document`, which
// is touched only when the first toast shows, and an injected timer.

/** How long a toast stays, in ms. */
export const TOAST_MS = 5000;
/** The most toasts on screen; a new one pushes the oldest out. */
export const MAX_TOASTS = 4;

/**
 * @param {{doc: {createElement: (tag: string) => any, body?: {appendChild: (c: any) => void}},
 *   setTimer: (ms: number, run: () => void) => unknown, parent?: {appendChild: (c: any) => void}}} deps the document,
 *   the timer and where the stack goes (the body by default)
 * @returns {{show: (text: string) => void, count: () => number}} `show` adds a toast; `count` is how many are showing
 */
export function createToaster({ doc, setTimer, parent }) {
    /** @type {any} */
    let stack = null;
    /** @type {any[]} */
    const live = [];
    return {
        count: () => live.length,
        show(text) {
            if (stack === null) {
                stack = doc.createElement('div');
                stack.className = 'toasts';
                stack.setAttribute('role', 'status');
                (parent ?? doc.body)?.appendChild(stack);
            }
            const toast = doc.createElement('div');
            toast.className = 'toast';
            toast.textContent = text;
            stack.appendChild(toast);
            live.push(toast);
            if (live.length > MAX_TOASTS) {
                live.shift().remove();
            }
            setTimer(TOAST_MS, () => {
                const at = live.indexOf(toast);
                if (at >= 0) {
                    live.splice(at, 1);
                    toast.remove();
                }
            });
        },
    };
}
