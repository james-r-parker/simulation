// `npm run sync`: merges origin/<base> into the current branch with the generated-file conflicts settled by
// scripts/lib/merge-base.mjs. One command fixes a pull request that conflicted on a generated file.
//   node scripts/lib/sync-main.mjs [--base <branch>]      exit 0 merged or up to date, 3 a conflict a person resolves
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mergeBase } from './merge-base.mjs';

/** @type {import('./regen.mjs').Sh} */
export const sh = (cmd, args) => {
    const r = spawnSync(cmd, args, { encoding: 'utf8' });
    return { status: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
};

/**
 * @param {string[]} argv arguments after the script name
 * @returns {string | null} the base branch, or null for a bad argument list
 */
function baseOf(argv) {
    if (argv.length === 0) {
        return 'main';
    }
    return argv.length === 2 && argv[0] === '--base' && argv[1] ? argv[1] : null;
}

/**
 * @param {string[]} argv arguments after the script name
 * @param {import('./regen.mjs').Sh} [run] test seam
 * @returns {number} the exit code
 */
export function main(argv, run = sh) {
    const base = baseOf(argv);
    if (!base) {
        process.stderr.write('usage: scripts/sync-main.sh [--base <branch>]\n');
        return 2;
    }
    run('git', ['fetch', 'origin']);
    const result = mergeBase(run, base);
    if (result.status === 'conflict') {
        const why = result.message ? `${result.message}\n` : '';
        process.stderr.write(
            `sync: merging origin/${base} conflicts (merge left in progress):\n${why}${result.paths.join('\n')}\n`,
        );
        return 3;
    }
    const done = result.status === 'up-to-date' ? 'already up to date' : `merged origin/${base}`;
    process.stdout.write(
        `sync: ${done}${result.status === 'resolved' ? `; regenerated ${result.regenerated.join(', ')}` : ''}\n`,
    );
    return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    process.exitCode = main(process.argv.slice(2));
}
