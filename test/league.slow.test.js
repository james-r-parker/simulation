import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { playLeague } from '../scripts/league.mjs';
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
