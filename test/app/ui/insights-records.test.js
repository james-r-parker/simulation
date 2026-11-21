import { describe, expect, it } from 'vitest';
import { mountRecordsTab } from '../../../js/app/ui/insights-records.js';
import { byClass, fakeDocument } from '../helpers/fake-dom.js';

describe('the Records tab', () => {
    it('shows each record with its holder and hands a clickable one to onPick', () => {
        const doc = fakeDocument();
        const panel = doc.createElement('div');
        const picks = /** @type {any[]} */ ([]);
        const tab = mountRecordsTab(doc, panel, { onPick: (t) => picks.push(t) });
        tab.update([
            { cells: ['longest life', '3.0 seasons', 'blob 11'], pick: true, target: { kind: 'record', genomeId: 11 } },
            { cells: ['most kills', '42', 'blob 12 (gone)'], pick: false, target: { kind: 'record', genomeId: 12 } },
        ]);
        const rows = byClass(panel, 'insights-row');
        rows.forEach((r) => r.dispatch('click'));
        expect(picks).toEqual([{ kind: 'record', genomeId: 11 }]);
        expect(byClass(panel, 'insights-heading')[0].textContent).toBe("This world's records");
        expect(byClass(panel, 'insights-note')[0].textContent).toContain('while the holder is alive');
    });
});
