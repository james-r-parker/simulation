// What exam rows 6 and 7 read (docs/designs/training-stages.md, The exam): the two eval reports and the keep-rule report of
// row 6, and the drill of a directory of saved champions of row 7. The verdicts are `js/evo/exam-target.js`.
import { readFileSync } from 'node:fs';
import { fileSubject } from './drill-subjects.mjs';
import { readChampionFiles } from './champion-files.mjs';
import { DRILLS } from '../../js/evo/drill-scenarios.js';
import { drillReadings } from '../../js/evo/gate-readings.js';
import { validateReport } from '../../js/evo/report.js';
import { createConfig } from '../../js/sim/config.js';
import { drillGenomes } from '../drill.mjs';
import { EXAM_SEED } from './exam-readings.mjs';

/**
 * @param {string | null} path an eval report
 * @returns {Record<string, any> | null} the validated report; null when no path is given
 * @throws {Error} when the file is not a valid report
 */
export function readWorldReport(path) {
    if (path === null) {
        return null;
    }
    const report = JSON.parse(readFileSync(path, 'utf8'));
    validateReport(report);
    return report;
}

/**
 * @param {string | null} path the `--json` output of `npm run eval:compare -- <live> <champions> --keep-rule`
 * @returns {{seedCount: number, keepRule: {worse: boolean}} | null} the keep-rule report; null when no path is given
 * @throws {Error} when the file holds no `keepRule` or `seedCount`
 */
export function readKeepReport(path) {
    if (path === null) {
        return null;
    }
    const json = JSON.parse(readFileSync(path, 'utf8'));
    if (typeof json.seedCount !== 'number' || typeof json.keepRule?.worse !== 'boolean') {
        throw new Error(`${path}: not a keep-rule report (write it with eval:compare --keep-rule --json)`);
    }
    return { seedCount: json.seedCount, keepRule: json.keepRule };
}

/**
 * @param {readonly Record<string, any>[]} rows a drill table: a row per champion, then the reference
 * @param {number} genomeCount how many leading rows are champions
 * @param {readonly string[]} names the drills to read
 * @returns {import('../../js/evo/exam-target.js').DrillShares} each drill's pooled win share over the champions that ran
 *   it and its `edgeLow` (null for a drill no champion ran)
 */
export function drillShares(rows, genomeCount, names) {
    const readings = drillReadings(/** @type {any} */ (rows), genomeCount, names);
    const drills = Object.fromEntries(
        names.map((name) => {
            const cells = rows.slice(0, genomeCount).flatMap((row) => (row.cells[name] ? [row.cells[name]] : []));
            const trials = cells.reduce((sum, c) => sum + c.trials, 0);
            const wins = cells.reduce((sum, c) => sum + c.wins, 0);
            return [name, { winShare: trials === 0 ? null : wins / trials, edgeLow: readings[name].edgeLow }];
        }),
    );
    return { drills };
}

/**
 * Drills a directory of saved champions (`npm run eval -- --save-champions <n>`'s `<out>-champions`) on the exam seed.
 * @param {string} dir the champions directory
 * @param {{named: readonly string[], trials: number, workers?: number, log: import('../../js/sim/log.js').SimLog}} run the
 *   drills to read, the trials and the pool
 * @returns {Promise<import('../../js/evo/exam-target.js').DrillShares>} the saved champions' pooled drills
 * @throws {Error} when the directory is missing, empty or holds a file that does not fit the default world
 */
export async function descendantShares(dir, { named, trials, workers, log }) {
    const config = createConfig({});
    const genomes = readChampionFiles(dir).map((file) => fileSubject(file, config));
    const drills = DRILLS.map((d) => d.name);
    const args = /** @type {any} */ ({ drills, seed: EXAM_SEED, trials, workers });
    const rows = await drillGenomes(args, { genomes, config: {}, log });
    return drillShares(rows, genomes.length, named);
}
