import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { LIVE_POLICY } from '../js/evo/policies/index.js';
import { readParams } from '../js/app/url-params.js';
import { REEL_SPEED, reelManifest, reelPageUrl, writeReel } from '../scripts/lib/reel-files.mjs';

const dirs = /** @type {string[]} */ ([]);
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

describe('reelPageUrl', () => {
    it('runs the seed at x8 with the reel on, and names no policy for the live one', () => {
        const url = new URL(reelPageUrl('http://host:1/', { seed: 7, policy: LIVE_POLICY, config: null }));
        expect(url.origin + url.pathname).toBe('http://host:1/');
        expect(readParams(url.search)).toMatchObject({
            seed: 7,
            speed: REEL_SPEED,
            reel: true,
            policy: null,
            config: null,
        });
    });

    it('carries a policy and a config the page reads back', () => {
        const config = { seasonLength: 3600, flag: true };
        const url = new URL(reelPageUrl('http://host:1/', { seed: 1, policy: 'random', config }));
        expect(readParams(url.search)).toMatchObject({ policy: 'random', config });
    });
});

describe('reelManifest', () => {
    it('lists each clip as scene, tick, score and file', () => {
        const clips = [{ scene: 'call', tick: 9, score: 2, name: 'call-9.webm', genomeId: 1, base64: 'x' }];
        expect(
            reelManifest({ seed: 1, ticks: 100, policy: 'p', configFile: 'c.json', tick: 120, clips, recording: true }),
        ).toEqual({
            seed: 1,
            ticks: 100,
            policy: 'p',
            config: 'c.json',
            endTick: 120,
            recording: true,
            clips: [{ scene: 'call', tick: 9, score: 2, file: 'call-9.webm' }],
        });
    });
});

describe('writeReel', () => {
    it('makes the directory and writes each clip and reel.json', () => {
        const root = mkdtempSync(join(tmpdir(), 'reel-'));
        dirs.push(root);
        const out = join(root, 'nested', 'out');
        const manifest = { seed: 1, clips: [] };
        const file = writeReel(out, {
            manifest,
            clips: [{ name: 'a.webm', base64: Buffer.from('bytes').toString('base64') }],
        });
        expect(file).toBe(join(out, 'reel.json'));
        expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(manifest);
        expect(readFileSync(join(out, 'a.webm'), 'utf8')).toBe('bytes');
    });
});
