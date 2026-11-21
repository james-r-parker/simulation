// Every generator that writes a committed file, and the helper that reruns them all and stages what changed. A merge
// of the base into a branch conflicts on these files whenever both sides changed their source; the answer is never to
// pick a side by hand but to regenerate (scripts/lib/merge-base.mjs, docs/designs/agent-workflow.md, Phase 7).

/**
 * @typedef {{status: number, stdout: string, stderr: string}} Outcome
 * @typedef {(cmd: string, args: string[]) => Outcome} Sh
 * @typedef {{script: string, args: string[], path: string, whole: boolean, tail?: string}} Generator
 */

/**
 * The generators, in run order. A `whole` file holds nothing a person writes, so a conflict in one takes either side
 * and regenerates. `tail` names the heading below which the generator owns the rest of a file that also holds prose
 * (the index of docs/designs/sim-notes.md); a conflict there is resolved by merging the prose and regenerating the tail.
 * @type {Generator[]}
 */
export const GENERATORS = [
    {
        script: 'notes-index.mjs',
        args: ['--write'],
        path: 'docs/designs/sim-notes.md',
        whole: false,
        tail: '## Learned while building',
    },
    { script: 'designs-index.mjs', args: ['--write'], path: 'docs/designs/README.md', whole: true },
    { script: 'metrics-doc.mjs', args: ['--write'], path: 'docs/designs/metrics.md', whole: true },
    { script: 'events-doc.mjs', args: ['--write'], path: 'docs/log-events.md', whole: true },
    { script: 'config-doc.mjs', args: ['--write'], path: 'docs/config-keys.md', whole: true },
    { script: 'traits.mjs', args: ['--write'], path: 'docs/trait-table.md', whole: true },
    { script: 'scene-scorecard.mjs', args: ['--write'], path: 'docs/scene-scorecard.md', whole: true },
    { script: 'data-deps.mjs', args: ['--write'], path: 'test/data-deps.json', whole: true },
];

/**
 * Runs every generator (a failing one stops the run) and stages the generated files that changed.
 * @param {Sh} sh runs a command in the repo
 * @param {{generators?: Generator[]}} [options] test seam
 * @returns {string[]} the generated files the run changed
 * @throws {Error} naming the generator that failed
 */
export function regenerate(sh, { generators = GENERATORS } = {}) {
    for (const g of generators) {
        const r = sh('node', [`scripts/${g.script}`, ...g.args]);
        if (r.status !== 0) {
            throw new Error(`regen: scripts/${g.script} failed: ${(r.stderr || r.stdout).trim()}`);
        }
    }
    const paths = generators.map((g) => g.path);
    const changed = sh('git', ['diff', '--name-only', '--', ...paths])
        .stdout.split('\n')
        .filter(Boolean);
    if (changed.length > 0) {
        sh('git', ['add', '--', ...changed]);
    }
    return changed;
}
