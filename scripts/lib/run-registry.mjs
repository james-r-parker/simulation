// The record of detached runs (scripts/run-detached.sh): a JSON array in <runs dir>/runs.json, one entry per run.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * @typedef {object} RunRecord
 * @property {string} name unique run name
 * @property {string} cmd the command line, shell-quoted words joined by spaces
 * @property {number} pid the detached wrapper's process id
 * @property {string} dir the runs directory
 * @property {string} cwd where the command runs (the frozen copy when there is one)
 * @property {string | null} frozen the frozen copy's directory, or null
 * @property {string} started ISO start time
 */

/**
 * @param {string} file the registry file
 * @returns {RunRecord[]} the runs recorded so far (none when the file is missing)
 */
export function readRuns(file) {
    if (!existsSync(file)) {
        return [];
    }
    const runs = JSON.parse(readFileSync(file, 'utf8'));
    if (!Array.isArray(runs)) {
        throw new Error(`${file} is not a JSON array`);
    }
    return runs;
}

/**
 * Appends a run, refusing a name already recorded. The file is replaced atomically (callers serialise with a lock).
 * @param {string} file the registry file
 * @param {RunRecord} record the run
 * @returns {void}
 */
export function addRun(file, record) {
    const runs = readRuns(file);
    if (runs.some((run) => run.name === record.name)) {
        throw new Error(`run name already recorded: ${record.name}`);
    }
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, `${JSON.stringify([...runs, record], null, 2)}\n`);
    renameSync(tmp, file);
}

/**
 * Runs the CLI: `add <file> <name> <cmd> <pid> <dir> <cwd> <frozen|-> <started>`.
 * @param {string[]} argv arguments after the script name
 * @returns {number} exit status
 */
export function main(argv) {
    const [verb, file, name, cmd, pid, dir, cwd, frozen, started] = argv;
    if (verb !== 'add' || started === undefined) {
        console.error('usage: run-registry.mjs add <file> <name> <cmd> <pid> <dir> <cwd> <frozen|-> <started>');
        return 2;
    }
    try {
        addRun(file, { name, cmd, pid: Number(pid), dir, cwd, frozen: frozen === '-' ? null : frozen, started });
        return 0;
    } catch (error) {
        console.error(`${error}`);
        return 1;
    }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    process.exitCode = main(process.argv.slice(2));
}
