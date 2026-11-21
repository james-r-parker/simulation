// Classes a git worktree for scripts/worktree-gc.sh (docs/designs/agent-workflow.md, The state of the machine). Pure: the
// shell gathers the facts, this decides. Only `safe` is ever removed, so every doubt lands in another class.

/** @typedef {'safe' | 'dirty' | 'unmerged' | 'live' | 'gone'} GcClass */

/**
 * @typedef {object} WorktreeFacts
 * @property {string} path the worktree directory
 * @property {string | null} branch the checked-out branch, null on a detached HEAD
 * @property {string} head the HEAD commit
 * @property {boolean} isMain the main checkout (the first entry of `git worktree list`)
 * @property {boolean} isCaller the worktree of the calling session
 * @property {boolean} locked `git worktree lock` is set
 * @property {boolean} missing the directory no longer exists
 * @property {number[]} processes pids of other processes whose working directory is inside the worktree
 * @property {boolean} runInFlight a run recorded in its `.runs/runs.json` is still going
 * @property {boolean} runLogs its `.runs/` holds a run log
 * @property {string} porcelain `git status --porcelain` (uncommitted and untracked files), empty when clean
 * @property {boolean} headInMain HEAD is reachable from `origin/main`
 * @property {{number: number, headRefOid: string}[] | null} mergedPrs merged PRs of the branch, null when gh could not say
 */

/**
 * @param {WorktreeFacts} f the facts
 * @returns {string | null} why the worktree is `live`, or null
 */
function liveReason(f) {
    if (f.isMain) {
        return 'the main checkout';
    }
    if (f.isCaller) {
        return 'the worktree of the calling session';
    }
    if (f.locked) {
        return 'locked';
    }
    if (f.processes.length > 0) {
        return `a process runs in it (pid ${f.processes.slice(0, 3).join(', ')})`;
    }
    if (f.runInFlight) {
        return 'a run is in flight from its .runs';
    }
    if (f.runLogs) {
        return '.runs holds a run log';
    }
    return null;
}

/**
 * @param {WorktreeFacts} f the facts
 * @returns {string | null} why the branch is not fully merged, or null when a merged PR holds all of HEAD
 */
function unmergedReason(f) {
    if (f.branch === null) {
        return 'detached HEAD';
    }
    if (f.mergedPrs === null) {
        return 'gh could not list merged PRs';
    }
    if (f.mergedPrs.length === 0) {
        return 'no merged PR';
    }
    const held = f.headInMain || f.mergedPrs.some((pr) => pr.headRefOid === f.head);
    return held ? null : 'commits the merged PR does not hold (unpushed or added after the merge)';
}

/**
 * Classes one worktree. The order is the safety order: a worktree something uses is `live`, then uncommitted or
 * untracked files make it `dirty`, then a branch not wholly in a merged PR is `unmerged`; only the rest is `safe`.
 * @param {WorktreeFacts} f the facts
 * @returns {{cls: GcClass, reason: string}} the class and the reason, always set
 */
export function classify(f) {
    if (f.missing) {
        return { cls: 'gone', reason: 'directory missing (git worktree prune clears it)' };
    }
    const live = liveReason(f);
    if (live) {
        return { cls: 'live', reason: live };
    }
    if (f.porcelain.trim() !== '') {
        const n = f.porcelain.trim().split('\n').length;
        return { cls: 'dirty', reason: `${n} uncommitted or untracked file${n === 1 ? '' : 's'}` };
    }
    const unmerged = unmergedReason(f);
    if (unmerged) {
        return { cls: 'unmerged', reason: unmerged };
    }
    return { cls: 'safe', reason: `branch ${f.branch} is in a merged PR and the tree is clean` };
}

/**
 * @param {{cls: GcClass}[]} rows classified worktrees
 * @returns {Record<GcClass, number>} the count per class (every class present)
 */
export function countByClass(rows) {
    const counts = { safe: 0, dirty: 0, unmerged: 0, live: 0, gone: 0 };
    for (const row of rows) {
        counts[row.cls] += 1;
    }
    return counts;
}

/**
 * @param {string} text the output of `git worktree list --porcelain`
 * @returns {{path: string, head: string, branch: string | null, locked: boolean, prunable: boolean}[]} its entries
 */
export function parseWorktreeList(text) {
    const entries = [];
    for (const block of text.split(/\n\n+/)) {
        const lines = block.split('\n').filter(Boolean);
        const path = lines.find((l) => l.startsWith('worktree '))?.slice(9);
        if (path === undefined) {
            continue;
        }
        const ref = lines.find((l) => l.startsWith('branch '))?.slice(7);
        entries.push({
            path,
            head: lines.find((l) => l.startsWith('HEAD '))?.slice(5) ?? '',
            branch: ref ? ref.replace(/^refs\/heads\//, '') : null,
            locked: lines.some((l) => l === 'locked' || l.startsWith('locked ')),
            prunable: lines.some((l) => l === 'prunable' || l.startsWith('prunable ')),
        });
    }
    return entries;
}
