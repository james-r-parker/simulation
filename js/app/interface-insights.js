// The insights drawer's part of the interface: the drawer over the data it reads (the stats messages and the app's own
// history), its tab, and the charts of its World tab. It works at the stats rate while open and costs nothing while
// closed, except the scene counters, which count effects and frames so a reading is there when the drawer opens. Reads;
// never reaches the sim.

import { appLog } from './app-log.js';
import { createChartsLifecycle } from './interface-charts.js';
import { familyTableRows, recordTableRows } from './insights-lists.js';
import { createInsightsData, noteInsightStats, readyInsights, worldView } from './insights-data.js';
import {
    advanceSeason,
    createSceneCounters,
    noteFrame,
    noteSceneEffect,
    resetSceneCounters,
    sceneRows,
} from './scene-counters.js';
import { familyCss } from './ui/css-color.js';
import { mountInsights } from './ui/insights.js';

/** The drawer's name in `drawer.js`. */
export const INSIGHTS_DRAWER = 'insights';

/**
 * The World tab's charts: built when the drawer is open on the World tab (or the board), destroyed otherwise.
 * @param {Record<string, any>} ctx the interface's shared parts
 * @param {() => ReturnType<typeof mountInsights>} getUi the drawer, which is mounted after this
 * @returns {{sync: () => void, close: () => void, update: () => void}} `sync` builds or destroys them to match the
 *   drawer; `update` pushes the history in
 */
function createWorldCharts(ctx, getUi) {
    const { deps } = ctx;
    const shown = () => ctx.drawers.state() === INSIGHTS_DRAWER && (getUi().tab() === 'world' || getUi().board());
    const charts = createChartsLifecycle({
        doc: deps.doc,
        drawers: { state: () => (shown() ? 'charts' : null), body: () => getUi().chartsRoot() },
        loadUPlot: deps.loadUPlot,
        toast: ctx.toast,
        getData: ctx.chartData.data,
        colorOf: (/** @type {number} */ id) => familyCss(deps.slots, id),
    });
    return {
        sync: () => (shown() ? charts.open() : charts.close()),
        close: charts.close,
        update: charts.update,
    };
}

/**
 * @param {Record<string, any>} deps the interface's deps: `getAgents`
 * @param {ReturnType<typeof createSceneCounters>} scenes the counters
 * @returns {{ticks: number, genome: number, alive: boolean}} the longest pursuit the frame saw, and whether its hunter is
 *   in the frame now
 */
function longestChase(deps, scenes) {
    const { ticks, genome } = scenes.frame.longest;
    const agents = deps.getAgents?.();
    let alive = false;
    for (let i = 0; agents !== undefined && !alive && i < agents.count; i++) {
        alive = agents.genomeId[i] === genome;
    }
    return { ticks, genome, alive: ticks > 0 && alive };
}

/**
 * @param {Record<string, any>} deps the interface's deps: `getAgents` and `getPursuits`
 * @param {ReturnType<typeof createSceneCounters>} scenes the counters
 * @returns {(nowMs: number) => void} reads the frame into the counters; does nothing before the page has agents
 */
function createFrameFeed(deps, scenes) {
    const frame = { agents: /** @type {any} */ (null), pursuits: /** @type {any} */ (null), nowMs: 0, tick: 0 };
    return (nowMs) => {
        const agents = deps.getAgents?.();
        if (agents !== undefined) {
            frame.agents = agents;
            frame.pursuits = deps.getPursuits?.() ?? null;
            frame.nowMs = nowMs;
            frame.tick = scenes.tick;
            noteFrame(scenes, frame);
        }
    };
}

/**
 * @param {Record<string, any>} ctx the interface's shared parts: `deps`, `prefs`, `drawers`, `toast`, `chartData` and
 *   `persist`
 * @returns {{open: () => void, close: () => void, update: () => void, noteReady: (ready: Record<string, any>) => void,
 *   noteStats: (stats: Record<string, any>) => void, noteEffect: (effect: any) => void,
 *   noteFrame: (nowMs: number) => void, ui: ReturnType<typeof mountInsights>, view: () => Record<string, any>}} `open`
 *   and `close` follow the drawer; `update` refreshes the shown tab; the `note` functions feed it what the app hears
 */
export function mountInsightsPart(ctx) {
    const { deps } = ctx;
    const data = createInsightsData();
    const scenes = createSceneCounters();
    const ui = mountInsights(deps.doc, ctx.drawers.body(INSIGHTS_DRAWER), {
        tab: ctx.prefs.insightsTab,
        hooks: { onPick: (target) => deps.followTarget?.(target) },
        onTab(id) {
            ctx.prefs.insightsTab = id;
            ctx.persist();
            charts.sync();
        },
    });
    const charts = createWorldCharts(ctx, () => ui);
    const view = () => ({
        world: worldView(data),
        scenes: sceneRows(scenes, data.stats?.tick ?? scenes.tick),
        families: familyTableRows(data, (id) => familyCss(deps.slots, id)),
        records: recordTableRows(data, longestChase(deps, scenes)),
    });
    return {
        ui,
        view,
        open() {
            appLog('info', 'InsightsOpened', { tab: ui.tab(), board: ui.board() });
            ui.update(view());
            charts.sync();
        },
        close: charts.close,
        update() {
            ui.update(view());
            charts.update();
        },
        noteReady(ready) {
            readyInsights(data, ready);
            resetSceneCounters(scenes, ready);
            charts.close();
            charts.sync();
        },
        noteStats(stats) {
            noteInsightStats(data, stats);
            advanceSeason(scenes, stats.tick);
        },
        noteEffect: (effect) => noteSceneEffect(scenes, effect),
        noteFrame: createFrameFeed(deps, scenes),
    };
}
