// The charts drawer's lifecycle: uPlot is loaded the first time the drawer opens, the charts are built while it is open
// and destroyed when it closes.

import { mountCharts } from './ui/charts.js';

/**
 * @param {{doc: any, drawers: {state: () => string | null, body: (name: string) => any},
 *   loadUPlot: () => Promise<any>, toast: (text: string) => void,
 *   getData: () => {history: import('./history.js').History, sampler: {groups: any}} | null,
 *   colorOf: (lineageId: number) => string}} deps the document, the drawers, the uPlot loader, the toast, the history
 *   of the current world and the family colours
 * @returns {{open: () => void, close: () => void, update: () => void}} `open` builds the charts (after loading uPlot
 *   if needed, and only if the drawer is still open then); `close` destroys them; `update` pushes the history in
 */
export function createChartsLifecycle({ doc, drawers, loadUPlot, toast, getData, colorOf }) {
    /** @type {ReturnType<typeof mountCharts> | null} */
    let mounted = null;
    /** @type {any} */
    let UPlot = null;
    const mount = () => {
        const data = getData();
        if (mounted === null && UPlot !== null && data !== null && drawers.state() === 'charts') {
            mounted = mountCharts({
                doc,
                root: drawers.body('charts'),
                UPlot,
                history: data.history,
                groups: data.sampler.groups,
                colorOf,
            });
        }
    };
    return {
        open() {
            if (UPlot !== null) {
                mount();
                return;
            }
            loadUPlot().then(
                (loaded) => {
                    UPlot = loaded;
                    mount();
                },
                () => toast('The charts could not load'),
            );
        },
        close() {
            mounted?.destroy();
            mounted = null;
        },
        update() {
            mounted?.update();
        },
    };
}
