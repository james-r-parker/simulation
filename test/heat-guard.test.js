import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { formatArm, guardArm, guardConfig, isHeatArm, judge } from '../scripts/lib/heat-guard.mjs';
import { main, parseArgs } from '../scripts/heat-guard.mjs';

/**
 * @param {Record<string, any>} arms the grid's arms
 * @returns {string} the path of a grid file holding them
 */
function gridFile(arms) {
    const path = join(mkdtempSync(join(tmpdir(), 'heat-guard-')), 'grid.json');
    writeFileSync(path, JSON.stringify({ arms }));
    return path;
}

describe('judge', () => {
    it('passes when a sitter dies, a rusher dies and a forager grows', () => {
        expect(judge({ thrust0: 0, thrust20: 100, thrust100: 20, start: 50 }).pass).toBe(true);
    });

    it('fails a sitter that lives', () => {
        const v = judge({ thrust0: 3, thrust20: 100, thrust100: 20, start: 50 });
        expect(v.sitterDies).toBe(false);
        expect(v.pass).toBe(false);
    });

    it('fails a rusher that keeps up with the forager or the start', () => {
        expect(judge({ thrust0: 0, thrust20: 100, thrust100: 60, start: 50 }).rusherDies).toBe(false);
        expect(judge({ thrust0: 0, thrust20: 100, thrust100: 40, start: 50 }).rusherDies).toBe(true);
        expect(judge({ thrust0: 0, thrust20: 60, thrust100: 40, start: 50 }).rusherDies).toBe(false);
    });

    it('fails a forager that does not grow past the start', () => {
        expect(judge({ thrust0: 0, thrust20: 50, thrust100: 0, start: 50 }).foragerGrows).toBe(false);
    });
});

describe('heat guard setup', () => {
    it('picks the heat arms by name', () => {
        expect(['defaults', 'cool-2', 'mate-90', 'eat-1', 'flat'].filter(isHeatArm)).toEqual([
            'cool-2',
            'mate-90',
            'eat-1',
        ]);
    });

    it('picks the eat-choice arms by name, and not the plain bite arm or the defaults', () => {
        const names = ['defaults', 'bite', 'bite-graze-5', 'bite-fat-3', 'bite-strike-2', 'fat-5', 'strike-2', 'flat'];
        expect(names.filter(isHeatArm)).toEqual(['bite-graze-5', 'bite-fat-3', 'bite-strike-2', 'fat-5', 'strike-2']);
    });

    it('puts an arm key over the sweet-spot world', () => {
        const config = guardConfig({ temperatureGainMove: 0.5 }, 2);
        expect(config.temperatureGainMove).toBe(0.5);
        expect(config.seed).toBe(2);
        expect(config.minAgents).toBe(0);
        expect(config.foodRegrowPerArea).toBe(0.003);
    });

    it('formats a failing arm with its failing case named', () => {
        const rows = [
            {
                seed: 1,
                thrust0: 2,
                thrust20: 90,
                thrust100: 5,
                start: 50,
                ...judge({ thrust0: 2, thrust20: 90, thrust100: 5, start: 50 }),
            },
        ];
        const text = formatArm('cool-2', rows);
        expect(text).toContain('cool-2: FAIL');
        expect(text).toContain('LIVES');
    });

    it('parses its flags and refuses the rest', () => {
        expect(parseArgs(['--grid', 'g.json', '--seeds', '1,2']).seeds).toEqual([1, 2]);
        expect(() => parseArgs([])).toThrow(/usage/);
        expect(() => parseArgs(['--grid', 'g.json', '--bogus', '1'])).toThrow(/unknown/);
    });
});

describe('guardArm and main', () => {
    it('runs the three controllers per seed and judges each row', () => {
        const rows = guardArm({}, [1], 30);
        expect(rows).toHaveLength(1);
        const [row] = rows;
        expect(row.seed).toBe(1);
        expect(row.start).toBe(guardConfig({}, 1).initialAgents);
        expect(row.pass).toBe(judge(/** @type {any} */ (row)).pass);
    });

    it('checks only the heat arms of a grid and exits 1 when one fails', () => {
        const log = vi.spyOn(console, 'log').mockImplementation(() => {});
        // 30 ticks is too short for a sitter to freeze, so the arm fails the guard.
        const code = main(['--grid', gridFile({ defaults: {}, 'cool-2': {} }), '--ticks', '30']);
        const printed = log.mock.calls.map((c) => String(c[0])).join('\n');
        log.mockRestore();
        expect(code).toBe(1);
        expect(printed).toContain('cool-2: FAIL');
        expect(printed).not.toContain('defaults:');
        expect(printed).toContain('1 arm(s) FAIL');
    });

    it('refuses an arm the grid does not have', () => {
        expect(() => main(['--grid', gridFile({ 'cool-2': {} }), '--arms', 'nope', '--ticks', '1'])).toThrow(
            /no arm nope/,
        );
    });

    it('needs a value after each flag', () => {
        expect(() => parseArgs(['--grid'])).toThrow(/needs a value/);
        expect(parseArgs(['--grid', 'g.json', '--arms', 'a,b', '--ticks', '5'])).toMatchObject({
            arms: ['a', 'b'],
            ticks: 5,
        });
    });
});
