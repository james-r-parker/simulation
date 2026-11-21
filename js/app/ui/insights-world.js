// The insights drawer's World tab: the readings, the population by specialisation, the births and deaths by cause over
// the last four seasons, and the charts of the charts drawer (their root is left for the lifecycle to fill).

import { FLOW_HEADINGS } from '../insights-data.js';
import { mountTable } from './insights-table.js';

/** The columns of the World tab's tables. */
export const READING_COLUMNS = Object.freeze(['reading', 'value']);
export const POPULATION_COLUMNS = Object.freeze(['type', 'alive']);
export const FLOW_COLUMNS = Object.freeze(['cause', ...FLOW_HEADINGS]);

/**
 * @param {{createElement: (tag: string) => any}} doc the document
 * @param {any} panel the tab's element
 * @returns {{update: (view: ReturnType<typeof import('../insights-data.js').worldView>) => void, chartsRoot: any}} `update`
 *   shows the World view; `chartsRoot` is the element the charts are built in
 */
export function mountWorldTab(doc, panel) {
    const readings = mountTable(doc, panel, { className: 'insights-readings', columns: ['', ''] });
    const population = mountTable(doc, panel, { title: 'Population by type', columns: POPULATION_COLUMNS });
    const births = mountTable(doc, panel, { title: 'Births per season', columns: FLOW_COLUMNS });
    const deaths = mountTable(doc, panel, { title: 'Deaths per season', columns: FLOW_COLUMNS });
    const chartsRoot = doc.createElement('div');
    chartsRoot.className = 'insights-charts';
    panel.appendChild(chartsRoot);
    return {
        chartsRoot,
        update(view) {
            readings.update(view.readings.map(([label, value]) => ({ cells: [label, value] })));
            population.update(view.population);
            births.update(view.births);
            deaths.update(view.deaths);
        },
    };
}
