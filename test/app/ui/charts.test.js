import { describe, expect, it } from 'vitest';
import { columns, createHistory, pushSample } from '../../../js/app/history.js';
import { chartDefs, mountCharts, riverSeries, tickLabel } from '../../../js/app/ui/charts.js';
import { createSampler } from '../../../js/app/ui/chart-data.js';
import { fakeDocument } from '../helpers/fake-dom.js';

/** @param {number} id @returns {string} a colour per family */
const COLOR_OF = (id) => `hsl(${id * 40} 70% 56%)`;

const WORLD = {
    specs: [
        { index: 0, name: 'predator' },
        { index: 1, name: 'forager' },
    ],
    bornCauses: { INITIAL: 0, MATE: 1, SPLIT: 2 },
    deathCauses: { STARVED: 0, EATEN: 1 },
};

/** A stand-in for uPlot that records what it was given. */
class FakeUPlot {
    static made = /** @type {FakeUPlot[]} */ ([]);
    static paths = { bars: () => 'bars-path' };
    /** @param {any} opts @param {any} data @param {any} box */
    constructor(opts, data, box) {
        this.opts = opts;
        this.data = data;
        this.box = box;
        this.destroyed = false;
        this.sets = 0;
        FakeUPlot.made.push(this);
    }
    /** @param {any} data */
    setData(data) {
        this.data = data;
        this.sets += 1;
    }
    destroy() {
        this.destroyed = true;
    }
}

/** @returns {any} a history filled with a few samples from the sampler, and the sampler */
function filled() {
    const sampler = createSampler(WORLD);
    const history = createHistory({ names: sampler.names, kinds: sampler.kinds, sampleMs: 1 });
    const row = new Float64Array(sampler.names.length);
    for (let i = 0; i < 5; i++) {
        sampler.fill(
            {
                bySpec: [i, 2 * i],
                lineages: {
                    top: [
                        { id: 4, share: 0.5 },
                        { id: 8, share: 0.25 },
                    ],
                },
                birthsByCause: [0, i, 1],
                deathsByCause: [1, i],
                combat: { caught: i, escaped: 1 },
                archive: { coverage: 0.1 * i, occupiedCount: [i, i] },
            },
            row,
        );
        pushSample(history, { nowMs: i * 10, tick: i * 100, values: row });
    }
    return { sampler, history };
}

describe('chartDefs', () => {
    it('lists the five charts in drawer order', () => {
        const { sampler } = filled();
        expect(chartDefs(sampler.groups, COLOR_OF).map((d) => d.id)).toEqual([
            'population',
            'river',
            'flow',
            'combat',
            'archive',
        ]);
    });

    it('gives each chart one data array per series, as long as the samples', () => {
        const { sampler, history } = filled();
        const cols = columns(history);
        for (const def of chartDefs(sampler.groups, COLOR_OF)) {
            const data = def.data(cols);
            expect(data, def.id).toHaveLength(def.series(FakeUPlot.paths).length);
            for (const y of data) {
                expect(y).toHaveLength(5);
            }
        }
    });

    it('stacks births upward and deaths downward', () => {
        const { sampler, history } = filled();
        const flow = chartDefs(sampler.groups, COLOR_OF)[2].data(columns(history));
        expect(flow).toHaveLength(4);
        expect(flow[0][4]).toBe(4 + 1);
        expect(flow[2][4]).toBe(-(1 + 4));
        expect(flow[3][4]).toBe(-1);
    });

    it('colours the river bands by lineage after data is read', () => {
        const { sampler, history } = filled();
        const river = chartDefs(sampler.groups, COLOR_OF)[1];
        const series = river.series(FakeUPlot.paths);
        river.data(columns(history));
        expect(series[0].fill()).not.toBe(series[1].fill());
        expect(series[1].fill()).toMatch(/^hsl\(/);
        expect(series[1].stroke()).toBe(series[1].fill());
    });

    it('labels every axis tick with a short number, or a percentage on the share axes', () => {
        FakeUPlot.made.length = 0;
        const { sampler, history } = filled();
        const doc = fakeDocument();
        mountCharts({
            doc,
            root: doc.createElement('div'),
            UPlot: FakeUPlot,
            history,
            groups: sampler.groups,
            colorOf: COLOR_OF,
        });
        const labels = FakeUPlot.made.flatMap((u) =>
            u.opts.axes.map((/** @type {any} */ a) => a.values(null, [0.5, 12000])),
        );
        expect(labels.filter((l) => l[0] === '50%').length).toBeGreaterThan(0);
        expect(labels.filter((l) => l[1] === '12k').length).toBeGreaterThan(0);
    });
});

describe('riverSeries re-export and tickLabel', () => {
    it('is the same riverSeries', () => {
        const { history } = filled();
        expect(riverSeries(columns(history)).layers.map((l) => l.id)).toEqual([null, 8, 4]);
    });

    it('shortens big numbers', () => {
        expect(tickLabel(950)).toBe('950');
        expect(tickLabel(12000)).toBe('12k');
        expect(tickLabel(1500000)).toBe('1.5M');
        expect(tickLabel(0.25)).toBe('0.25');
    });
});

describe('mountCharts', () => {
    it('builds five uPlot instances whose data matches their series, and updates and destroys them', () => {
        FakeUPlot.made.length = 0;
        const { sampler, history } = filled();
        const doc = fakeDocument();
        const root = doc.createElement('div');
        root.clientWidth = 300;
        const charts = mountCharts({ doc, root, UPlot: FakeUPlot, history, groups: sampler.groups, colorOf: COLOR_OF });
        expect(FakeUPlot.made).toHaveLength(5);
        expect(root.children).toHaveLength(5);
        for (const u of FakeUPlot.made) {
            expect(u.opts.width).toBe(300);
            expect(u.data).toHaveLength(u.opts.series.length);
        }
        charts.update();
        expect(FakeUPlot.made.every((u) => u.sets === 1)).toBe(true);
        charts.destroy();
        expect(FakeUPlot.made.every((u) => u.destroyed)).toBe(true);
        expect(root.children).toHaveLength(0);
    });

    it('draws empty charts before any sample and falls back to a default width', () => {
        FakeUPlot.made.length = 0;
        const sampler = createSampler(WORLD);
        const history = createHistory({ names: sampler.names, kinds: sampler.kinds });
        const doc = fakeDocument();
        mountCharts({
            doc,
            root: doc.createElement('div'),
            UPlot: FakeUPlot,
            history,
            groups: sampler.groups,
            colorOf: COLOR_OF,
        });
        expect(FakeUPlot.made[0].opts.width).toBe(340);
        expect(FakeUPlot.made[0].data[0]).toHaveLength(0);
    });
});
