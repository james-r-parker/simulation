import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LIVE_POLICY } from '../js/evo/policies/index.js';

vi.mock('../scripts/lib/reel-page.mjs', () => ({
    collectReel: vi.fn(async () => ({
        tick: 2050,
        recording: true,
        clips: [{ scene: 'chase', tick: 1900, score: 4, genomeId: 3, name: 'chase-1900.webm', base64: 'AQID' }],
    })),
}));

const { parseArgs, readConfig, runReel } = await import('../scripts/reel.mjs');
const { collectReel } = await import('../scripts/lib/reel-page.mjs');

const dirs = /** @type {string[]} */ ([]);
/** @returns {string} a fresh temporary directory */
function tmp() {
    const dir = mkdtempSync(join(tmpdir(), 'reel-cli-'));
    dirs.push(dir);
    return dir;
}
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

describe('parseArgs', () => {
    it('reads the seed, the ticks and the directory, with the live policy and no config by default', () => {
        expect(parseArgs(['--seed', '1', '--ticks', '2000', '--out', 'o'])).toEqual({
            seed: 1,
            ticks: 2000,
            out: 'o',
            config: null,
            policy: LIVE_POLICY,
            headed: false,
        });
    });

    it('reads a config file, a policy and --headed', () => {
        const args = parseArgs([
            '--seed',
            '1',
            '--ticks',
            '5',
            '--out',
            'o',
            '--config',
            'c.json',
            '--policy',
            'live',
            '--headed',
        ]);
        expect(args).toMatchObject({ config: 'c.json', policy: LIVE_POLICY, headed: true });
    });

    it('requires the seed, the ticks and the directory, and rejects an unknown policy or flag', () => {
        expect(() => parseArgs(['--seed', '1', '--ticks', '5'])).toThrow('--seed, --ticks and --out are required');
        expect(() => parseArgs(['--ticks', '5', '--out', 'o'])).toThrow('are required');
        expect(() => parseArgs(['--seed', '1', '--ticks', '0', '--out', 'o'])).toThrow('--ticks must be');
        expect(() => parseArgs(['--seed', '1', '--ticks', '5', '--out', 'o', '--policy', 'nope'])).toThrow(
            'Unknown policy',
        );
        expect(() => parseArgs(['--nope'])).toThrow();
    });
});

describe('readConfig', () => {
    it('reads none as none, and a file of numbers and booleans as itself', () => {
        expect(readConfig(null)).toBeNull();
        const file = join(tmp(), 'c.json');
        writeFileSync(file, JSON.stringify({ a: 1, b: false }));
        expect(readConfig(file)).toEqual({ a: 1, b: false });
    });

    it('rejects a file the page would ignore', () => {
        const dir = tmp();
        for (const [name, body] of [
            ['array.json', '[1]'],
            ['empty.json', '{}'],
            ['text.json', '{"a":"x"}'],
            ['null.json', 'null'],
        ]) {
            writeFileSync(join(dir, name), body);
            expect(() => readConfig(join(dir, name))).toThrow('must be a JSON object of numbers and booleans');
        }
    });
});

describe('runReel', () => {
    it('opens the reel URL, collects to the ticks and writes the clips and reel.json', async () => {
        const goto = vi.fn(async () => {});
        const out = join(tmp(), 'out');
        const file = await runReel(/** @type {any} */ ({ goto, evaluate: async () => null }), {
            baseUrl: 'http://host:1/',
            args: { seed: 1, ticks: 2000, out, config: null, policy: LIVE_POLICY, headed: false },
        });
        expect(goto).toHaveBeenCalledOnce();
        const url = /** @type {string} */ (/** @type {any} */ (goto.mock.calls[0])[0]);
        expect(url).toContain('seed=1');
        expect(url).toContain('reel=1');
        expect(collectReel).toHaveBeenCalledWith(expect.anything(), { ticks: 2000, timeoutMs: 120_000 });
        const manifest = JSON.parse(readFileSync(file, 'utf8'));
        expect(manifest).toMatchObject({
            seed: 1,
            ticks: 2000,
            endTick: 2050,
            recording: true,
            clips: [{ scene: 'chase', tick: 1900, score: 4, file: 'chase-1900.webm' }],
        });
        expect([...readFileSync(join(out, 'chase-1900.webm'))]).toEqual([1, 2, 3]);
    });

    it('waits longer for a long run', async () => {
        await runReel(/** @type {any} */ ({ goto: async () => {}, evaluate: async () => null }), {
            baseUrl: 'http://host:1/',
            args: { seed: 1, ticks: 100_000, out: join(tmp(), 'o'), config: null, policy: LIVE_POLICY, headed: false },
        });
        expect(collectReel).toHaveBeenLastCalledWith(expect.anything(), { ticks: 100_000, timeoutMs: 4_000_000 });
    });

    it('fails naming the config parameter when the page reports it did not parse', async () => {
        vi.mocked(collectReel).mockClear();
        const page = { goto: async () => {}, evaluate: async () => 'config does not parse' };
        const args = { seed: 1, ticks: 100, out: join(tmp(), 'o'), config: null, policy: LIVE_POLICY, headed: false };
        await expect(runReel(/** @type {any} */ (page), { baseUrl: 'http://host:1/', args })).rejects.toThrow(/config/);
        expect(collectReel).not.toHaveBeenCalled();
    });
});
