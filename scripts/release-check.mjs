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

/** @typedef {(cmd: string, args: string[]) => {status: number | null, stdout: string, stderr: string}} Spawn */

/** @type {Spawn} */
const spawnText = (cmd, args) => spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

/**
 * @param {Spawn} spawn runs a command
 * @returns {(args: string[]) => string} git: its standard output, throwing when it fails
 */
export function makeGit(spawn) {
    return (args) => {
        const done = spawn('git', args);
        if (done.status !== 0) {
            throw new Error(`release-check: git ${args.join(' ')} failed: ${done.stderr}`);
        }
        return done.stdout;
    };
}

/**
 * @param {{spawn: Spawn, tempDir: () => string, removeDir: (dir: string) => void}} deps the runner and the temp dir
 * @returns {(sha: string) => string} `rulesHash(createConfig())` of a commit, computed in a temporary worktree
 */
export function makeRulesHashAt({ spawn, tempDir, removeDir }) {
    const git = makeGit(spawn);
    return (sha) => {
        const dir = tempDir();
        git(['worktree', 'add', '--detach', dir, sha]);
        try {
            const code = `import('${dir}/js/sim/config.js').then((m) => console.log(m.rulesHash(m.createConfig())))`;
            const done = spawn('node', ['--input-type=module', '-e', code]);
            if (done.status !== 0) {
                throw new Error(`release-check: cannot hash the rules at ${sha}: ${done.stderr}`);
            }
            return done.stdout.trim();
        } finally {
            git(['worktree', 'remove', '--force', dir]);
            removeDir(dir);
        }
    };
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

/**
 * @param {Record<string, string | undefined>} env the environment
 * @returns {ReleaseCheckDeps} the real git, the temporary-worktree hasher, and this tree's hash and seasons file
 */
export function cliDeps(env) {
    return {
        env,
        git: makeGit(spawnText),
        rulesHashAt: makeRulesHashAt({
            spawn: spawnText,
            tempDir: () => mkdtempSync(join(tmpdir(), 'release-check-')),
            removeDir: (dir) => rmSync(dir, { recursive: true, force: true }),
        }),
        headHash: rulesHash(createConfig()),
        headSeasons: readFileSync('library/seasons.json', 'utf8'),
    };
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
    const { ok, line } = runReleaseCheck(cliDeps(process.env));
    (ok ? console.log : console.error)(line);
    process.exit(ok ? 0 : 1);
}
