import { describe, expect, it } from 'vitest';
import { arenaConfig } from '../../js/evo/chase-arena.js';
import { DISTANCE_SHARES, FAIR_BAND, fairBand, runEnvelope } from '../../js/evo/chase-envelope.js';

describe('fairBand', () => {
    it('lists the start distances whose catch share is inside the band, ends included', () => {
        expect(fairBand([1, 0.8, 0.5, 0.2, 0])).toEqual([DISTANCE_SHARES[1], DISTANCE_SHARES[2], DISTANCE_SHARES[3]]);
        expect(fairBand([1, 1, 1, 1, 1])).toEqual([]);
        expect(fairBand([0, 0, 0, 0, 0])).toEqual([]);
        expect([FAIR_BAND.low, FAIR_BAND.high]).toEqual([0.2, 0.8]);
    });
});

describe('runEnvelope', () => {
    it('plays the named pairs only, one grid cell per distance and bearing', () => {
        const [only, ...rest] = runEnvelope(arenaConfig(), { pairs: [['predator', 'forager']], trials: 1 });
        expect(rest).toEqual([]);
        expect([only.pursuer, only.evader, only.grid.length, only.grid[0].length]).toEqual([
            'predator',
            'forager',
            5,
            8,
        ]);
        expect(only.byDistance).toHaveLength(5);
    }, 30_000);

    it('plays every hunting specialisation against every body when no pairs are named', () => {
        const config = arenaConfig();
        const specs = Object.entries(config.specialisations);
        const hunters = specs.filter(([, spec]) => /** @type {any} */ (spec).canHunt);
        expect(hunters.length).toBeGreaterThan(0);
        expect(hunters.length).toBeLessThan(specs.length);
        const results = runEnvelope(config, { trials: 1 });
        expect(results).toHaveLength(hunters.length * specs.length);
        expect(new Set(results.map((r) => r.pursuer))).toEqual(new Set(hunters.map(([name]) => name)));
    }, 120_000);

    it('rejects a named pair with an unknown specialisation, listing the known ones', () => {
        expect(() => runEnvelope(arenaConfig(), { pairs: [['dragon', 'forager']], trials: 1 })).toThrow(
            /unknown specialisation "dragon"; known: .*forager/,
        );
    });
});
