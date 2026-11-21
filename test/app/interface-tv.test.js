import { describe, expect, it } from 'vitest';
import { mountTv } from '../../js/app/interface-tv.js';
import { fakeDocument } from './helpers/fake-dom.js';

/** @returns {any} the TV part over a fake page */
function setup() {
    const doc = fakeDocument();
    doc.body = doc.createElement('body');
    doc.documentElement = doc.createElement('html');
    const hud = doc.createElement('div');
    const ctx = { deps: { doc, elements: { hud }, state: { tv: false } }, hidden: false, prefs: { dim: 'auto' } };
    return { ctx, hud, doc, tv: mountTv(ctx) };
}

describe('mountTv', () => {
    it('hides the HUD and the cursor in TV mode and restores the viewer HUD choice', () => {
        const { ctx, hud, doc, tv } = setup();
        tv.setTv(true);
        expect(hud.classList.contains('hud-hidden')).toBe(true);
        expect(doc.documentElement.classList.contains('tv-mode')).toBe(true);
        expect(ctx.deps.state.tv).toBe(true);
        tv.setTv(false);
        expect(hud.classList.contains('hud-hidden')).toBe(false);
        expect(ctx.deps.state.tv).toBe(false);
        ctx.hidden = true;
        tv.setTv(true);
        tv.setTv(false);
        expect(hud.classList.contains('hud-hidden')).toBe(true);
    });

    it('clears the caption when TV mode ends', () => {
        const { tv } = setup();
        tv.setTv(true);
        tv.caption.set('Kill');
        tv.setTv(false);
        expect(tv.caption.element.classList.contains('caption-on')).toBe(false);
    });

    it('dims the page by the URL setting, else by the dim preference, once `tick` runs', () => {
        const { ctx, doc, tv } = setup();
        const layer = doc.body.children.find((/** @type {any} */ c) => c.id === 'night-dim');
        tv.tick();
        expect(layer.style.display).toBe('none');
        ctx.deps.dim = 0.5;
        tv.tick();
        expect(layer.style.display).toBe('block');
        expect(Number(layer.style.opacity)).toBeCloseTo(0.5);
        ctx.deps.dim = null;
        ctx.prefs.dim = 0.8;
        tv.tick();
        expect(Number(layer.style.opacity)).toBeCloseTo(0.2);
        ctx.prefs.dim = 'auto';
        tv.tick();
        expect(layer.style.display).toBe('none');
    });
});
