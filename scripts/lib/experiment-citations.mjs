// An experiment id cited in the docs has a record (docs/designs/agent-workflow.md, Experiment ledger): a result that is
// quoted but not recorded cannot be found, tallied or checked.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Ids below this are exempt: the docs cite many experiments from before the ledger named its records. */
export const FIRST_CITED_ID = 151;

/**
 * @param {string} dir a directory
 * @returns {string[]} the `.md` files below it, as paths relative to `dir`, sorted
 */
function markdownUnder(dir) {
    return readdirSync(dir, { recursive: true, encoding: 'utf8' })
        .filter((name) => name.endsWith('.md'))
        .sort();
}

/**
 * @param {string} root the repository root
 * @returns {string[]} `AGENTS.md` and every `.md` file under `docs/`, relative to the root
 */
export function citingFiles(root) {
    const docs = existsSync(join(root, 'docs')) ? markdownUnder(join(root, 'docs')).map((f) => join('docs', f)) : [];
    return [...(existsSync(join(root, 'AGENTS.md')) ? ['AGENTS.md'] : []), ...docs];
}

/**
 * @param {string} root the repository root
 * @param {ReadonlySet<number>} recorded the ids that have a record
 * @returns {string[]} one line per cited id from `FIRST_CITED_ID` on that has no record, `file:line: E<id> ...`
 */
export function checkCitations(root, recorded) {
    /** @type {string[]} */
    const problems = [];
    for (const file of citingFiles(root)) {
        readFileSync(join(root, file), 'utf8')
            .split('\n')
            .forEach((line, index) => {
                for (const match of line.matchAll(/\bE(\d+)\b/g)) {
                    const id = Number(match[1]);
                    if (id >= FIRST_CITED_ID && !recorded.has(id)) {
                        problems.push(`${file}:${index + 1}: ${match[0]} is cited and has no record in the ledger`);
                    }
                }
            });
    }
    return problems;
}
