// `scripts/experiment.mjs renumber <id>`: two lanes drew the same id before either pushed, so the second PR gives its
// record the next id and rewrites every citation of the old one on the branch.
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { nextId } from './experiment-ids.mjs';
import { ledgerDir } from './ledger.mjs';

/** The kinds of file whose citations are rewritten. */
const TEXT = new Set(['.md', '.json', '.mjs', '.js', '.sh', '.txt', '.yml', '.yaml']);

/**
 * @param {import('./experiment-ids.mjs').Git} git a git runner
 * @returns {string[]} the files this branch changed against `origin/main`: committed, unstaged and untracked
 */
export function branchFiles(git) {
    const lines = (/** @type {string[]} */ args) => git(args).split('\n').filter(Boolean);
    const changed = lines(['diff', '--name-only', '--diff-filter=ACMR', 'origin/main']);
    return [...new Set([...changed, ...lines(['ls-files', '--others', '--exclude-standard'])])];
}

/**
 * @param {string} root the repository root
 * @param {string} file a repo-relative path
 * @param {RegExp} pattern the citation to find
 * @param {string} to what it becomes
 * @returns {boolean} whether the file changed
 */
function rewrite(root, file, pattern, to) {
    const path = join(root, file);
    if (!TEXT.has(extname(file)) || !existsSync(path)) {
        return false;
    }
    const before = readFileSync(path, 'utf8');
    const after = before.replace(pattern, to);
    if (after !== before) {
        writeFileSync(path, after);
    }
    return after !== before;
}

/**
 * Moves a record to the next free id and rewrites the citations of the old id in the files this branch changed.
 * @param {string} root the repository root
 * @param {string} from the id to give up, `E<n>`
 * @param {import('./experiment-ids.mjs').Git} git a git runner
 * @returns {{ from: string, to: string, files: string[] }} the new id and the files rewritten
 * @throws {Error} when `from` is not an id with a record
 */
export function renumber(root, from, git) {
    const source = join(ledgerDir(root), `${from}.json`);
    if (!/^E\d+$/.test(from) || !existsSync(source)) {
        throw new Error(`renumber: no record ${from} in evals/ledger/`);
    }
    if (git(['ls-tree', '--name-only', 'origin/main', `evals/ledger/${from}.json`]).trim() !== '') {
        throw new Error(`renumber: ${from} is on origin/main, so it is another lane's record; not moving it`);
    }
    const to = nextId(root, git);
    const decisions = join(root, 'evals', 'decisions');
    if (existsSync(join(decisions, to))) {
        throw new Error(`renumber: evals/decisions/${to} already exists; not overwriting it`);
    }
    const files = branchFiles(git).map((file) =>
        file === `evals/ledger/${from}.json` ? `evals/ledger/${to}.json` : file,
    );
    renameSync(source, join(ledgerDir(root), `${to}.json`));
    if (existsSync(join(decisions, from))) {
        renameSync(join(decisions, from), join(decisions, to));
    }
    const pattern = new RegExp(`(?<![\\w-])${from}(?![\\w-])`, 'g');
    const moved = files.map((file) => file.replace(`evals/decisions/${from}/`, `evals/decisions/${to}/`));
    return { from, to, files: moved.filter((file) => rewrite(root, file, pattern, to)) };
}
