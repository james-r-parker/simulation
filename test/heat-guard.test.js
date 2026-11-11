import { describe, expect, it } from 'vitest';
import { formatArm, guardConfig, isHeatArm, judge } from '../scripts/lib/heat-guard.mjs';
import { parseArgs } from '../scripts/heat-guard.mjs';

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

    it('puts an arm key over the sweet-spot world', () => {
        const config = guardConfig({ temperatureCoolingExcess: 0.005 }, 2);
        expect(config.temperatureCoolingExcess).toBe(0.005);
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
