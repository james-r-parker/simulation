import { describe, expect, it } from 'vitest';
import { createWakeLock } from '../../js/app/wake-lock.js';

/**
 * @param {{supported?: boolean, hidden?: boolean, reject?: unknown}} [options] test options
 * @returns {any} fake browser environment for wake lock tests
 */
function setup({ supported = true, hidden = false, reject = undefined } = {}) {
    let released = 0;
    let requested = 0;
    /** @type {((lock: {release: () => Promise<void>}) => void) | null} */
    let resolvePending = null;
    const listeners = /** @type {Record<string, (() => void)[]>} */ ({});
    const doc = {
        hidden,
        addEventListener(/** @type {string} */ type, /** @type {() => void} */ fn) {
            (listeners[type] ??= []).push(fn);
        },
        setVisibility(/** @type {boolean} */ nextHidden) {
            doc.hidden = nextHidden;
            for (const fn of listeners.visibilitychange ?? []) {
                fn();
            }
        },
    };
    const makeLock = () => ({
        release() {
            released += 1;
            return Promise.resolve();
        },
    });
    const nav = supported
        ? {
              wakeLock: {
                  request(/** @type {'screen'} */ type) {
                      expect(type).toBe('screen');
                      requested += 1;
                      if (reject !== undefined) {
                          return Promise.reject(reject);
                      }
                      if (resolvePending !== null) {
                          return new Promise((resolve) => {
                              resolvePending = resolve;
                          });
                      }
                      return Promise.resolve(makeLock());
                  },
              },
          }
        : {};
    const refused = /** @type {string[]} */ ([]);
    const lock = createWakeLock({ nav, doc, onRefused: (r) => refused.push(r) });
    return {
        lock,
        doc,
        refused,
        makeLock,
        counts: () => ({ requested, released }),
        deferNextRequest() {
            resolvePending = () => {};
            return (/** @type {{release: () => Promise<void>}} */ resolvedLock = makeLock()) => {
                const fn = resolvePending;
                resolvePending = null;
                fn?.(resolvedLock);
            };
        },
    };
}

describe('createWakeLock', () => {
    it('requests a screen wake lock when enabled and visible, and releases it when disabled', async () => {
        const { lock, counts, refused } = setup();
        expect(lock.isEnabled()).toBe(false);
        lock.setEnabled(true);
        expect(lock.isEnabled()).toBe(true);
        await Promise.resolve();
        expect(counts()).toEqual({ requested: 1, released: 0 });
        lock.setEnabled(false);
        expect(lock.isEnabled()).toBe(false);
        expect(counts()).toEqual({ requested: 1, released: 1 });
        lock.setEnabled(false);
        expect(counts()).toEqual({ requested: 1, released: 1 });
        expect(refused).toEqual([]);
    });

    it('waits until the tab is visible to request, releases on hide, and re-acquires on show', async () => {
        const { lock, doc, counts } = setup({ hidden: true });
        lock.setEnabled(true);
        await Promise.resolve();
        expect(counts()).toEqual({ requested: 0, released: 0 });
        doc.setVisibility(false);
        await Promise.resolve();
        expect(counts()).toEqual({ requested: 1, released: 0 });
        doc.setVisibility(true);
        expect(counts()).toEqual({ requested: 1, released: 1 });
        doc.setVisibility(false);
        await Promise.resolve();
        expect(counts()).toEqual({ requested: 2, released: 1 });
    });

    it('releases immediately if disabled before a pending request resolves', async () => {
        const { lock, counts, deferNextRequest } = setup();
        const resolve = deferNextRequest();
        lock.setEnabled(true);
        lock.setEnabled(false);
        resolve();
        await Promise.resolve();
        expect(counts()).toEqual({ requested: 1, released: 1 });
    });

    it('reports refusal without throwing when wakeLock is unavailable or rejects', async () => {
        const unsupported = setup({ supported: false });
        unsupported.lock.setEnabled(true);
        expect(unsupported.refused).toEqual(['wakeLock unavailable']);

        const rejectedErr = setup({ reject: new Error('NotAllowedError') });
        rejectedErr.lock.setEnabled(true);
        await Promise.resolve();
        expect(rejectedErr.refused).toEqual(['NotAllowedError']);

        const rejectedStr = setup({ reject: 'denied' });
        rejectedStr.lock.setEnabled(true);
        await Promise.resolve();
        expect(rejectedStr.refused).toEqual(['denied']);
    });
});
