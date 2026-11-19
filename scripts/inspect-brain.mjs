// Writes a labelled brain dossier for one champion on one deterministic drill.

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareTrials } from '../js/evo/brain-ablation.js';
import { skipTable, traitRow, unitTable } from '../js/evo/brain-dossier.js';
import { traceSummary } from '../js/evo/brain-trace.js';
import { inputLabels, outputLabels, unitLabel } from '../js/evo/brain-labels.js';
import { DRILLS } from '../js/evo/drill-scenarios.js';
import { brainLayout } from '../js/sim/brain-layout.js';
import { createConfig } from '../js/sim/config.js';
import { createSimLog } from '../js/sim/log.js';
import { exitCodeOf } from './lib/cli-args.mjs';
import { writeDossier } from './lib/brain-inspection-report.mjs';
import { parseArgs, USAGE } from './lib/inspect-brain-args.mjs';
import { createJsonlSink } from './lib/jsonl-sink.mjs';
import { runPool } from './lib/worker-pool.mjs';
import { loadChampions } from './memory-probe.mjs';

const WORKER_URL = new URL('./inspect-worker.mjs', import.meta.url);
const DRILL_NAMES = DRILLS.map((drill) => drill.name);
/**
 * Runs the dossier command and writes its reports.
 * @param {Record<string, any>} args parsed options
 * @param {{logDir?: string}} [io] the diagnostic log directory
 * @returns {Promise<Record<string, any>>} the inspected champion and report files
 */
export async function runInspect(args, { logDir = '.sim/logs' } = {}) {
    requireOptions(args);
    if (args.workers > 4) {
        throw new Error(`--workers must be at most 4 while training runs share the machine\n${USAGE}`);
    }
    if (args.traceTrials > args.trials) {
        throw new Error(`--trace-trials must be no greater than --trials\n${USAGE}`);
    }
    const logFile = createJsonlSink(join(logDir, `inspect-${args.seed}x${args.trials}.jsonl`));
    const log = createSimLog(logFile.sink, { level: 'debug' });
    try {
        const config = args.config === null ? {} : JSON.parse(readFileSync(args.config, 'utf8'));
        const genomes = loadChampions(args.champions, { config, log });
        const subject = selectChampion(genomes, args.name, log);
        const drill = DRILLS.find((item) => item.name === args.drill);
        if (drill === undefined) {
            throw new Error(`--drill: unknown drill "${args.drill}"; known: ${DRILL_NAMES.join(', ')}`);
        }
        if (subject.spec !== drill.spec) {
            throw new Error(
                `inspect: champion ${subject.name} has specialisation ${subject.spec}; ${drill.name} requires ${drill.spec}`,
            );
        }
        const edits = args.edit === null ? null : readEdits(args.edit);
        const report = await buildReport({ args, subject, drill, config, edits, log });
        writeDossier(report, args.out);
        return report;
    } catch (error) {
        logFailure(log, error, args);
        throw error;
    } finally {
        await logFile.close();
    }
}

/**
 * Builds all worker jobs and assembles their deterministic results.
 * @param {Record<string, any>} run the parsed options and selected records
 * @returns {Promise<Record<string, any>>} report data ready for output formatting
 */
async function buildReport({ args, subject, drill, config, edits, log }) {
    const layout = brainLayout(createConfig(config));
    const labels = /** @type {{inputs: string[], outputs: string[], units: string[]}} */ ({
        inputs: inputLabels(createConfig(config)),
        outputs: outputLabels(),
        units: Array.from({ length: layout.hidden }, (_, unit) => unitLabel(unit)),
    });
    const shared = { drill: drill.name, subject, seed: args.seed, trials: args.trials, config };
    const tasks = inspectionTasks(shared, layout.hidden, args.traceTrials, edits);
    const [base, ...rest] = await runPool(tasks, { workerUrl: WORKER_URL, workers: args.workers });
    const results = assembleResults({
        base,
        rest,
        hidden: layout.hidden,
        traceTrials: args.traceTrials,
        edits,
        labels,
    });
    logReportResults({
        log,
        subject,
        drill: drill.name,
        base: base.trials,
        ablations: results.ablations,
        edit: results.edit,
    });
    return {
        subject,
        drill: drill.name,
        seed: args.seed,
        trials: args.trials,
        labels,
        units: unitTable(subject.weights, layout, labels, { top: args.top }),
        skip: skipTable(subject.weights, layout, labels, { top: args.top }),
        traits: traitRow(subject.weights, layout),
        ...results,
    };
}

/**
 * Creates worker jobs in report order.
 * @param {Record<string, any>} shared common task inputs
 * @param {number} hidden hidden unit count
 * @param {number} traceTrials trace trial count
 * @param {Array<Record<string, any>> | null} edits optional edit list
 * @returns {Array<Record<string, any>>} task messages
 */
function inspectionTasks(shared, hidden, traceTrials, edits) {
    /** @type {Array<Record<string, any>>} */
    const tasks = [{ kind: 'ablation', ...shared, unit: null }];
    for (let unit = 0; unit < hidden; unit++) {
        tasks.push({ kind: 'ablation', ...shared, unit });
    }
    for (let trial = 0; trial < traceTrials; trial++) {
        tasks.push({ kind: 'trace', ...shared, trial });
    }
    if (edits !== null) {
        tasks.push({ kind: 'edit', ...shared, edits });
    }
    return tasks;
}

