// `git merge origin/<base>` that settles conflicts in generated files by itself: ship.sh step 2 and `npm run sync` both
// call it. A conflict is settled only when every conflicted path is one of these, and then the merge completes:
//   - a file a generator owns whole (scripts/lib/regen.mjs): take our side and regenerate;
//   - the prose above the generated index of docs/designs/sim-notes.md: a three-way merge of the prose, then regenerate;
//   - docs/notes/<YYYY-MM>.md where both sides only appended `### ` entries: keep both in date order (notes-merge.mjs).
// Any other conflicted path leaves the merge in progress, exactly as a plain `git merge` does.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mergeNotes } from './notes-merge.mjs';
import { GENERATORS, regenerate } from './regen.mjs';

const NOTES_FILE = /^docs\/notes\/\d{4}-\d{2}\.md$/;

/**
 * @typedef {import('./regen.mjs').Sh} Sh
 * @typedef {{status: 'up-to-date' | 'clean'} | {status: 'resolved', regenerated: string[], notes: string[]} |
 *   {status: 'conflict', paths: string[], message?: string}} MergeResult
 */

/**
 * @param {string} text a file
 * @param {string} heading the heading at which a generator owns the rest
 * @returns {string} the text above the heading
 */
const above = (text, heading) => {
    const at = text.indexOf(`${heading}\n`);
    return at === -1 ? text : text.slice(0, at);
};

/**
 * @param {Sh} sh runs a command in the repo
 * @param {string} path a conflicted path
 * @returns {{base: string, ours: string, theirs: string} | null} the three index stages, or null when one is missing
 */
function stages(sh, path) {
    const out = [1, 2, 3].map((n) => sh('git', ['show', `:${n}:${path}`]));
    return out.every((r) => r.status === 0)
        ? { base: out[0].stdout, ours: out[1].stdout, theirs: out[2].stdout }
        : null;
}

/**
 * Three-way merges the prose above a generator's tail with `git merge-file`.
 * @param {Sh} sh runs a command in the repo
 * @param {{base: string, ours: string, theirs: string}} texts the three versions
 * @param {string} heading the tail's heading
 * @returns {string | null} the merged prose, or null when it conflicts
 */
function mergeProse(sh, texts, heading) {
    const dir = mkdtempSync(join(tmpdir(), 'merge-prose-'));
    try {
        const files = /** @type {const} */ (['ours', 'base', 'theirs']).map((name) => {
            const file = join(dir, name);
            writeFileSync(file, above(texts[name], heading));
            return file;
        });
        const r = sh('git', ['merge-file', '-p', ...files]);
        return r.status === 0 ? r.stdout : null;
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

/**
 * @param {Sh} sh runs a command in the repo
 * @param {string} path a conflicted path
 * @param {typeof GENERATORS} generators the generators
 * @returns {{text: string | null, notes: boolean} | null} the text to write (null = take our side), or null when
 *   regenerating does not settle the path
 */
function settle(sh, path, generators) {
    const gen = generators.find((g) => g.path === path);
    if (gen?.whole) {
        return { text: null, notes: false };
    }
    const texts = gen || NOTES_FILE.test(path) ? stages(sh, path) : null;
    if (!texts) {
        return null;
    }
    const text = gen?.tail ? mergeProse(sh, texts, gen.tail) : mergeNotes(texts);
    return text === null ? null : { text, notes: !gen };
}

/**
 * @param {Sh} sh runs a command in the repo
 * @param {string[]} paths the conflicted paths
 * @param {typeof GENERATORS} generators the generators
 * @returns {{writes: Map<string, string | null>, notes: string[]} | null} what to write per path (null = take our
 *   side), or null when any path is not settled by regenerating
 */
function plan(sh, paths, generators) {
    const writes = new Map();
    const notes = [];
    for (const path of paths) {
        const settled = settle(sh, path, generators);
        if (!settled) {
            return null;
        }
        writes.set(path, settled.text);
        if (settled.notes) {
            notes.push(path);
        }
    }
    return { writes, notes };
}

/**
 * @param {Sh} sh runs a command in the repo
 * @param {string} ref the merged ref
 * @param {{regenerated: string[], notes: string[]}} what what the resolution did
 * @returns {import('./regen.mjs').Outcome} the merge commit
 */
function commitMerge(sh, ref, { regenerated, notes }) {
    const branch = sh('git', ['rev-parse', '--abbrev-ref', 'HEAD']).stdout.trim();
    const lines = [
        `Merge remote-tracking branch '${ref}' into ${branch}`,
        '',
        'Conflicts only in generated files, settled by scripts/lib/merge-base.mjs.',
        `Regenerated: ${regenerated.join(', ') || 'none'}`,
    ];
    if (notes.length > 0) {
        lines.push(`Notes entries kept from both sides: ${notes.join(', ')}`);
    }
    return sh('git', ['commit', '-m', lines.join('\n')]);
}

/**
 * @param {Sh} sh runs a command in the repo
 * @param {Map<string, string | null>} writes what to write per conflicted path (null = take our side)
 * @param {{generators: typeof GENERATORS, cwd: string}} where the generators and the repo directory
 * @returns {string[] | string} the generated files the rerun changed, or the failed generator's message
 */
function applyAndRegenerate(sh, writes, { generators, cwd }) {
    for (const [path, text] of writes) {
        if (text === null) {
            sh('git', ['checkout', '--ours', '--', path]);
        } else {
            writeFileSync(join(cwd, path), text);
        }
        sh('git', ['add', '--', path]);
    }
    try {
        return regenerate(sh, { generators });
    } catch (error) {
        return /** @type {Error} */ (error).message;
    }
}

/**
 * Merges `origin/<base>` into the current branch, settling conflicts in generated files.
 * @param {Sh} sh runs a command in the repo
 * @param {string} base the base branch name
 * @param {{generators?: typeof GENERATORS, cwd?: string}} [options] test seams
 * @returns {MergeResult} what happened; on `conflict` the merge is left in progress
 */
export function mergeBase(sh, base, { generators = GENERATORS, cwd = '.' } = {}) {
    const ref = `origin/${base}`;
    if (Number(sh('git', ['rev-list', '--count', `HEAD..${ref}`]).stdout.trim()) === 0) {
        return { status: 'up-to-date' };
    }
    if (sh('git', ['merge', '--no-edit', ref]).status === 0) {
        return { status: 'clean' };
    }
    const paths = sh('git', ['diff', '--name-only', '--diff-filter=U']).stdout.split('\n').filter(Boolean);
    const settled = paths.length > 0 ? plan(sh, paths, generators) : null;
    if (!settled) {
        return { status: 'conflict', paths };
    }
    const changed = applyAndRegenerate(sh, settled.writes, { generators, cwd });
    if (typeof changed === 'string') {
        return { status: 'conflict', paths, message: changed };
    }
    const owned = generators.filter((g) => paths.includes(g.path)).map((g) => g.path);
    const regenerated = [...new Set([...owned, ...changed])];
    const commit = commitMerge(sh, ref, { regenerated, notes: settled.notes });
    if (commit.status !== 0) {
        return { status: 'conflict', paths, message: `git commit failed: ${commit.stderr.trim()}` };
    }
    return { status: 'resolved', regenerated, notes: settled.notes };
}
