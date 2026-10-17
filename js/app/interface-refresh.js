// What `tick` refreshes, each part at its own rate: the idle fade, the pixel shift, the top bar, the hover tag, the
// title card, the ticker, the inspector and the charts. Works on the interface's shared parts.

import { lookback } from './history.js';
import { dismissCard } from './interface-visit.js';
import { peekView } from './ui/hover-peek.js';
import { persistentNodes } from './ui/hud-fade.js';
import { inspectorView, NO_INSPECTION } from './ui/inspector-data.js';
import { applyPixelShift } from './ui/pixel-shift.js';
import { trendWord } from './ui/status-line.js';
import { topBarInput, topBarView } from './ui/top-bar.js';

/** How often each part refreshes, in ms. */
export const REFRESH_MS = Object.freeze({
    bar: 250,
    ticker: 100,
    inspector: 33,
    charts: 1000,
    idle: 100,
    shift: 1000,
    card: 250,
    peek: 50,
});

/**
 * @param {Record<string, any>} ctx the shared parts
 * @param {Record<string, any> | null} client the worker client
 * @returns {'growing' | 'shrinking' | 'steady'} the population trend over the last minute, from the history
 */
function populationTrend(ctx, client) {
    const data = ctx.chartData.data();
    const now = client?.latest?.u32?.[1];
    if (data === null || now === undefined) {
        return 'steady';
    }
    return trendWord(now, lookback(data.history, { series: 'population', agoMs: 60000 }));
}

/**
 * Shows the hover tag once the pointer has rested over an agent, and hides it otherwise or while a drawer is open.
 * @param {Record<string, any>} ctx the shared parts
 * @param {number} now wall time in ms
 * @returns {void}
 */
function refreshPeek(ctx, now) {
    const { deps, peek, peekTracker } = ctx;
    const ready = deps.getReady();
    const at = peekTracker.position();
    const hit =
        ctx.drawers.state() === null && ready !== null && peekTracker.rested(now)
            ? deps.pickAt(deps.toDevice(at))
            : null;
    if (hit === null) {
        peek.hide();
        return;
    }
    peek.show(peekView(hit, { info: ready.info, layout: ready.layout, seed: ready.seed, slots: deps.slots }), at);
}

/** What `tick` refreshes: a part, when it needs it, and how. */
const REFRESHERS = Object.freeze([
    {
        key: 'idle',
        wanted: () => true,
        run: (/** @type {Record<string, any>} */ ctx) => ctx.fade.tick(ctx.idle.idleMs()),
    },
    {
        key: 'shift',
        wanted: () => true,
        run(/** @type {Record<string, any>} */ ctx, /** @type {number} */ now) {
            applyPixelShift(
                persistentNodes({ ...ctx.deps.elements, title: ctx.card.element }),
                now / 1000,
                ctx.shifted,
            );
        },
    },
    {
        key: 'bar',
        wanted: () => true,
        run(/** @type {Record<string, any>} */ ctx) {
            const client = ctx.deps.getClient();
            const paused = client?.paused ?? false;
            const view = topBarView(topBarInput(client, populationTrend(ctx, client)), ctx.deps.state, paused);
            ctx.barUpdate(view);
            ctx.help.setDebug(view.debug);
            ctx.controls.update({ paused, seed: ctx.deps.getReady()?.seed ?? null, drawer: ctx.drawers.state() });
        },
    },
    {
        key: 'peek',
        wanted: () => true,
        run: (/** @type {Record<string, any>} */ ctx, /** @type {number} */ now) => refreshPeek(ctx, now),
    },
    {
        key: 'card',
        wanted: (/** @type {Record<string, any>} */ ctx) => ctx.card.visible(),
        run(/** @type {Record<string, any>} */ ctx, /** @type {number} */ now) {
            if (ctx.card.expired(now)) {
                dismissCard(ctx);
            }
        },
    },
    {
        key: 'ticker',
        wanted: () => true,
        run: (/** @type {Record<string, any>} */ ctx, /** @type {number} */ now) =>
            ctx.tickerUpdate(ctx.queue.current(now), now),
    },
    {
        key: 'inspector',
        wanted: (/** @type {Record<string, any>} */ ctx) => ctx.drawers.state() === 'inspector',
        run(/** @type {Record<string, any>} */ ctx) {
            const snapshot = ctx.deps.getClient()?.latest;
            const ready = ctx.deps.getReady();
            ctx.inspector.update(
                snapshot && ready ? inspectorView({ snapshot, ready, slots: ctx.deps.slots }) : NO_INSPECTION,
            );
        },
    },
    {
        key: 'charts',
        wanted: (/** @type {Record<string, any>} */ ctx) => ctx.drawers.state() === 'charts',
        run: (/** @type {Record<string, any>} */ ctx) => ctx.charts.update(),
    },
]);

/**
 * Refreshes every part that is due.
 * @param {Record<string, any>} ctx the shared parts, whose `last` times this updates
 * @param {number} nowMs wall time
 * @returns {void}
 */
export function refreshParts(ctx, nowMs) {
    for (const part of REFRESHERS) {
        if (
            part.wanted(ctx) &&
            nowMs - ctx.last[part.key] >= REFRESH_MS[/** @type {keyof typeof REFRESH_MS} */ (part.key)]
        ) {
            ctx.last[part.key] = nowMs;
            part.run(ctx, nowMs);
        }
    }
}
