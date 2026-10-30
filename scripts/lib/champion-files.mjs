// Writes the champion files an eval run returns, one JSON file per genome, into one directory.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * @param {string} outPath the eval report path
 * @returns {string} the directory the run's champion files go in: the report path without `.json`, plus `-champions`
 */
export function championsDirFor(outPath) {
    return `${outPath.replace(/\.json$/, '')}-champions`;
}

/**
 * @param {readonly {champions?: Record<string, any>[]}[]} results the per-seed eval results
 * @param {string} dir the directory to write into (created)
 * @returns {number} how many files were written
 */
export function writeChampionFiles(results, dir) {
    const files = results.flatMap((result) => result.champions ?? []);
    mkdirSync(dir, { recursive: true });
    for (const file of files) {
        writeFileSync(join(dir, `${file.name}.json`), `${JSON.stringify(file)}\n`);
    }
    return files.length;
}
