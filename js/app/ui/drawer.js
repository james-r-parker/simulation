// Which drawer is open: `charts`, `inspector`, `help` or none, at most one. `drawerReducer` is the whole rule;
// `mountDrawers` owns three panel elements that slide in from the right and reports each open and close.

/** The drawers, in the order the controls list them. */
export const DRAWERS = Object.freeze(['charts', 'inspector', 'help']);

/**
 * @typedef {'charts' | 'inspector' | 'help' | null} DrawerState
 */

/**
 * @param {DrawerState} state the open drawer, null for none
 * @param {{type: 'toggle' | 'open' | 'close' | 'closeAll', drawer?: string}} action what happened: `toggle` opens the
 *   drawer, or closes it when it is the open one; `open` opens it; `close` closes it only if it is the open one;
 *   `closeAll` closes whichever is open
 * @returns {DrawerState} the drawer open afterwards
 * @throws {Error} when the action names a drawer that does not exist
 */
export function drawerReducer(state, action) {
    if (action.type === 'closeAll') {
        return null;
    }
    const drawer = /** @type {DrawerState} */ (action.drawer);
    if (!DRAWERS.includes(/** @type {string} */ (drawer))) {
        throw new Error(`unknown drawer "${action.drawer}", expected one of ${DRAWERS.join(', ')}`);
    }
    switch (action.type) {
        case 'open':
            return drawer;
        case 'close':
            return state === drawer ? null : state;
        default:
            return state === drawer ? null : drawer;
    }
}

/**
 * @param {{createElement: (tag: string) => any}} doc the document
 * @param {{appendChild: (child: any) => void}} root where the panels go
 * @param {{onOpen?: (drawer: string, body: any) => void, onClose?: (drawer: string, body: any) => void}} [hooks]
 *   called when a drawer opens (with its empty body element to fill) and when it closes
 * @returns {{dispatch: (action: Parameters<typeof drawerReducer>[1]) => DrawerState, state: () => DrawerState,
 *   body: (drawer: string) => any}} `dispatch` applies an action and shows the result; `body` is a drawer's element
 */
export function mountDrawers(doc, root, hooks = {}) {
    /** @type {Record<string, any>} */
    const panels = {};
    for (const name of DRAWERS) {
        const panel = doc.createElement('aside');
        panel.className = `drawer drawer-${name}`;
        panel.setAttribute('aria-hidden', 'true');
        panel.setAttribute('aria-label', name);
        root.appendChild(panel);
        panels[name] = panel;
    }
    /** @type {DrawerState} */
    let open = null;
    return {
        state: () => open,
        body: (drawer) => panels[drawer],
        dispatch(action) {
            const next = drawerReducer(open, action);
            if (next !== open) {
                if (open !== null) {
                    panels[open].classList.remove('open');
                    panels[open].setAttribute('aria-hidden', 'true');
                    hooks.onClose?.(open, panels[open]);
                }
                if (next !== null) {
                    panels[next].classList.add('open');
                    panels[next].setAttribute('aria-hidden', 'false');
                    hooks.onOpen?.(next, panels[next]);
                }
                open = next;
            }
            return open;
        },
    };
}
