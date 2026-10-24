// Screen wake lock: holds `navigator.wakeLock.request('screen')` while enabled and the tab is visible, requests it
// again on `visibilitychange`, releases it when disabled or hidden, and reports a refusal without throwing.

/**
 * @typedef {object} WakeLockDeps
 * @property {{wakeLock?: {request: (type: 'screen') => Promise<{release: () => Promise<void>}>}} | null} nav the
 *   `navigator` object
 * @property {{hidden: boolean, addEventListener: (type: string, fn: () => void) => void}} doc the `document` object
 * @property {(reason: string) => void} onRefused called when `request('screen')` rejects or is unavailable
 */

/**
 * @param {WakeLockDeps} deps the injected browser objects and refusal callback
 * @returns {{setEnabled: (on: boolean) => void, isEnabled: () => boolean}} controls the screen wake lock
 */
export function createWakeLock({ nav, doc, onRefused }) {
    let enabled = false;
    /** @type {{release: () => Promise<void>} | null} */
    let sentinel = null;

    const release = () => {
        if (sentinel !== null) {
            const held = sentinel;
            sentinel = null;
            void held.release();
        }
    };

    const acquire = () => {
        if (!enabled || doc.hidden) {
            return;
        }
        if (!nav?.wakeLock) {
            onRefused('wakeLock unavailable');
            return;
        }
        nav.wakeLock.request('screen').then(
            (lock) => {
                if (enabled && !doc.hidden) {
                    sentinel = lock;
                } else {
                    void lock.release();
                }
            },
            (err) => onRefused(err instanceof Error ? err.message : String(err)),
        );
    };

    doc.addEventListener('visibilitychange', () => {
        if (doc.hidden) {
            release();
        } else {
            acquire();
        }
    });

    return {
        setEnabled(on) {
            enabled = on;
            if (on) {
                acquire();
            } else {
                release();
            }
        },
        isEnabled: () => enabled,
    };
}
