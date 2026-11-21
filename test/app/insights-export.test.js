import { afterEach, describe, expect, it, vi } from 'vitest';
import { exportTables, performExport, replayView, toCsv } from '../../js/app/insights-export.js';
import { BUNDLE_CONFIG_FILE } from '../../js/app/debug-bundle.js';
import { ready } from './helpers/interface-setup.js';

afterEach(() => vi.restoreAllMocks());

const VIEW = {
    world: {
        readings: [
            ['season', 'Summer, year 1 (25%)'],
            ['food energy', '52,000'],
        ],
        population: [{ cells: ['forager', '9'] }],
        births: [{ cells: ['mate', '1', '2', '3', '4'] }],
        deaths: [{ cells: ['starved', '5', '6', '7', '8'] }],
    },
    scenes: [
        { name: 'A real chase', count: 12, signal: 'x', genomeId: 1, x: 0, y: 0, seen: true },
        { name: 'Refuge, a ring', count: null, signal: null, genomeId: 0, x: 0, y: 0, seen: false },
    ],
    families: [{ cells: ['Velari', '30 (25%)', '2.5 seasons', 'forager 20, predator 8', '12', '7'] }],
    records: [{ cells: ['longest life', '3.0 seasons', 'blob 11'] }],
};

describe('exportTables', () => {
    it('lists every table of the drawer, with its heading and rows as text', () => {
        const tables = exportTables(VIEW);
        expect(tables.map((t) => t.title)).toEqual([
            'world readings',
            'population by type',
            'births per season',
            'deaths per season',
            'scenes',
            'families',
            'records',
        ]);
        expect(tables[2]).toEqual({
            title: 'births per season',
            header: ['cause', 'now', '-1', '-2', '-3'],
            rows: [['mate', '1', '2', '3', '4']],
        });
        expect(tables[4].rows).toEqual([
            ['A real chase', '12'],
            ['Refuge, a ring', 'no live signal'],
        ]);
        expect(tables[5].header).toEqual(['family', 'size', 'oldest', 'mix', 'kills', 'deepest']);
    });
});

describe('toCsv', () => {
    it('writes a title line, the header and the rows of each table, with a blank line between', () => {
        const csv = toCsv([
            { title: 'a', header: ['x', 'y'], rows: [['1', '2']] },
            { title: 'b', header: ['z'], rows: [] },
        ]);
        expect(csv).toBe('# a\nx,y\n1,2\n\n# b\nz\n');
    });

    it('quotes a field that holds a comma, a quote or a line break, doubling its quotes', () => {
        const csv = toCsv([{ title: 't', header: ['h'], rows: [['a,b'], ['say "hi"'], ['two\nlines'], ['plain']] }]);
        expect(csv).toBe('# t\nh\n"a,b"\n"say ""hi"""\n"two\nlines"\nplain\n');
    });

    it('reads back as the drawer shows it', () => {
        const csv = toCsv(exportTables(VIEW));
        expect(csv).toContain('# scenes\nscene,last 4 seasons\nA real chase,12\n"Refuge, a ring",no live signal');
        expect(csv).toContain('"forager 20, predator 8"');
    });
});

describe('replayView', () => {
    it('gives the replay command for the world at its newest tick, with the config it reads', () => {
        const view = replayView({ ready, stats: { tick: 4321 }, overrides: { maxAgents: 40 } });
        expect(view).toEqual({
            command: `npm run replay -- --seed ${ready.seed} --config ${BUNDLE_CONFIG_FILE} --policy ${ready.policy} --ticks 4321`,
            configFile: BUNDLE_CONFIG_FILE,
            configJson: '{\n  "maxAgents": 40\n}',
            seed: ready.seed,
            tick: 4321,
        });
    });

    it('is null before a world, and replays to tick 0 before the first stats', () => {
        expect(replayView({ ready: null, stats: null, overrides: {} })).toBeNull();
        expect(replayView({ ready, stats: null, overrides: {} })?.tick).toBe(0);
    });
});

describe('performExport', () => {
    /** @param {Record<string, any>} [more] parts over the fixture @returns {any} the parts and what they heard */
    function parts(more = {}) {
        const heard = /** @type {any} */ ({ files: [], toasts: [], copied: [] });
        return {
            heard,
            parts: {
                view: () => ({ ...VIEW, export: replayView({ ready, stats: { tick: 9 }, overrides: {} }) }),
                ready,
                stats: { tick: 9 },
                download: (/** @type {any} */ f) => heard.files.push(f),
                copyText: (/** @type {string} */ t) => (heard.copied.push(t), Promise.resolve()),
                toast: (/** @type {string} */ t) => heard.toasts.push(t),
                ...more,
            },
        };
    }

    it('downloads the tables as a CSV named for the seed and the tick, and logs it', () => {
        const info = vi.spyOn(console, 'info').mockImplementation(() => {});
        const { heard, parts: p } = parts();
        performExport('csv', p);
        expect(heard.files).toHaveLength(1);
        expect(heard.files[0].name).toBe(`blob-insights-${ready.seed}-9.csv`);
        expect(heard.files[0].type).toBe('text/csv');
        expect(heard.files[0].text.startsWith('# world readings\nreading,value\n')).toBe(true);
        expect(heard.toasts).toEqual(['Tables saved']);
        expect(info).toHaveBeenCalledWith({ level: 'info', event: 'InsightsExport', what: 'csv' });
    });

    it('names the file with zeros before a world', () => {
        const { heard, parts: p } = parts({ ready: null, stats: null });
        performExport('csv', p);
        expect(heard.files[0].name).toBe('blob-insights-0-0.csv');
    });

    it('copies the replay command and says so, or says the copy was refused', async () => {
        vi.spyOn(console, 'info').mockImplementation(() => {});
        const { heard, parts: p } = parts();
        performExport('command', p);
        await Promise.resolve();
        await Promise.resolve();
        expect(heard.copied[0]).toContain('npm run replay -- --seed');
        expect(heard.toasts).toEqual(['Replay command copied']);
        const refused = parts({ copyText: () => Promise.reject(new Error('no')) });
        performExport('command', refused.parts);
        await Promise.resolve();
        await Promise.resolve();
        expect(refused.heard.toasts).toEqual(['Copying was refused']);
    });

    it('says why there is nothing to copy: no world, or no clipboard', () => {
        vi.spyOn(console, 'info').mockImplementation(() => {});
        const none = parts({ view: () => ({ ...VIEW, export: null }) });
        performExport('command', none.parts);
        expect(none.heard.toasts).toEqual(['There is no world to replay yet.']);
        const noClip = parts({ copyText: undefined });
        performExport('command', noClip.parts);
        expect(noClip.heard.toasts).toEqual(['Copying is not available here']);
    });
});