/**
 * Pairs worker results and summarizes traces.
 * @param {{base: Record<string, any>, rest: Array<Record<string, any>>, hidden: number, traceTrials: number,
 *   edits: Array<Record<string, any>> | null, labels: {inputs: string[], outputs: string[], units: string[]}}} data worker result groups and labels
 * @returns {Record<string, any>} ablation rows, traces and optional edit result
 */
function assembleResults({ base, rest, hidden, traceTrials, edits, labels }) {
    const ablations = rest.slice(0, hidden).map(({ unit, trials }) => ({
        unit,
        trials,
        comparison: compareTrials(base.trials, trials),
    }));
    const traces = rest.slice(hidden, hidden + traceTrials).map((result) => ({
        ...result,
        summary: traceSummary(result.trace, labels),
    }));
    const rawEdit = edits === null ? null : rest[hidden + traceTrials];
    const edit =
        rawEdit === null
            ? null
            : {
                  edits,
                  trials: rawEdit.trials,
                  comparison: compareTrials(base.trials, rawEdit.trials),
              };
    return { ablations, traces, edit };
}

/**
 * Logs the intact, ablated and edited trial results.
 * @param {Record<string, any>} report the records and logger
 * @returns {void}
 */
function logReportResults({ log, subject, drill, base, ablations, edit }) {
    logTrials({ log, subject, drill, unit: null, trials: base, edited: false });
    for (const row of ablations) {
        log.log('info', 'InspectAblation', {
            champion: subject.name,
            genomeId: subject.id,
            drill,
            unit: row.unit,
            winShare: row.comparison.afterWinShare,
            delta: row.comparison.change,
            mcnemarP: row.comparison.mcnemarP,
        });
        logTrials({ log, subject, drill, unit: row.unit, trials: row.trials ?? [], edited: false });
    }
    if (edit !== null) {
        logEdit({ log, subject, drill, edit });
    }
}

/**
 * Logs an edited result and its trial rows.
 * @param {Record<string, any>} data the event details
 * @returns {void}
 */
function logEdit({ log, subject, drill, edit }) {
    log.log('info', 'InspectEdit', {
        champion: subject.name,
        drill,
        edits: edit.edits,
        before: edit.comparison.beforeWinShare,
        after: edit.comparison.afterWinShare,
        mcnemarP: edit.comparison.mcnemarP,
    });
    logTrials({ log, subject, drill, unit: null, trials: edit.trials, edited: true });
}

/**
 * Writes one structured record for every trial result.
 * @param {Record<string, any>} data the logger and trial context
 * @returns {void}
 */
function logTrials({ log, subject, drill, unit, trials, edited }) {
    for (const row of trials) {
        log.log('debug', 'InspectTrial', {
            champion: subject.name,
            genomeId: subject.id,
            drill,
            trial: row.trial,
            unit,
            edited,
            won: row.won,
            ticks: row.ticks,
        });
    }
}

/**
 * Selects one champion by exact name, or the only loaded champion.
 * @param {Record<string, any>[]} genomes loaded champions
 * @param {string | null} name requested champion name
 * @param {import('../js/sim/log.js').SimLog} log the event log
 * @returns {Record<string, any>} selected champion
 */
function selectChampion(genomes, name, log) {
    if (name === null && genomes.length === 1) {
        return genomes[0];
    }
    const subject = genomes.find((genome) => genome.name === name);
    if (subject !== undefined) {
        return subject;
    }
    const names = genomes.map((genome) => genome.name);
    log.log('error', 'InspectNameUnknown', { name, names });
    throw new Error(`--name: unknown champion "${name}"; known: ${names.join(', ')}`);
}

/**
 * Reads an edit array from JSON.
 * @param {string} path the JSON file
 * @returns {Array<Record<string, any>>} edit operations
 */
function readEdits(path) {
    const edits = JSON.parse(readFileSync(path, 'utf8'));
    if (!Array.isArray(edits)) {
        throw new Error(`--edit: expected a JSON array in ${path}`);
    }
    return edits;
}

/**
 * Validates required flags before creating output or log files.
 * @param {Record<string, any>} args parsed options
 * @returns {void}
 */
function requireOptions(args) {
    for (const key of ['champions', 'drill', 'out']) {
        if (args[key] === null) {
            throw new Error(`missing --${key}\n${USAGE}`);
        }
    }
}

/**
 * Records a structured diagnostic for edit failures.
 * @param {import('../js/sim/log.js').SimLog} log the log
 * @param {unknown} error the thrown error
 * @param {Record<string, any>} args command options
 * @returns {void}
 */
function logFailure(log, error, args) {
    const message = error instanceof Error ? error.message : String(error);
    if (args.edit !== null && message.includes('brain edit')) {
        log.log('error', 'InspectEditInvalid', { edit: args.edit, bounds: message });
    }
}

/**
 * @param {string[]} argv command-line arguments
 * @returns {Promise<number>} process exit code
 */
export function main(argv) {
    return exitCodeOf(async () => {
        const args = parseArgs(argv);
        await runInspect(args);
        console.log(`Wrote brain inspection dossier to ${args.out}`);
    });
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
    process.exitCode = await main(process.argv.slice(2));
}
