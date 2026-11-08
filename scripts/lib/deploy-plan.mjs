// What the deploy workflow does for a finished `check` run, as a pure function (deployment-and-community.md, "Preview
// workflow"), and a reader for the subset of TOML that `wrangler.toml` uses.

const ZERO_ID = '00000000-0000-0000-0000-000000000000';

/**
 * @typedef {object} Bindings
 * @property {{binding: string, name: string, id: string}[]} d1
 */

/**
 * @param {string} name a table name
 * @param {boolean} array whether it was written `[[name]]`
 * @returns {{env: 'production' | 'preview', kind: 'd1' | null}} its environment and binding kind (null when it
 *   holds no bindings)
 */
function classify(name, array) {
    const preview = name.startsWith('env.preview.');
    const base = preview ? name.slice('env.preview.'.length) : name;
    /** @type {'d1' | null} */
    let kind = null;
    if (array && base === 'd1_databases') {
        kind = 'd1';
    }
    return { env: preview ? 'preview' : 'production', kind };
}

/**
 * @param {string} text the file's text
 * @returns {{line: number, text: string}[]} the lines that hold something, trailing comments cut
 */
function significantLines(text) {
    return text
        .split('\n')
        .map((raw, index) => ({ line: index + 1, text: raw.replace(/\s+#.*$/, '').trim() }))
        .filter((row) => row.text !== '' && !row.text.startsWith('#'));
}

/**
 * Reads the bindings of `wrangler.toml`: `[[d1_databases]]` at the top level (production) and under
 * `[env.preview]`. Only tables, arrays of tables and `key = "string"` or number lines are understood.
 * @param {string} text the file's text
 * @returns {{production: Bindings, preview: Bindings}} the bindings of each environment
 * @throws {Error} on any other line shape
 */
export function readBindings(text) {
    /** @type {Record<string, Record<string, string>[]>} */
    const tables = { 'production.d1': [], 'preview.d1': [] };
    /** @type {Record<string, string> | null} */
    let current = null;
    for (const { line, text: content } of significantLines(text)) {
        const table = /^\[\[?([A-Za-z0-9_.]+)\]\]?$/.exec(content);
        if (table !== null) {
            const { env, kind } = classify(table[1], content.startsWith('[['));
            current = kind === null ? null : {};
            if (current !== null) {
                tables[`${env}.${kind}`].push(current);
            }
            continue;
        }
        const pair = /^([A-Za-z0-9_]+)\s*=\s*("([^"]*)"|[0-9]+|true|false)$/.exec(content);
        if (pair === null) {
            throw new Error(`wrangler.toml line ${line}: unsupported syntax`);
        }
        if (current !== null) {
            current[pair[1]] = pair[3] ?? pair[2];
        }
    }
    return { production: shape(tables, 'production'), preview: shape(tables, 'preview') };
}

/**
 * @param {Record<string, Record<string, string>[]>} tables the raw tables by `<env>.<kind>`
 * @param {string} env the environment
 * @returns {Bindings} typed bindings
 */
function shape(tables, env) {
    return {
        d1: tables[`${env}.d1`].map((row) => ({ binding: row.binding, name: row.database_name, id: row.database_id })),
    };
}

/**
 * @param {Bindings['d1']} production the production databases
 * @param {Bindings['d1']} preview the preview databases
 * @returns {boolean} true when every production database has a `-preview` database with another id (placeholder ids
 *   are judged separately, so two equal zero ids count as separate here)
 */
function databasesSeparate(production, preview) {
    return production.every((row) => {
        const other = preview.find((entry) => entry.binding === row.binding);
        return other !== undefined && other.name.endsWith('-preview') && (other.id !== row.id || row.id === ZERO_ID);
    });
}

/**
 * @param {{production: Bindings, preview: Bindings}} bindings the parsed bindings
 * @returns {string | null} a reason the bindings must not deploy, or null when each preview binding is a separate
 *   `-preview` resource and no id is still the placeholder
 */
function bindingProblem({ production, preview }) {
    if (!databasesSeparate(production.d1, preview.d1)) {
        return 'preview-bindings';
    }
    return [...production.d1, ...preview.d1].some((row) => row.id === ZERO_ID) ? 'placeholder-ids' : null;
}

/**
 * @typedef {object} Plan
 * @property {'next' | 'preview' | 'skip'} action
 * @property {string} branch the Pages branch to deploy to (empty when skipped)
 * @property {string} sha the commit that `check` ran on
 * @property {number} pr the pull request number (0 when none)
 * @property {string} reason why it was skipped (empty otherwise)
 */

/**
 * @param {Record<string, any>} event the `workflow_run` event
 * @param {boolean} seasonNext whether `season/next` exists
 * @returns {{action: 'next' | 'preview', branch: string, pr: number} | string} the deploy, or the reason to skip
 */
function target(event, seasonNext) {
    if (event.event === 'pull_request') {
        const pr = event.pull_requests?.[0]?.number;
        return Number.isInteger(pr) ? { action: 'preview', branch: `pr-${pr}`, pr } : 'no-pr';
    }
    if (event.event === 'push' && event.head_branch === 'season/next') {
        return { action: 'next', branch: 'next', pr: 0 };
    }
    if (event.event === 'push' && event.head_branch === 'main') {
        return { action: 'next', branch: seasonNext ? 'main-latest' : 'next', pr: 0 };
    }
    return 'branch';
}

/**
 * @param {{event: Record<string, any>, repo: string, bindings: {production: Bindings, preview: Bindings}, seasonNext: boolean}} input
 *   the `workflow_run` event, `owner/name` of this repository, the base branch's bindings, and whether `season/next` exists
 * @returns {Plan} what to do
 */
export function deployPlan({ event, repo, bindings, seasonNext }) {
    const sha = String(event.head_sha ?? '');
    const skipReason =
        event.conclusion === 'success'
            ? event.head_repository?.full_name !== repo
                ? 'fork'
                : bindingProblem(bindings)
            : `check-${event.conclusion}`;
    const found = skipReason === null ? target(event, seasonNext) : skipReason;
    if (typeof found === 'string') {
        return { action: 'skip', branch: '', sha, pr: 0, reason: found };
    }
    return { ...found, sha, reason: '' };
}
