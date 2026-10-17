// The five charts of the charts drawer, drawn with uPlot. `chartDefs` describes each (its series and how the history
// columns become its data), and `mountCharts` builds the uPlot instances when the drawer opens and destroys them when
// it closes. uPlot is passed in, so nothing here loads it and the tests use a fake.

import { columns } from '../history.js';
import { CAUSE_CSS, lineageCss, NEUTRAL_CSS, specCss } from './css-color.js';
import { RIVER_BANDS, riverSeries, stackLayers } from './chart-data.js';

export { riverSeries };

const AXIS = '#7f8da0';
const GRID = 'rgba(255,255,255,0.07)';
const CHART_HEIGHT = 140;
const DEFAULT_WIDTH = 340;

/**
 * @typedef {object} ChartDef
 * @property {string} id the chart's key
 * @property {string} title the heading
 * @property {(paths: any) => any[]} series the uPlot series after the x series; `paths` is `uPlot.paths`
 * @property {Record<string, any>} [scales] extra scales by name
 * @property {any[]} [axes] the axes after the x axis
 * @property {(cols: Record<string, Float64Array>) => Float64Array[]} data the y arrays for the series
 */

/**
 * @param {number} n a tick value
 * @returns {string} `950`, `12k`, `1.5M`
 */
export function tickLabel(n) {
    const a = Math.abs(n);
    if (a >= 1e6) {
        return `${Math.round(n / 1e5) / 10}M`;
    }
    return a >= 1e4 ? `${Math.round(n / 1e3)}k` : String(Math.round(n * 100) / 100);
}

/**
 * @param {string} label a series label
 * @param {string} color its colour
 * @param {Record<string, any>} [extra] more series fields
 * @returns {Record<string, any>} a uPlot line series
 */
const line = (label, color, extra = {}) => ({ label, stroke: color, width: 1.5, points: { show: false }, ...extra });

/**
 * @param {string} label a series label
 * @param {string} color its colour
 * @param {any} paths `uPlot.paths`
 * @returns {Record<string, any>} a uPlot bar series, filled
 */
const bar = (label, color, paths) => ({
    label,
    stroke: color,
    fill: color,
    width: 0,
    points: { show: false },
    paths: paths.bars({ size: [0.9, 100] }),
});

/**
 * @param {string[]} names history series names, bottom band first
 * @param {number} sign 1 upward, -1 downward
 * @returns {Pick<ChartDef, 'series' | 'data'>} stacked bars: the series highest first, and the cumulative data
 */
function stacked(names, sign) {
    const order = [...names].reverse();
    return {
        series: (paths) =>
            order.map((n) =>
                bar(n.replace(/^(born|died)\./, ''), CAUSE_CSS[names.indexOf(n) % CAUSE_CSS.length], paths),
            ),
        data: (cols) =>
            stackLayers(
                names.map((n) => cols[n]),
                sign,
            ),
    };
}

/**
 * The family river's bands take their colours from whichever lineages the data holds, so its fills read a colour table
 * that `data` rewrites.
 * @returns {ChartDef} the chart
 */
function riverDef() {
    const colors = new Array(RIVER_BANDS + 1).fill(NEUTRAL_CSS);
    return {
        id: 'river',
        title: 'Family river',
        scales: { y: { range: [0, 1] } },
        series: () =>
            colors.map((_, k) => ({
                label: k === 0 ? 'others' : `family ${k}`,
                width: 0,
                points: { show: false },
                fill: () => colors[k],
                stroke: () => colors[k],
            })),
        data(cols) {
            const { layers } = riverSeries(cols);
            const empty = new Float64Array(cols.t.length);
            return colors.map((_, k) => {
                const layer = layers[k];
                colors[k] = layer === undefined || layer.id === null ? NEUTRAL_CSS : lineageCss(layer.id);
                return layer?.top ?? empty;
            });
        },
    };
}

/**
 * @param {string} scale the scale name
 * @returns {any} a right-hand axis for a 0 to 1 scale, labelled in percent
 */
function percentAxis(scale) {
    return {
        scale,
        side: 1,
        stroke: AXIS,
        grid: { show: false },
        values: (/** @type {any} */ _u, /** @type {number[]} */ v) => v.map((x) => `${Math.round(x * 100)}%`),
    };
}

/**
 * @param {string[]} specs the specialisation names
 * @returns {ChartDef} lines of the population of each type
 */
