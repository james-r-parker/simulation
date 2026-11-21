import { describe, expect, it } from 'vitest';
import { mountScenesTab, NO_SIGNAL, sceneTableRows } from '../../../js/app/ui/insights-scenes.js';
import { byClass, fakeDocument } from '../helpers/fake-dom.js';

const SCENES = [
    { name: 'A real chase', signal: 'pursuits begun', count: 12, genomeId: 70, x: 5, y: 6, seen: true },
    { name: 'Abort', signal: 'pursuits dropped without a bite', count: 0, genomeId: 0, x: 0, y: 0, seen: false },
    { name: 'Refuge', signal: 'prey stacking into a refuge', count: 2, genomeId: 0, x: 9, y: 8, seen: true },
    { name: 'Leave a dying patch', signal: null, count: null, genomeId: 0, x: 0, y: 0, seen: false },
];

describe('sceneTableRows', () => {
    it('shows each count, and no live signal for a scene with none', () => {
        expect(sceneTableRows(SCENES).map((r) => r.cells)).toEqual([
            ['A real chase', '12'],
            ['Abort', '0'],
            ['Refuge', '2'],
            ['Leave a dying patch', NO_SIGNAL],
        ]);
        expect(NO_SIGNAL).toBe('no live signal');
    });

    it('makes a scene clickable only once it has been seen, and mutes one with no signal', () => {
        const rows = sceneTableRows(SCENES);
        expect(rows.map((r) => r.pick)).toEqual([true, false, true, false]);
        expect(rows.map((r) => r.muted)).toEqual([false, false, false, true]);
        expect(rows[0].target).toEqual({ kind: 'scene', name: 'A real chase', genomeId: 70, x: 5, y: 6 });
    });
});

describe('the Scenes tab', () => {
    it('hands the clicked scene to onPick', () => {
        const doc = fakeDocument();
        const panel = doc.createElement('div');
        const picks = /** @type {any[]} */ ([]);
        const tab = mountScenesTab(doc, panel, { onPick: (t) => picks.push(t) });
        tab.update(SCENES);
        const rows = byClass(panel, 'insights-row');
        rows[0].dispatch('click');
        rows[1].dispatch('click');
        rows[3].dispatch('click');
        expect(picks).toEqual([{ kind: 'scene', name: 'A real chase', genomeId: 70, x: 5, y: 6 }]);
        expect(byClass(panel, 'insights-note')[0].textContent).toContain('follow a live instance');
        expect(byClass(panel, 'insights-heading')[0].textContent).toBe('Scenes in the last 4 seasons');
    });
});
