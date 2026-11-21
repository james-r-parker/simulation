import { describe, expect, it } from 'vitest';
import { mountExportTab, NO_REPLAY } from '../../../js/app/ui/insights-export.js';
import { byClass, fakeDocument } from '../helpers/fake-dom.js';

describe('the Export tab', () => {
    it('reports each button to onExport', () => {
        const doc = fakeDocument();
        const panel = doc.createElement('div');
        const heard = /** @type {string[]} */ ([]);
        mountExportTab(doc, panel, { onExport: (what) => heard.push(what) });
        byClass(panel, 'insights-export-csv')[0].dispatch('click');
        byClass(panel, 'insights-export-command')[0].dispatch('click');
        expect(heard).toEqual(['csv', 'command']);
        expect(byClass(panel, 'insights-export-csv')[0].textContent).toBe('Download the tables (CSV)');
        expect(byClass(panel, 'insights-export-command')[0].textContent).toBe('Copy the replay command');
    });

    it('does not need an onExport handler', () => {
        const doc = fakeDocument();
        const panel = doc.createElement('div');
        mountExportTab(doc, panel, {});
        expect(() => byClass(panel, 'insights-export-csv')[0].dispatch('click')).not.toThrow();
    });

    it('shows the replay command with the config it reads, and says there is no world before one', () => {
        const doc = fakeDocument();
        const panel = doc.createElement('div');
        const tab = mountExportTab(doc, panel, {});
        tab.update(null);
        expect(byClass(panel, 'insights-command')[0].textContent).toBe(NO_REPLAY);
        expect(byClass(panel, 'insights-config')[0].textContent).toBe('');
        tab.update({
            command: 'npm run replay -- --seed 5 --ticks 9',
            configFile: 'replay-config.json',
            configJson: '{}',
        });
        expect(byClass(panel, 'insights-command')[0].textContent).toBe('npm run replay -- --seed 5 --ticks 9');
        expect(byClass(panel, 'insights-note')[0].textContent).toBe(
            'Save this as replay-config.json, then run the command from the repo root:',
        );
        expect(byClass(panel, 'insights-config')[0].textContent).toBe('{}');
    });
});
