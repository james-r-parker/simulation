// The insights drawer's part of the interface: the drawer over the data it reads (the stats messages and the app's own
// history), its tab, and the charts of its World tab. It works at the stats rate while open and costs nothing while
// closed. Reads; never reaches the sim.

import { appLog } from './app-log.js';
import { createChartsLifecycle } from './interface-charts.js';
import { createInsightsData, noteInsightStats, readyInsights, worldView } from './insights-data.js';
import { familyCss } from './ui/css-color.js';
import { mountInsights } from './ui/insights.js';

/** The drawer's name in `drawer.js`. */
export const INSIGHTS_DRAWER = 'insights';

/**
 * @param {Record<string, any>} ctx the interface's shared parts: `deps`, `prefs`, `drawers`, `toast`, `chartData` and
 *   `persist`
 * @returns {{open: () => void, close: () => void, update: () => void, noteReady: (ready: Record<string, any>) => void,
 *   noteStats: (stats: Record<string, any>) => void, ui: ReturnType<typeof mountInsights>, view: () => Record<string, any>}} `open`
 *   and `close` follow the drawer; `update` refreshes the shown tab; the `note` functions feed it what the app hears
 */
export function mountInsightsPart(ctx) {
    const { deps } = ctx;
    const data = createInsightsData();
    /** @type {ReturnType<typeof mountInsights>} */
    const ui = mountInsights(deps.doc, ctx.drawers.body(INSIGHTS_DRAWER), {
        tab: ctx.prefs.insightsTab,
        onTab(id) {
            ctx.prefs.insightsTab = id;
            ctx.persist();
            syncCharts();
        },
    });
    const worldShown = () => ctx.drawers.state() === INSIGHTS_DRAWER && (ui.tab() === 'world' || ui.board());
    const charts = createChartsLifecycle({
        doc: deps.doc,
        drawers: { state: () => (worldShown() ? 'charts' : null), body: () => ui.chartsRoot() },
        loadUPlot: deps.loadUPlot,
        toast: ctx.toast,
        getData: ctx.chartData.data,
        colorOf: (/** @type {number} */ id) => familyCss(deps.slots, id),
    });
    function syncCharts() {
        if (worldShown()) {
            charts.open();
        } else {
            charts.close();
        }
    }
    const view = () => ({ world: worldView(data) });
    return {
        ui,
        view,
        open() {
            appLog('info', 'InsightsOpened', { tab: ui.tab(), board: ui.board() });
            ui.update(view());
            syncCharts();
        },
        close: () => charts.close(),
        update() {
            ui.update(view());
            charts.update();
        },
        noteReady(ready) {
            readyInsights(data, ready);
            charts.close();
            syncCharts();
        },
        noteStats: (stats) => noteInsightStats(data, stats),
    };
}
