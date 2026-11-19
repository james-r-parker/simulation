import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { main, reportBlindBiters, runBlindBiters } from '../scripts/blind-biters.mjs';

const root = mkdtempSync(join(tmpdir(), 'blind-biters-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

/** @param {number} id @param {Record<string, any>} [over] @returns {Record<string, any>} a life */
const life = (id, over = {}) => ({
    id,
    parentA: 0,
    parentB: 0,
    source: 'floor',
    born: 20,
    last: 80,
    ticks: 60,
    hold: 40,
    blind: 30,
    blindUnseen: 10,
    earlyTicks: 60,
    earlyBlind: 30,
    bias: 0,
    preyBite: 2,
    ...over,
});

/** @param {string} name @param {Record<string, any>[]} lives @returns {string} a run file */
function runFile(name, lives) {
    const path = join(root, name);
    writeFileSync(path, JSON.stringify({ seed: 1, ticks: 100, endTick: 100, lives }));
    return path;
}

describe('reportBlindBiters', () => {
    it('pools runs with unique ids and prints every section', () => {
        const a = runFile('a.json', [
            life(1, { ticks: 120 }),
            life(2, { parentA: 1, blind: 10 }),
            life(3, { last: 100, ticks: 80 }),
        ]);
        const b = runFile('b.json', [life(1, { source: 'spec-flip' })]);
        /** @type {string[]} */
        const lines = [];
        const out = reportBlindBiters([a, b, '--burn-in', '10', '--juvenile-ticks', '50'], (l) => lines.push(l));
        expect(out.counted).toBe(4);
        expect(out.blind.parentChild.pairs).toBe(1);
        expect(out.unseen.byDepth['0'].blind).toBeGreaterThan(0);
        expect(out.bySource['spec-flip'].born).toBe(1);
        expect(lines.some((l) => l.startsWith('-- by birth source'))).toBe(true);
    });

    it('writes the readings as json when asked and refuses no files or no counted life', () => {
        const a = runFile('c.json', [life(1)]);
        const json = join(root, 'out.json');
        reportBlindBiters([a, '--burn-in', '10', '--json', json], () => {});
        expect(JSON.parse(readFileSync(json, 'utf8')).counted).toBe(1);
        expect(() => reportBlindBiters([], () => {})).toThrow(/usage/);
        expect(() => reportBlindBiters([a, '--burn-in', '99'], () => {})).toThrow(/no hunter life/);
    });
});

describe('blind-biters run', () => {
    it('replays a short world with the tracker and writes its lives', async () => {
        /** @type {string[]} */
        const lines = [];
        const { path, lives } = await runBlindBiters(['--seed', '3', '--ticks', '200', '--out', root], (l) =>
            lines.push(l),
        );
        expect(existsSync(path)).toBe(true);
        const file = JSON.parse(readFileSync(path, 'utf8'));
        expect(file.endTick).toBe(200);
        expect(file.lives).toHaveLength(lives);
        expect(lines[0]).toContain('seed 3');
    });

    it('exits 1 on an unknown command', async () => {
        const quiet = console.error;
        console.error = () => {};
        try {
            expect(await main(['nope'])).toBe(1);
        } finally {
            console.error = quiet;
        }
    });
});