function populationDef(specs) {
    return {
        id: 'population',
        title: 'Population by type',
        series: () => specs.map((n) => line(n, specCss(n))),
        data: (cols) => specs.map((n) => cols[`pop.${n}`]),
    };
}

/**
 * @param {{births: string[], deaths: string[]}} groups the cause names
 * @returns {ChartDef} births stacked up and deaths stacked down
 */
function flowDef({ births, deaths }) {
    const up = stacked(births, 1);
    const down = stacked(deaths, -1);
    return {
        id: 'flow',
        title: 'Births (up) and deaths (down)',
        series: (paths) => [...up.series(paths), ...down.series(paths)],
        data: (cols) => [...up.data(cols), ...down.data(cols)],
    };
}

/** @returns {ChartDef} caught and escaped bite episodes as stacked bars, and the running share caught */
function combatDef() {
    return {
        id: 'combat',
        title: 'Catch against escape',
        scales: { share: { range: [0, 1] } },
        axes: [percentAxis('share')],
        series: (paths) => [
            bar('escaped', CAUSE_CSS[1], paths),
            bar('caught', CAUSE_CSS[3], paths),
            line('share caught', '#fff', { scale: 'share' }),
        ],
        data: (cols) => [...stackLayers([cols.caught, cols.escaped]), cols.caughtShare],
    };
}

/**
 * @param {string[]} specs the specialisation names
 * @returns {ChartDef} the archive's coverage and the cells occupied per type
 */
function archiveDef(specs) {
    return {
        id: 'archive',
        title: 'Archive coverage',
        scales: { cov: { range: [0, 1] } },
        axes: [percentAxis('cov')],
        series: () => [
            line('coverage', '#fff', { scale: 'cov', dash: [4, 4] }),
            ...specs.map((n) => line(n, specCss(n))),
        ],
        data: (cols) => [cols.coverage, ...specs.map((n) => cols[`occupied.${n}`])],
    };
}

/**
 * @param {{births: string[], deaths: string[], specs: string[]}} groups the history names in each chart group
 * @returns {ChartDef[]} the five charts, in drawer order
 */
export function chartDefs(groups) {
    return [populationDef(groups.specs), riverDef(), flowDef(groups), combatDef(), archiveDef(groups.specs)];
}

/**
 * @param {ChartDef} def the chart
 * @param {{UPlot: any, width: number}} context the uPlot class and the width in px
 * @returns {Record<string, any>} the uPlot options
 */
function optionsFor(def, { UPlot, width }) {
    const axis = { stroke: AXIS, grid: { stroke: GRID, width: 1 }, ticks: { show: false }, size: 38 };
    return {
        width,
        height: CHART_HEIGHT,
        cursor: { show: false },
        legend: { live: false },
        scales: { x: { time: false }, ...def.scales },
        axes: [
            { ...axis, values: (/** @type {any} */ _u, /** @type {number[]} */ v) => v.map(tickLabel) },
            { ...axis, values: (/** @type {any} */ _u, /** @type {number[]} */ v) => v.map(tickLabel) },
            ...(def.axes ?? []),
        ],
        series: [{ label: 'tick' }, ...def.series(UPlot.paths)],
    };
}

/**
 * @param {{doc: {createElement: (tag: string) => any}, root: any, UPlot: any, history: import('../history.js').History,
 *   groups: Parameters<typeof chartDefs>[0]}} options the document, the drawer body, the uPlot class, the history and
 *   the series groups
 * @returns {{update: () => void, destroy: () => void}} `update` pushes the history into every chart; `destroy` calls
 *   `destroy` on each instance and empties the body
 */
export function mountCharts({ doc, root, UPlot, history, groups }) {
    const width = Math.max(root.clientWidth ?? 0, 0) || DEFAULT_WIDTH;
    const defs = chartDefs(groups);
    const instances = defs.map((def) => {
        const box = doc.createElement('section');
        box.className = `chart chart-${def.id}`;
        const title = doc.createElement('h3');
        title.textContent = def.title;
        box.appendChild(title);
        root.appendChild(box);
        const cols = columns(history);
        return new UPlot(optionsFor(def, { UPlot, width }), [cols.t, ...def.data(cols)], box);
    });
    return {
        update() {
            const cols = columns(history);
            instances.forEach((u, i) => u.setData([cols.t, ...defs[i].data(cols)]));
        },
        destroy() {
            instances.forEach((u) => u.destroy());
            instances.length = 0;
            root.replaceChildren();
        },
    };
}
