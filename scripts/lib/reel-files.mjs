// The files `npm run reel` writes and the URL it opens: pure over its inputs, so a test reads them back. The browser half
// is `reel-page.mjs`.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { LIVE_POLICY } from '../../js/evo/policies/index.js';

/** The speed the reel runs the app at (ticks a second over 60). */
export const REEL_SPEED = 8;

/**
 * @param {string} base the app's URL, ending in `/`
 * @param {{seed: number, policy: string, config: Record<string, number | boolean> | null}} world what to run: the seed,
 *   a registered policy name (`LIVE_POLICY` adds none) and config overrides
 * @returns {string} the URL that runs that world at x8 with `?reel=1`, so each scene moment follows its subject
 */
export function reelPageUrl(base, { seed, policy, config }) {
    const query = new URLSearchParams({ seed: String(seed), speed: String(REEL_SPEED), reel: '1' });
    if (policy !== LIVE_POLICY) {
        query.set('policy', policy);
    }
    if (config !== null) {
        query.set('config', Buffer.from(JSON.stringify(config)).toString('base64url'));
    }
    return `${base}?${query}`;
}

/**
 * @param {{seed: number, ticks: number, policy: string, configFile: string | null, tick: number,
 *   clips: {scene: string, tick: number, score: number, name: string}[], recording: boolean}} run what ran and what
 *   the page held at the end
 * @returns {Record<string, any>} the `reel.json` content: the run, and one entry per clip (scene, tick, score, file)
 */
export function reelManifest({ seed, ticks, policy, configFile, tick, clips, recording }) {
    return {
        seed,
        ticks,
        policy,
        config: configFile,
        endTick: tick,
        recording,
        clips: clips.map(({ scene, tick: at, score, name }) => ({ scene, tick: at, score, file: name })),
    };
}

/**
 * Writes each clip's bytes and `reel.json` into a directory, which is made if it is missing.
 * @param {string} out the directory
 * @param {{manifest: Record<string, any>, clips: {name: string, base64: string}[]}} reel the manifest and the clips'
 *   bytes as base64
 * @returns {string} the path of `reel.json`
 */
export function writeReel(out, { manifest, clips }) {
    mkdirSync(out, { recursive: true });
    for (const { name, base64 } of clips) {
        writeFileSync(join(out, name), Buffer.from(base64, 'base64'));
    }
    const file = join(out, 'reel.json');
    writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
    return file;
}
