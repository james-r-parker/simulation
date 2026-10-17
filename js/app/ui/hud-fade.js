// The HUD fade: after 30 s without input the top bar, the ticker and the toasts fade out and the cursor hides, in every
// mode, so a screen left on does not hold the same bright pixels. Any input brings them back. `createHudFade` is the
// rule; the fade itself is a CSS transition on the class it toggles.

/** Idle time before the HUD fades, in ms. */
export const HUD_IDLE_MS = 30000;

/**
 * @param {{apply: (idle: boolean) => void, idleAfterMs?: number}} options `apply` is called with true when the HUD
 *   should fade and false when it should return; `idleAfterMs` defaults to `HUD_IDLE_MS`
 * @returns {{tick: (idleMs: number) => boolean}} `tick` takes the idle time and returns whether it changed the state
 */
export function createHudFade({ apply, idleAfterMs = HUD_IDLE_MS }) {
    let idle = false;
    return {
        tick(idleMs) {
            const next = idleMs >= idleAfterMs;
            if (next === idle) {
                return false;
            }
            idle = next;
            apply(next);
            return true;
        },
    };
}

/**
 * @param {Record<string, any>} nodes the page's nodes by name: `bar`, `ticker`, and any of `caption`, `era` and `title`
 * @returns {any[]} the nodes that stay on screen and so take the pixel shift: the ones that exist
 */
export function persistentNodes(nodes) {
    return ['bar', 'ticker', 'caption', 'era', 'title']
        .map((name) => nodes[name])
        .filter((node) => node !== null && node !== undefined);
}
