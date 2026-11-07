// Reflex throughput bench (`npm run bench:reflex`): genomes per second on the four forager cases (one core, tables built
// beforehand, the Rust brain kernel through forwardAll) as `bench.reflex_genomes_per_s`, and the same genomes through the
// forager drills (`drillSubject` over `DRILLS`) for the ratio `bench.reflex_vs_drill`. A tool, not a gate: run it
// under `flock /tmp/claude-1000/cpu.lock` on a quiet machine (AGENTS.md, Commands).
import { performance } from 'node:perf_hooks';
import { DRILLS } from '../js/evo/drill-scenarios.js';
import { drillSubject } from '../js/evo/drill.js';
import { casesFor } from '../js/evo/reflex-cases.js';
import { evalReflex } from '../js/evo/reflex-eval.js';
import { REFLEX_RANDOM_BRAINS, reflexRandomBrains } from '../js/evo/reflex-score.js';
import { REFLEX_TRIALS, SEQUENCE_TICKS } from '../js/evo/reflex-stage.js';
import { buildCaseTable } from '../js/evo/reflex-table.js';
import { exitCodeOf, intValue, parseFlags } from './lib/cli-args.mjs';

const FORAGER = 0;
const USAGE =
    'usage: bench-reflex [--genomes <n>] [--reps <n>] [--drill-genomes <n>] [--drill-trials <n>] [--no-drill] [--json]';

/**
 * @typedef {object} BenchArgs
 * @property {number} genomes genomes per reflex evaluation (one batch, at most 512)
 * @property {number} reps timed reflex evaluations
 * @property {number} drillGenomes genomes run through the drills for the ratio
 * @property {number} drillTrials trials per drill
 * @property {boolean} noDrill whether to skip the drill timing
 * @property {boolean} json whether to print JSON
 */

/**
 * @param {string[]} argv command-line arguments after the script name
 * @returns {BenchArgs} parsed options
 */
export function parseArgs(argv) {
    return /** @type {BenchArgs} */ (
        parseFlags(argv, {
            valueFlags: {
                '--genomes': (v, f) => ['genomes', intValue(f, v, 1, USAGE)],
                '--reps': (v, f) => ['reps', intValue(f, v, 1, USAGE)],
                '--drill-genomes': (v, f) => ['drillGenomes', intValue(f, v, 1, USAGE)],
                '--drill-trials': (v, f) => ['drillTrials', intValue(f, v, 1, USAGE)],
            },
            booleanFlags: { '--no-drill': 'noDrill', '--json': 'json' },
            defaults: { genomes: 512, reps: 5, drillGenomes: 2, drillTrials: 32, noDrill: false, json: false },
            usage: USAGE,
        })
    );
}

/**
 * @param {number} count how many genomes
 * @returns {import('../js/evo/reflex-eval.js').ReflexSubject[]} `count` random forager brains, from seeds 7 upward, so
 *   the run replays
 */
function genomesOf(count) {
    const blocks = Array.from({ length: Math.ceil(count / REFLEX_RANDOM_BRAINS) }, (_, block) =>
        reflexRandomBrains(casesFor(FORAGER)[0], { seed: 7 + block }),
    );
    return blocks
        .flat()
        .slice(0, count)
        .map((s, i) => ({ ...s, id: i + 1 }));
}

/**
 * Times the reflex evaluation of `genomes` over the forager cases, tables built beforehand and one run to warm up.
 * @param {{genomes: number, reps: number}} args the genome count and the repetitions
 * @returns {{genomesPerS: number, forwardsPerGenome: number, ms: number}} the throughput, the brain forwards a genome
 *   costs (every tick of every sequence) and the milliseconds per genome
 */
export function timeReflex({ genomes, reps }) {
    const tables = casesFor(FORAGER).map((c) => buildCaseTable(c, { trials: REFLEX_TRIALS }));
    const subjects = genomesOf(genomes);
    evalReflex(subjects, tables);
    const start = performance.now();
    for (let rep = 0; rep < reps; rep++) {
        evalReflex(subjects, tables);
    }
    const seconds = (performance.now() - start) / 1000;
    const forwards = tables.reduce((sum, t) => sum + t.sequences.length * SEQUENCE_TICKS, 0);
    return {
        genomesPerS: (genomes * reps) / seconds,
        forwardsPerGenome: forwards,
        ms: (seconds * 1000) / (genomes * reps),
    };
}

/**
 * Times the forager drills over the same kind of genomes.
 * @param {{drillGenomes: number, drillTrials: number}} args the genome count and trials per drill
 * @returns {{genomesPerS: number, drills: number}} the throughput and how many drills a genome ran
 */
export function timeDrills({ drillGenomes, drillTrials }) {
    const drills = DRILLS.filter((d) => d.spec === FORAGER);
    const subjects = genomesOf(drillGenomes).map((s) => ({ ...s, spec: FORAGER }));
    const start = performance.now();
    for (const subject of subjects) {
        for (const drill of drills) {
            drillSubject(drill, subject, { trials: drillTrials });
        }
    }
    const seconds = (performance.now() - start) / 1000;
    return { genomesPerS: drillGenomes / seconds, drills: drills.length };
}

/**
 * @param {BenchArgs} args the options
 * @returns {Record<string, number>} the bench metrics
 */
export function runBench(args) {
    const reflex = timeReflex(args);
    /** @type {Record<string, number>} */
    const metrics = {
        'bench.reflex_genomes_per_s': reflex.genomesPerS,
        'bench.reflex_ms_per_genome': reflex.ms,
        'bench.reflex_forwards_per_genome': reflex.forwardsPerGenome,
    };
    if (!args.noDrill) {
        const drill = timeDrills(args);
        metrics['bench.drill_genomes_per_s'] = drill.genomesPerS;
        metrics['bench.reflex_vs_drill'] = reflex.genomesPerS / drill.genomesPerS;
    }
    return metrics;
}

/**
 * @param {string[]} argv command-line arguments after the script name
 * @param {(line: string) => void} [print] where the metrics go
 * @returns {Promise<number>} the process exit code
 */
export function main(argv, print = console.log) {
    return exitCodeOf(async () => {
        const args = parseArgs(argv);
        const metrics = runBench(args);
        if (args.json) {
            print(JSON.stringify(metrics, null, 2));
        } else {
            for (const [name, value] of Object.entries(metrics)) {
                print(`${name} ${value.toFixed(value < 10 ? 3 : 1)}`);
            }
        }
    });
}

if (import.meta.main) {
    process.exitCode = await main(process.argv.slice(2));
}
