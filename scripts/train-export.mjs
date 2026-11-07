// Exports a trained archive's champions (`npm run train:export`): one champion file per specialisation, the elite with
// the highest lower bound, plus an `index.json`. The files are what `npm run drill -- --champions`, `npm run league`
// and `npm run probe:memory` read; they are stamped for `--config` (default: the default world), the world they will be
// played in, not for the curriculum stage that trained them.
import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeArchive } from '../js/evo/archive-codec.js';
import { exportBestPerSpec } from '../js/evo/champion-export.js';
import { endsInTargetWorld } from '../js/evo/curriculum.js';
import { GENOME_SPECS } from '../js/evo/genome.js';
import { TRAINER_DESCRIPTOR } from '../js/evo/trainer.js';
import { createConfig, rulesHash } from '../js/sim/config.js';
import { exitCodeOf, parseFlags } from './lib/cli-args.mjs';
import { archiveSkipCells } from './lib/skip-cells-report.mjs';
import { readJson } from './lib/train-state.mjs';

const PUBLIC_CHAMPIONS = fileURLToPath(new URL('../public/champions', import.meta.url));
const USAGE = 'usage: train:export --archive <file> --out <dir> [--config <file.json>] [--label <name>]';

/**
 * @typedef {object} ExportArgs
 * @property {string} archive the trainer archive file
 * @property {string} out the output directory
 * @property {string | null} config config overrides the files are stamped for
 * @property {string | null} label the champion name prefix (default: the archive file's name)
 */

/**
 * @param {string[]} argv command-line arguments after the script name
 * @returns {ExportArgs} parsed options
 * @throws {Error} when `--archive` or `--out` is missing
 */
export function parseArgs(argv) {
    const args = /** @type {Record<string, any>} */ (
        parseFlags(argv, {
            valueFlags: {
                '--archive': (v) => ['archive', String(v)],
                '--out': (v) => ['out', String(v)],
                '--config': (v) => ['config', String(v)],
                '--label': (v) => ['label', String(v)],
            },
            defaults: { archive: null, out: null, config: null, label: null },
            usage: USAGE,
        })
    );
    if (args.archive === null || args.out === null) {
        throw new Error(`--archive and --out are required\n${USAGE}`);
    }
    return /** @type {ExportArgs} */ (args);
}

/**
 * Writes the champions.
 * @param {ExportArgs} args the options
 * @param {(line: string) => void} [print] where the skip-cells table goes (default nowhere; `skip-cells.json` is written
 *   either way)
 * @returns {Record<string, any>[]} the champion files written, in specialisation order
 * @throws {Error} naming the field when the archive does not fit the layout, or when it holds no tested elite
 */
export function runExport(args, print = () => {}) {
    const config = createConfig(args.config === null ? {} : readJson(args.config));
    const json = readJson(args.archive);
    // The archive's `rulesHash` is the curriculum stage's; the layout, version and descriptor are what must fit.
    const archive = decodeArchive({ ...json, rulesHash: rulesHash(config) }, config, undefined, TRAINER_DESCRIPTOR);
    if (
        `${resolve(args.out)}/`.startsWith(`${PUBLIC_CHAMPIONS}/`) &&
        !endsInTargetWorld(json.stages, rulesHash(config))
    ) {
        throw new Error(
            `${args.archive}: its last stage is not the target world, so its champions may not go into public/champions (export to another directory for local drills, tables and probes)`,
        );
    }
    const label = args.label ?? basename(args.archive).replace(/\.json$/, '');
    const files = exportBestPerSpec(archive, config, { label });
    if (files.length === 0) {
        throw new Error(`${args.archive} holds no elite to export`);
    }
    mkdirSync(args.out, { recursive: true });
    for (const file of files) {
        writeFileSync(join(args.out, `${file.name}.json`), `${JSON.stringify(file)}\n`);
    }
    const index = files.map((f) => ({
        file: `${f.name}.json`,
        specialisation: GENOME_SPECS[f.specialisation],
        cell: f.cell,
        genomeId: f.genomeId,
        fitness: f.fitness,
    }));
    writeFileSync(
        join(args.out, 'index.json'),
        `${JSON.stringify({ archive: basename(args.archive), generation: json.generation ?? null, champions: index }, null, 2)}\n`,
    );
    const skip = archiveSkipCells(archive, config);
    writeFileSync(join(args.out, 'skip-cells.json'), `${JSON.stringify(skip.json, null, 2)}\n`);
    skip.lines.forEach(print);
    return files;
}

/**
 * @param {string[]} argv command-line arguments after the script name
 * @returns {Promise<number>} the process exit code
 */
export async function main(argv) {
    return exitCodeOf(async () => {
        const files = runExport(parseArgs(argv), console.log);
        console.log(`wrote ${files.length} champion files`);
    });
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
    process.exitCode = await main(process.argv.slice(2));
}
