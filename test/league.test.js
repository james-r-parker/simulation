import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { main, parseArgs, playLeague } from '../scripts/league.mjs';
import { runGame } from '../scripts/league-worker.mjs';
import { makeChampionFile } from './evo/helpers/champion-file.js';

const TICKS = 100;
/** @type {string} */
let dir;

/**
 * @param {string} name the file stem
 * @param {unknown} value the JSON to write
 * @returns {string} the path
 */
function write(name, value) {
    const path = join(dir, name);
    writeFileSync(path, JSON.stringify(value));
    return path;
}

/**
 * @param {string} name the league file stem
 * @param {{ file: string, name: string, elo: number }[]} champions the entries
 * @returns {string} the league path
 */
function league(name, champions) {
    return write(`${name}.json`, { version: 1, champions });
}

beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'league-'));
    mkdirSync(join(dir, 'logs'));
    write('cand.json', makeChampionFile('cand', 11));
    write('x.json', makeChampionFile('x', 12));
    write('y.json', makeChampionFile('y', 13));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const paths = () => ({ root: dir, logDir: join(dir, 'logs') });
const two = [
    { file: 'x.json', name: 'x', elo: 1550 },
    { file: 'y.json', name: 'y', elo: 1450 },
];

describe('parseArgs', () => {
    it('takes the candidate and the flags in any order', () => {
        expect(parseArgs(['--admit', 'c.json', '--workers', '2', '--ticks', '10'])).toEqual({
            candidate: 'c.json',
            admit: true,
            workers: 2,
            ticks: 10,
        });
        expect(parseArgs(['c.json']).ticks).toBe(50000);
    });

    it('rejects a missing candidate and unknown flags', () => {
        expect(() => parseArgs([])).toThrow(/candidate/);
        expect(() => parseArgs(['c.json', '--nope'])).toThrow(/unknown argument/);
    });
});

describe('playLeague', () => {
    it('plays no games against an empty league and leaves the candidate at 1500', async () => {
        const leaguePath = league('empty', []);
        const lines = /** @type {string[]} */ ([]);
        const out = await playLeague(
            { candidate: join(dir, 'cand.json'), admit: false, workers: 1, ticks: TICKS },
            { ...paths(), leaguePath, print: (line) => lines.push(line) },
        );
        expect(out).toMatchObject({ elo: 1500, games: 0 });
        expect(lines).toContain('eval.champion_win_rate null (no games)');
    });

    it('gives the same results with 2 workers as with 1, and logs MatchPlayed in game order', async () => {
        const leaguePath = league('two', two);
        const run = (/** @type {number} */ workers) =>
            playLeague(
                { candidate: join(dir, 'cand.json'), admit: false, workers, ticks: TICKS },
                { ...paths(), leaguePath },
            );
        const [a, b] = [await run(2), await run(1)];
        expect(a).toEqual(b);
        expect(a.games).toBe(16);
        expect(a.log.slice(0, 4).map((g) => [g.seed, g.champion])).toEqual([
            [313056, 'x'],
            [313056, 'y'],
            [337535, 'x'],
            [337535, 'y'],
        ]);
        const logged = readFileSync(join(dir, 'logs', `league-cand-${TICKS}.jsonl`), 'utf8')
            .trim()
            .split('\n')
            .map((line) => JSON.parse(line));
        expect(logged).toHaveLength(16);
        expect(logged[0]).toMatchObject({ event: 'MatchPlayed', seed: 313056, a: 'cand', b: 'x', eloBefore: 1500 });
        expect(logged.at(-1).eloAfter).toBe(a.elo);
    }, 60_000);

    it('appends the candidate with its Elo on --admit', async () => {
        const leaguePath = league('admit', two);
        const out = await playLeague(
            { candidate: join(dir, 'cand.json'), admit: true, workers: 2, ticks: TICKS },
            { ...paths(), leaguePath },
        );
        const saved = JSON.parse(readFileSync(leaguePath, 'utf8'));
        expect(saved.champions).toHaveLength(3);
        expect(saved.champions[2]).toEqual({ file: 'cand.json', name: 'cand', elo: out.elo });
        expect(saved.champions[0]).toEqual(two[0]);
    }, 60_000);
});

describe('main', () => {
    it('refuses a league champion built for other rules, naming it, and exits 1', async () => {
        const bad = { ...makeChampionFile('bad', 5), rulesHash: 'deadbeefdeadbeef' };
        write('bad.json', bad);
        const leaguePath = league('bad', [{ file: 'bad.json', name: 'bad', elo: 1500 }]);
        const code = await main([join(dir, 'cand.json'), '--ticks', '10'], { ...paths(), leaguePath });
        expect(code).toBe(1);
    });
});

describe('league file and worker', () => {
    it('refuses a league file of the wrong shape', async () => {
        const leaguePath = write('shape.json', { version: 2, champions: [] });
        const code = await main([join(dir, 'cand.json')], { ...paths(), leaguePath });
        expect(code).toBe(1);
    });

    it('plays one game and names the seed when a champion file is invalid', () => {
        const a = makeChampionFile('a', 1);
        const b = makeChampionFile('b', 2);
        expect(runGame({ seed: 5, ticks: 20, a, b })).toMatchObject({
            seed: 5,
            result: 'draw',
            aliveA: 50,
            aliveB: 50,
        });
        expect(() => runGame({ seed: 5, ticks: 20, a, b: { ...b, version: 9 } })).toThrow(
            /^seed 5 failed: champion\.version/,
        );
    });
});
