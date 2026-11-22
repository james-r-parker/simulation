// A small shared cache for `gh` reads, so agents working on the same PR at once do not each spend the 5000/hour API limit
// on the same answers. Responses live one file each under /tmp/claude-<uid>/gh-cache ($GH_CACHE_DIR; GH_CACHE=off skips it)
// for 60 s, and a completed job's log (`.../jobs/<id>/logs`) for good, since it never changes. Failures are not cached.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** How long an ordinary response is served from the cache, in ms. */
export const TTL_MS = 60_000;

/** @returns {string} the cache directory */
export function cacheDir() {
    return process.env.GH_CACHE_DIR || `/tmp/claude-${process.getuid?.() ?? 1000}/gh-cache`;
}

/**
 * @param {string[]} args the gh arguments
 * @returns {number} how long the response may be reused in ms: forever for a job log
 */
export function ttlFor(args) {
    return args.some((a) => /\/actions\/jobs\/\d+\/logs$/.test(a)) ? Infinity : TTL_MS;
}

/**
 * @param {string[]} args the gh arguments (cached by their text)
 * @param {{ run: (args: string[]) => string, dir?: string, now?: () => number, off?: boolean }} opts `run` is the real gh call
 * @returns {string} gh's stdout, from the cache when fresh
 */
export function cachedGh(args, { run, dir = cacheDir(), now = Date.now, off = process.env.GH_CACHE === 'off' }) {
    if (off) {
        return run(args);
    }
    const file = join(dir, `${createHash('sha1').update(JSON.stringify(args)).digest('hex')}.txt`);
    try {
        if (now() - statSync(file).mtimeMs < ttlFor(args)) {
            return readFileSync(file, 'utf8');
        }
    } catch {
        // not cached
    }
    const out = run(args);
    try {
        mkdirSync(dir, { recursive: true });
        writeFileSync(file, out);
    } catch {
        // an unwritable cache must not stop the read
    }
    return out;
}
