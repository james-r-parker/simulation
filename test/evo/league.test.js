import { describe, expect, it } from 'vitest';
import { ELO_START, expectedScore, updateElo } from '../../js/evo/elo.js';
import { decide, matchPolicy, playMatch, runLeague, validateChampion } from '../../js/evo/league.js';
import { brainLayout } from '../../js/sim/brain-layout.js';
import { createConfig } from '../../js/sim/config.js';
import { SIMPLE_WORLD } from '../helpers/simple-world.js';
import { createWorld } from '../../js/sim/spawn.js';
import { makeChampionFile } from './helpers/champion-file.js';
import { scaleTimeout } from '../../scripts/lib/test-timeout.mjs';

const config = createConfig();
const champion = (/** @type {string} */ name, /** @type {number} */ seed, /** @type {number} */ specialisation = 0) =>
    validateChampion(makeChampionFile(name, seed, { specialisation }), config);

describe('validateChampion', () => {
    it('decodes a valid file', () => {
        const file = makeChampionFile('a', 1, { specialisation: 3 });
        const decoded = validateChampion(file, config);
        expect(decoded).toMatchObject({ name: 'a', specialisation: 3 });
        expect(decoded.weights).toHaveLength(brainLayout(config).weightCount);
    });

    it.each([
        ['version', { version: 2 }],
        ['layout.inputCount', { layout: { name: 'pooled-v3', inputCount: 1, brainHidden: 32, outputCount: 11 } }],
        [
            'layout.brainHidden',
            {
                layout: {
                    name: 'pooled-v3',
                    inputCount: brainLayout(config).inputCount,
                    brainHidden: 16,
                    outputCount: 11,
                },
            },
        ],
        ['rulesHash', { rulesHash: 'deadbeefdeadbeef' }],
        ['specialisation', { specialisation: 9 }],
        ['name', { name: '' }],
        ['weights', { weights: 'AAAA' }],
    ])('rejects a bad %s naming the field', (field, patch) => {
        const file = { ...makeChampionFile('a', 1), ...patch };
        expect(() => validateChampion(file, config)).toThrow(new RegExp(`champion\\.${field.replace('.', '\\.')}`));
    });

    it('rejects a layout that differs from the running config', () => {
        const file = makeChampionFile('a', 1);
        expect(() => validateChampion(file, createConfig({ brainHidden: 16 }))).toThrow(/layout\.brainHidden/);
    });

    it('rejects a layout of the same sizes but another name, and a file with no layout name', () => {
        const file = makeChampionFile('a', 1);
        expect(() => validateChampion({ ...file, layout: { ...file.layout, name: 'elman-v1' } }, config)).toThrow(
            /champion\.layout\.name: expected pooled-v3, got elman-v1/,
        );
        const unnamed = { ...file.layout, name: undefined };
        expect(() => validateChampion({ ...file, layout: unnamed }, config)).toThrow(/champion\.layout\.name/);
    });

    it('rejects a rules mismatch', () => {
        const file = makeChampionFile('a', 1);
        expect(() => validateChampion(file, createConfig({ foodEnergy: 99 }))).toThrow(/rulesHash/);
    });
});

describe('matchPolicy', () => {
    it('writes A into even slots and B into odd slots, with their specialisations', () => {
        const a = champion('a', 1, 1);
        const b = champion('b', 2, 4);
        const world = createWorld(
            createConfig({ initialAgents: 6, maxAgents: 10, minAgents: 0, seed: 3 }),
            matchPolicy(a, b),
        );
        const count = world.layout.weightCount;
        for (let slot = 0; slot < 6; slot++) {
            const side = slot % 2 === 0 ? a : b;
            expect(world.weights.slice(slot * count, (slot + 1) * count)).toEqual(side.weights);
            expect(world.spec[slot]).toBe(side.specialisation);
        }
    });
});

describe('validateChampion input', () => {
    it('rejects a non-object', () => {
        expect(() => validateChampion(/** @type {any} */ (null), config)).toThrow(/champion: expected a JSON object/);
    });
});

