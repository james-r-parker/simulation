// The `release-check` gate: fails a pull request that changes `rulesHash` without a breaking commit, or whose base is
// `main` and which adds no season (docs/designs/deployment-and-community.md, "Release check").
//   BASE_REF=main PR_TITLE='feat(sim)!: ...' node scripts/release-check.mjs
// BASE_REF defaults to GITHUB_BASE_REF, then `main`; the merge base is taken against origin/<BASE_REF>.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { releaseCheck, seasonAdded } from './lib/release-check.mjs';
import { createConfig, rulesHash } from '../js/sim/config.js';

/**
 * @param {string[]} args git arguments
 * @returns {string} its standard output
 * @throws {Error} when git fails
 */
function git(args) {
    const done = spawnSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (done.status !== 0) {
        throw new Error(`release-check: git ${args.join(' ')} failed: ${done.stderr}`);
    }
    return done.stdout;
}

/**
 * @param {string} sha a commit
 * @returns {string} `rulesHash(createConfig())` of that commit, computed in a temporary worktree
 */
function rulesHashAt(sha) {
    const dir = mkdtempSync(join(tmpdir(), 'release-check-'));
    git(['worktree', 'add', '--detach', dir, sha]);
    try {
        const code = `import('${dir}/js/sim/config.js').then((m) => console.log(m.rulesHash(m.createConfig())))`;
        const done = spawnSync('node', ['--input-type=module', '-e', code], { encoding: 'utf8' });
        if (done.status !== 0) {
            throw new Error(`release-check: cannot hash the rules at ${sha}: ${done.stderr}`);
        }
        return done.stdout.trim();
    } finally {
        git(['worktree', 'remove', '--force', dir]);
        rmSync(dir, { recursive: true, force: true });
    }
}

const base = process.env.BASE_REF || process.env.GITHUB_BASE_REF || 'main';
const mergeBase = git(['merge-base', 'HEAD', `origin/${base}`]).trim();
const seasonsAt = (/** @type {string} */ ref) => git(['show', `${ref}:library/seasons.json`]);
const messages = git(['log', '--format=%B%x00', `${mergeBase}..HEAD`])
    .split('\0')
    .map((m) => m.trim())
    .filter((m) => m !== '');
if (process.env.PR_TITLE) {
    messages.push(process.env.PR_TITLE);
}
const input = {
    baseHash: rulesHashAt(mergeBase),
    headHash: rulesHash(createConfig()),
    messages,
    base,
    addsSeason: seasonAdded(seasonsAt(mergeBase), readFileSync('library/seasons.json', 'utf8')),
};
const verdict = releaseCheck(input);
if (verdict.ok) {
    console.log(
        `release-check ok (base ${base}, rulesHash ${input.baseHash === input.headHash ? 'unchanged' : 'changed'})`,
    );
} else {
    console.error(
        JSON.stringify({
            event: 'ReleaseCheckFailed',
            reason: verdict.reason,
            baseHash: input.baseHash,
            headHash: input.headHash,
        }),
    );
    process.exit(1);
}
