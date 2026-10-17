import { describe, expect, it } from 'vitest';
import { inspectorView } from '../../../js/app/ui/inspector-data.js';
import {
    CANVAS_SIZE,
    drawHeatmap,
    drawRadar,
    heatColor,
    HEAT_SMOOTHING,
    mountInspector,
    smoothHidden,
} from '../../../js/app/ui/inspector.js';
import { createFamilySlots } from '../../../js/app/family-slots.js';
import { byClass, fakeDocument } from '../helpers/fake-dom.js';
import { selectedWorld } from '../helpers/inspect-world.js';

/** @returns {any} a 2D context that records its calls */
function recorder() {
    const calls = /** @type {any[][]} */ ([]);
    return new Proxy(
        { calls },
        {
            get: (target, name) =>
                name === 'calls' ? calls : (/** @type {any[]} */ ...args) => calls.push([String(name), ...args]),
            set: (_t, name, value) => (calls.push(['set', String(name), value]), true),
        },
    );
}

describe('heatColor', () => {
    it('is near black at zero, blue below and orange above', () => {
        expect(heatColor(0)).toBe('rgb(18,18,22)');
        expect(heatColor(-1)).toBe('rgb(60,120,255)');
        expect(heatColor(1)).toBe('rgb(255,150,40)');
        expect(heatColor(7)).toBe(heatColor(1));
    });
});

describe('smoothHidden', () => {
    it('moves a quarter of the way to the target each call', () => {
        const shown = Float32Array.of(0, 1);
        smoothHidden(shown, Float32Array.of(1, 0));
        expect(Array.from(shown)).toEqual([HEAT_SMOOTHING, 1 - HEAT_SMOOTHING]);
    });
});

describe('drawRadar', () => {
    it('draws one spoke per ray in its channel colour, longest where the proximity is highest', () => {
        const ctx = recorder();
        const radar = { lengths: Float32Array.of(1, 0.5, 0), channels: Int8Array.of(0, -1, 3) };
        drawRadar(ctx, radar, 100);
        const lineTos = ctx.calls.filter((/** @type {any[]} */ c) => c[0] === 'lineTo');
        expect(lineTos).toHaveLength(3);
        expect(lineTos[0][1]).toBeCloseTo(50);
        expect(lineTos[0][2]).toBeCloseTo(50 - 44);
        expect([lineTos[2][1], lineTos[2][2]]).toEqual([50, 50]);
        const strokes = ctx.calls.filter((/** @type {any[]} */ c) => c[0] === 'set' && c[1] === 'strokeStyle');
        expect(strokes[1][2]).toBe('#5ee6a8');
        expect(strokes[2][2]).toMatch(/^rgba/);
    });
});

describe('drawHeatmap', () => {
    it('fills one cell per hidden unit in the grid', () => {
        const ctx = recorder();
        drawHeatmap(ctx, new Float32Array(16), 80);
        expect(ctx.calls.filter((/** @type {any[]} */ c) => c[0] === 'fillRect')).toHaveLength(16);
        expect(ctx.calls.find((/** @type {any[]} */ c) => c[0] === 'fillRect')).toEqual(['fillRect', 1, 1, 8, 8]);
    });
});

describe('mountInspector', () => {
    const { ready, snapshot } = selectedWorld();
    const view = inspectorView({ snapshot, ready, slots: createFamilySlots() });

    it('shows the empty message for an invalid view and the body for a valid one', () => {
        const doc = fakeDocument();
        const root = doc.createElement('div');
        const inspector = mountInspector(doc, root);
        const empty = byClass(root, 'inspector-empty')[0];
        const body = byClass(root, 'inspector-body')[0];
        inspector.update({ ...view, valid: false });
        expect([empty.hidden, body.hidden]).toEqual([false, true]);
        inspector.update(view);
        expect([empty.hidden, body.hidden]).toEqual([true, false]);
    });

    it('builds a labelled bar for each input and output and a row for each counter, once', () => {
        const doc = fakeDocument();
        const root = doc.createElement('div');
        const inspector = mountInspector(doc, root);
        inspector.update(view);
        const rowsBefore = byClass(root, 'bar-row').length;
        expect(rowsBefore).toBe(32 + 8);
        expect(byClass(root, 'bar-group').map((n) => n.textContent)).toEqual(view.groups.map((g) => g.name));
        expect(byClass(root, 'counter-value')).toHaveLength(view.counters.length);
        inspector.update(view);
        expect(byClass(root, 'bar-row')).toHaveLength(rowsBefore);
    });

    it('lights an output bar only while its action fires, and grows bars from the middle', () => {
        const doc = fakeDocument();
        const root = doc.createElement('div');
        const inspector = mountInspector(doc, root);
        const outputs = view.outputs.map((o, i) => ({ ...o, value: i === 0 ? 0.6 : -0.4, firing: i === 0 }));
        inspector.update({ ...view, outputs });
        const rows = byClass(byClass(root, 'inspector-outputs')[0], 'bar-row');
        expect(rows[0].classList.contains('firing')).toBe(true);
        expect(rows[1].classList.contains('firing')).toBe(false);
        const [fill0] = byClass(rows[0], 'bar-fill');
        const [fill1] = byClass(rows[1], 'bar-fill');
        expect([fill0.style.left, fill0.style.width]).toEqual(['50%', '30%']);
        expect([fill1.style.left, fill1.style.width, fill1.classList.contains('neg')]).toEqual(['30%', '20%', true]);
    });

    it('titles the header with the type, the family and the genome id', () => {
        const doc = fakeDocument();
        const root = doc.createElement('div');
        mountInspector(doc, root).update(view);
        const [title] = byClass(root, 'inspector-title');
        expect(title.textContent).toBe(`${view.header.spec} - ${view.header.familyName} - #${view.header.genomeId}`);
    });

    it('draws both canvases when it has a context, smoothing the heatmap', () => {
        const ctx = recorder();
        const doc = fakeDocument(ctx);
        const root = doc.createElement('div');
        const inspector = mountInspector(doc, root);
        const hot = { ...view, hidden: new Float32Array(view.hidden.length).fill(1) };
        inspector.update(hot);
        expect(ctx.calls.some((/** @type {any[]} */ c) => c[0] === 'fillRect')).toBe(true);
        const first = ctx.calls.find(
            (/** @type {any[]} */ c) => c[0] === 'set' && c[1] === 'fillStyle' && c[2] !== '#fff',
        );
        expect(first?.[2]).toBe(heatColor(HEAT_SMOOTHING));
        expect(byClass(root, 'inspector-radar')[0].width).toBe(CANVAS_SIZE);
    });
});
