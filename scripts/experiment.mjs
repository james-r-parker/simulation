// The experiment ledger from the command line (docs/designs/agent-workflow.md, Experiment ledger).
//
// Usage:
//   node scripts/experiment.mjs new --plan <doc.md> [--task <T12>] [--stream <name>]
//   node scripts/experiment.mjs list [--plan <doc.md>] [--since <YYYY-MM-DD>] [--outcome <o>]
//   node scripts/experiment.mjs tally [--since <YYYY-MM-DD>]
//   node scripts/experiment.mjs renumber <E<id>>
import { fileURLToPath } from 'node:url';
import { parseFlags } from './lib/cli-args.mjs';
import { runIfEntrypoint } from './lib/cli-entrypoint.mjs';
import { gitIn } from './lib/experiment-ids.mjs';
import { createRecord } from './lib/experiment-new.mjs';
import { listLines, tallyLines } from './lib/experiment-report.mjs';
import { renumber } from './lib/experiment-renumber.mjs';
import { readLedger } from './lib/ledger.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const USAGE = `usage: node scripts/experiment.mjs new --plan <doc.md> [--task <T12>] [--stream <name>]
       node scripts/experiment.mjs list [--plan <doc.md>] [--since <YYYY-MM-DD>] [--outcome <o>]
       node scripts/experiment.mjs tally [--since <YYYY-MM-DD>]
       node scripts/experiment.mjs renumber <E<id>>`;

/**
 * @param {string} key the option the flag sets
 * @returns {(value: string | undefined) => [string, string]} a `parseFlags` value parser that needs a non-empty value
 */
const text = (key) => (value) => {
    if (value === undefined || value === '') {
        throw new Error(`a flag needs a value\n${USAGE}`);
    }
    return [key, value];
};
const FLAGS = {
    new: { plan: '--plan', task: '--task', stream: '--stream' },
    list: { plan: '--plan', since: '--since', outcome: '--outcome' },
    tally: { since: '--since' },
};

/**
 * @param {'new' | 'list' | 'tally'} command the command
 * @param {string[]} argv its flags
 * @returns {Record<string, any>} the parsed options
 */
function options(command, argv) {
    const valueFlags = Object.fromEntries(Object.entries(FLAGS[command]).map(([key, flag]) => [flag, text(key)]));
    return parseFlags(argv, { valueFlags, defaults: {}, usage: USAGE });
}

/**
 * @typedef {object} Deps
 * @property {string} root the repository root
 * @property {import('./lib/experiment-ids.mjs').Git} git a git runner
 * @property {string} today the date, `YYYY-MM-DD`
 * @property {(line: string) => void} print where output goes
 */

/** @type {Record<string, (rest: string[], deps: Deps) => void>} */
const COMMANDS = {
    new(rest, { root, git, today, print }) {
        const opts = options('new', rest);
        if (!/^[a-z0-9-]+\.md$/.test(opts.plan ?? '')) {
            throw new Error(`new needs --plan <doc.md>, the design doc file name\n${USAGE}`);
        }
        git(['fetch', 'origin', '--quiet']);
        print(createRecord(root, /** @type {any} */ (opts), today, git));
    },
    list(rest, { root, print }) {
        listLines(readLedger(root), options('list', rest)).forEach((line) => print(line));
    },
    tally(rest, { root, print }) {
        tallyLines(readLedger(root), options('tally', rest)).forEach((line) => print(line));
    },
    renumber(rest, { root, git, print }) {
        if (rest.length !== 1) {
            throw new Error(USAGE);
        }
        const { to, files } = renumber(root, String(rest[0]), git);
        print(`${rest[0]} -> ${to}; rewrote ${files.length} file${files.length === 1 ? '' : 's'}`);
    },
};

/**
 * @param {string[]} argv the arguments after the script name
 * @param {Partial<Deps>} [given] the repository, git runner, date and output
 * @returns {number} the exit code
 */
export function run(argv, given = {}) {
    const [command = '', ...rest] = argv;
    const root = given.root ?? ROOT;
    const deps = { root, git: gitIn(root), today: new Date().toISOString().slice(0, 10), print: console.log, ...given };
    try {
        if (!Object.hasOwn(COMMANDS, command)) {
            throw new Error(USAGE);
        }
        COMMANDS[command](rest, deps);
        return 0;
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        return 1;
    }
}

/* v8 ignore start -- thin entrypoint; `run` is tested */
await runIfEntrypoint(process.argv[1] === fileURLToPath(import.meta.url), process.argv.slice(2), async (args) =>
    run(args),
);
/* v8 ignore stop */
