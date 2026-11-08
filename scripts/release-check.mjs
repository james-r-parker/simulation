// The `release-check` gate: fails a pull request that changes `rulesHash` without a breaking commit, or whose base is
// `main` and which adds no season (docs/designs/deployment-and-community.md, "Release check").
//   BASE_REF=main PR_TITLE='feat(sim)!: ...' node scripts/release-check.mjs
// BASE_REF defaults to GITHUB_BASE_REF, then `main`; the merge base is taken against origin/<BASE_REF>.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
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

/**
 * @typedef {object} ReleaseCheckDeps
 * @property {Record<string, string | undefined>} env the environment (BASE_REF, GITHUB_BASE_REF, PR_TITLE)
 * @property {(args: string[]) => string} git runs git and returns its output
 * @property {(sha: string) => string} rulesHashAt the rules hash of a commit
 * @property {string} headHash the rules hash of the working tree
 * @property {string} headSeasons the working tree's library/seasons.json
 */

/**
 * @param {ReleaseCheckDeps} deps the environment, git and the hashes
 * @returns {{ok: boolean, line: string}} the verdict and the line to print (stdout when ok, stderr when not)
 */
export function runReleaseCheck({ env, git: run, rulesHashAt: hashAt, headHash, headSeasons }) {
    const base = env.BASE_REF || env.GITHUB_BASE_REF || 'main';
    const mergeBase = run(['merge-base', 'HEAD', `origin/${base}`]).trim();
    const messages = run(['log', '--format=%B%x00', `${mergeBase}..HEAD`])
        .split('\0')
        .map((m) => m.trim())
        .filter((m) => m !== '');
    if (env.PR_TITLE) {
        messages.push(env.PR_TITLE);
    }
    const baseHash = hashAt(mergeBase);
    const addsSeason = seasonAdded(run(['show', `${mergeBase}:library/seasons.json`]), headSeasons);
    const verdict = releaseCheck({ baseHash, headHash, messages, base, addsSeason });
    if (verdict.ok) {
        const rules = baseHash === headHash ? 'unchanged' : 'changed';
        return { ok: true, line: `release-check ok (base ${base}, rulesHash ${rules})` };
    }
    const line = JSON.stringify({ event: 'ReleaseCheckFailed', reason: verdict.reason, baseHash, headHash });
    return { ok: false, line };
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
    const { ok, line } = runReleaseCheck({
        env: process.env,
        git,
        rulesHashAt,
        headHash: rulesHash(createConfig()),
        headSeasons: readFileSync('library/seasons.json', 'utf8'),
    });
    (ok ? console.log : console.error)(line);
    process.exit(ok ? 0 : 1);
}