describe('decide', () => {
    it('gives the side with more agents alive the win, and equal counts a draw', () => {
        const end = (/** @type {number[]} */ [aliveA, aliveB, lastAliveA, lastAliveB]) => ({
            aliveA,
            aliveB,
            lastAliveA,
            lastAliveB,
        });
        expect(decide(end([31, 30, 900, 900]))).toBe('a');
        expect(decide(end([30, 31, 900, 900]))).toBe('b');
        expect(decide(end([30, 30, 900, 900]))).toBe('draw');
    });

    it('gives the side that lasted longer the win when both died out', () => {
        const end = (/** @type {number} */ lastAliveA, /** @type {number} */ lastAliveB) => ({
            aliveA: 0,
            aliveB: 0,
            lastAliveA,
            lastAliveB,
        });
        expect(decide(end(4100, 3900))).toBe('a');
        expect(decide(end(3900, 4100))).toBe('b');
        expect(decide(end(4000, 4000))).toBe('draw');
    });
});

describe('playMatch', () => {
    const options = { ticks: 200 };

    it(
        'counts each side by its founders and is deterministic',
        () => {
            const a = champion('a', 1);
            const b = champion('b', 2);
            const first = playMatch(a, b, 7, options);
            expect(playMatch(a, b, 7, options)).toEqual(first);
            expect(first.aliveA + first.aliveB).toBeLessThanOrEqual(500);
            expect(first.aliveA + first.aliveB).toBeGreaterThan(0);
        },
        scaleTimeout(30_000),
    );

    it('with no ticks, every founder is alive and the game is a draw', () => {
        expect(playMatch(champion('a', 1), champion('b', 2), 7, { ticks: 0 })).toEqual({
            result: 'draw',
            aliveA: 50,
            aliveB: 50,
            lastAliveA: 0,
            lastAliveB: 0,
        });
    });

    it('stops once both sides have died out and decides on who lasted longer', () => {
        const starving = {
            ...SIMPLE_WORLD,
            worldWidth: 2000,
            worldHeight: 1200,
            maxFood: 1,
            initialFood: 0,
            initialEnergy: 30,
        };
        const result = playMatch(champion('a', 1), champion('b', 2), 7, { ticks: 50000, config: starving });
        expect([result.aliveA, result.aliveB]).toEqual([0, 0]);
        expect(Math.max(result.lastAliveA, result.lastAliveB)).toBeLessThan(50000);
        expect(result.result).toBe(decide(result));
    });
});

describe('runLeague', () => {
    const champions = [
        { name: 'x', elo: 1600 },
        { name: 'y', elo: 1400 },
    ];

    it('plays no games for an empty league: Elo 1500, null win rate with a reason', () => {
        const out = runLeague([], []);
        expect(out).toMatchObject({ elo: ELO_START, games: 0, wins: 0, draws: 0 });
        expect(out.metrics['eval.champion_elo']).toEqual({ value: 1500 });
        expect(out.metrics['eval.champion_win_rate']).toEqual({ value: null, reason: 'no games' });
    });

    it('moves only the candidate, game by game in the given order', () => {
        const games = [
            { seed: 1, champion: 0, result: /** @type {const} */ ('a') },
            { seed: 1, champion: 1, result: /** @type {const} */ ('draw') },
            { seed: 2, champion: 0, result: /** @type {const} */ ('b') },
        ];
        const out = runLeague(champions, games);
        const first = updateElo(1500, expectedScore(1500, 1600), 1);
        const second = updateElo(first, expectedScore(first, 1400), 0.5);
        const third = updateElo(second, expectedScore(second, 1600), 0);
        expect(out.log.map((g) => [g.seed, g.champion, g.eloBefore])).toEqual([
            [1, 'x', 1500],
            [1, 'y', first],
            [2, 'x', second],
        ]);
        expect(out.elo).toBe(third);
        expect(out.log.at(-1)?.eloAfter).toBe(third);
        expect(champions.map((c) => c.elo)).toEqual([1600, 1400]);
        expect(out).toMatchObject({ wins: 1, draws: 1, losses: 1, games: 3 });
        expect(out.metrics['eval.champion_win_rate'].value).toBeCloseTo(0.5, 12);
    });
});
