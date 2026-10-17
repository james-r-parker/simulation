import { describe, expect, it } from 'vitest';
import { drawerReducer, mountDrawers } from '../../../js/app/ui/drawer.js';
import { byClass, fakeDocument } from '../helpers/fake-dom.js';

describe('drawerReducer', () => {
    it('opens one drawer and replaces it with another', () => {
        expect(drawerReducer(null, { type: 'open', drawer: 'charts' })).toBe('charts');
        expect(drawerReducer('charts', { type: 'open', drawer: 'help' })).toBe('help');
    });

    it('toggles: the same drawer closes, another opens', () => {
        expect(drawerReducer('help', { type: 'toggle', drawer: 'help' })).toBeNull();
        expect(drawerReducer('help', { type: 'toggle', drawer: 'inspector' })).toBe('inspector');
        expect(drawerReducer(null, { type: 'toggle', drawer: 'inspector' })).toBe('inspector');
    });

    it('closes only the named drawer, or whichever is open', () => {
        expect(drawerReducer('charts', { type: 'close', drawer: 'help' })).toBe('charts');
        expect(drawerReducer('charts', { type: 'close', drawer: 'charts' })).toBeNull();
        expect(drawerReducer('charts', { type: 'closeAll' })).toBeNull();
    });

    it('throws naming an unknown drawer', () => {
        expect(() => drawerReducer(null, { type: 'open', drawer: 'maps' })).toThrow(/unknown drawer "maps"/);
    });
});

describe('mountDrawers', () => {
    it('shows one panel at a time and calls the hooks with the panel body', () => {
        const root = fakeDocument().createElement('div');
        const calls = /** @type {string[]} */ ([]);
        const drawers = mountDrawers(fakeDocument(), root, {
            onOpen: (name, body) => calls.push(`open ${name} ${body.className}`),
            onClose: (name) => calls.push(`close ${name}`),
        });
        expect(root.children).toHaveLength(3);
        drawers.dispatch({ type: 'toggle', drawer: 'charts' });
        drawers.dispatch({ type: 'toggle', drawer: 'inspector' });
        drawers.dispatch({ type: 'closeAll' });
        drawers.dispatch({ type: 'closeAll' });
        expect(calls).toEqual([
            'open charts drawer drawer-charts',
            'close charts',
            'open inspector drawer drawer-inspector',
            'close inspector',
        ]);
        expect(drawers.state()).toBeNull();
        const [panel] = byClass(root, 'drawer-charts');
        expect(panel.classList.contains('open')).toBe(false);
        expect(panel.getAttribute('aria-hidden')).toBe('true');
    });

    it('marks the open panel visible to assistive technology', () => {
        const root = fakeDocument().createElement('div');
        const drawers = mountDrawers(fakeDocument(), root);
        drawers.dispatch({ type: 'open', drawer: 'help' });
        expect(drawers.body('help').getAttribute('aria-hidden')).toBe('false');
        expect(drawers.body('help').classList.contains('open')).toBe(true);
    });
});
