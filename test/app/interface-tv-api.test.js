import { describe, expect, it } from 'vitest';
import { PREFS_KEY } from '../../js/app/prefs.js';
import { byClass } from './helpers/fake-dom.js';
import { ready, setup } from './helpers/interface-setup.js';

describe('the interface TV api', () => {
    it('switches TV mode, sets the caption and reports idle time, the idle preference and a reset', () => {
        const { ui, elements, doc, setClock } = setup({
            stored: { [PREFS_KEY]: JSON.stringify({ seen: true, tvIdleMinutes: 7 }) },
        });
        expect(ui.tvIdleMinutes()).toBe(7);
        ui.setTv(true);
        expect(elements.hud.classList.contains('hud-hidden')).toBe(true);
        ui.setCaption('Kill');
        const caption = doc.body.children.find((/** @type {any} */ c) => c.id === 'caption');
        expect(caption.textContent).toBe('Kill');
        setClock(5000);
        expect(ui.idleMs()).toBe(5000);
        ui.resetIdle();
        expect(ui.idleMs()).toBe(0);
        ui.setTv(false);
        expect(elements.hud.classList.contains('hud-hidden')).toBe(false);
    });

    it('shows no era card before the world has enough history', () => {
        const { ui, doc } = setup();
        ui.listeners.onReady(ready);
        ui.showEra({ tick: 10, ticksPerSecond: 60 });
        const card = doc.body.children.find((/** @type {any} */ c) => c.id === 'era-card');
        expect(card.classList.contains('era-on')).toBe(false);
        expect(byClass(card, 'era-lines')[0].textContent).toBe('');
    });
});
