import { describe, expect, it } from 'vitest';
import { createToaster, MAX_TOASTS, TOAST_MS } from '../../../js/app/ui/toast.js';
import { fakeDocument } from '../helpers/fake-dom.js';

/** @returns {any} the toaster with the fake page and timers it was built over */
function setup() {
    const doc = fakeDocument();
    doc.body = doc.createElement('body');
    const timers = /** @type {{ms: number, run: () => void}[]} */ ([]);
    const toaster = createToaster({ doc, setTimer: (ms, run) => timers.push({ ms, run }) });
    return { doc, body: doc.body, timers, toaster };
}

describe('createToaster', () => {
    it('does not touch the document until the first toast', () => {
        const { body, toaster } = setup();
        expect(body.children).toHaveLength(0);
        toaster.show('x');
        expect(body.children).toHaveLength(1);
    });

    it('shows a toast and removes it after TOAST_MS', () => {
        const { body, timers, toaster } = setup();
        toaster.show('Worker restarted with seed 7');
        const stack = body.children[0];
        expect(stack.children[0].textContent).toBe('Worker restarted with seed 7');
        expect(timers[0].ms).toBe(TOAST_MS);
        timers[0].run();
        expect(stack.children).toHaveLength(0);
        expect(toaster.count()).toBe(0);
    });

    it('keeps at most MAX_TOASTS, dropping the oldest, and survives its timer firing late', () => {
        const { body, timers, toaster } = setup();
        for (let i = 0; i <= MAX_TOASTS; i++) {
            toaster.show(`t${i}`);
        }
        const stack = body.children[0];
        expect(stack.children.map((/** @type {any} */ c) => c.textContent)).toEqual(['t1', 't2', 't3', 't4']);
        timers[0].run();
        expect(stack.children).toHaveLength(MAX_TOASTS);
    });
});
