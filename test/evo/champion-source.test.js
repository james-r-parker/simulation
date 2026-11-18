import { describe, expect, it } from 'vitest';
import { createChampionSource } from '../../js/evo/champion-source.js';
import { createSimLog } from '../../js/sim/log.js';
import { createRng } from '../../js/sim/rng.js';
import { smallWorld } from '../sim/helpers/small-world.js';
import { makeChampionFileFor } from './helpers/champion-file.js';

const { config } = smallWorld({ brainHidden: 4, maxAgents: 8 });

describe('createChampionSource', () => {
    it('refuses no files, loudly', () => {
        expect(() => createChampionSource([], config)).toThrow(/needs champion files/);
        expect(() => createChampionSource(undefined, config)).toThrow(/needs champion files/);
    });

    it('names the file that does not fit the config', () => {
        const ok = makeChampionFileFor(config, 'a', 1);
        const bad = { ...makeChampionFileFor(config, 'b', 2), rulesHash: 'stale' };
        expect(() => createChampionSource([ok, bad], config)).toThrow(/champion file 1: champion\.rulesHash/);
    });

    it('draws the weights of a champion of the asked specialisation only', () => {
        const source = createChampionSource(
            [
                makeChampionFileFor(config, 'f', 1, { specialisation: 0 }),
                makeChampionFileFor(config, 'p', 2, { specialisation: 4 }),
            ],
            config,
        );
        expect(source.count).toBe(2);
        const forager = source.draw(0, createRng(1));
        const predator = source.draw(4, createRng(1));
        expect(forager).toBeInstanceOf(Float32Array);
        expect(forager).not.toEqual(predator);
        expect(source.draw(0, createRng(9))).toEqual(forager);
    });

    it('draws between the champions of one specialisation, deterministically', () => {
        const files = [makeChampionFileFor(config, 'a', 1), makeChampionFileFor(config, 'b', 2)];
        const source = createChampionSource(files, config);
        const seen = new Set();
        const rng = createRng(5);
        for (let i = 0; i < 40; i++) {
            seen.add(source.draw(0, rng)?.[0]);
        }
        expect(seen.size).toBe(2);
        const first = createChampionSource(files, config).draw(0, createRng(5));
        expect(createChampionSource(files, config).draw(0, createRng(5))).toEqual(first);
    });

    it('returns null for a specialisation with none, logging it once', () => {
        /** @type {any[]} */
        const records = [];
        const log = createSimLog((r) => records.push(r), { level: 'debug' });
        const source = createChampionSource([makeChampionFileFor(config, 'a', 1)], config, log);
        expect(source.draw(3, createRng(1))).toBeNull();
        expect(source.draw(3, createRng(1))).toBeNull();
        expect(source.draw(2, createRng(1))).toBeNull();
        expect(records.filter((r) => r.event === 'ChampionMissing').map((r) => r.spec)).toEqual([3, 2]);
    });

    it('returns null without a log too', () => {
        const source = createChampionSource([makeChampionFileFor(config, 'a', 1)], config);
        expect(source.draw(3, createRng(1))).toBeNull();
    });
});
