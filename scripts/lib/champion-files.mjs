// Writes the champion files an eval run returns, one JSON file per genome, into one directory, and reads a directory of
// them back (the `championsDir` option of `champions-v1`).
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
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

/** Files in a champions directory that are not champion files. */
const NOT_CHAMPIONS = new Set(['index.json', 'skip-cells.json']);

/**
 * @param {string} dir a directory of champion files (`npm run train:export`'s output)
 * @returns {Record<string, any>[]} the parsed champion files, in file-name order
 * @throws {Error} when the directory does not exist, holds no champion file, or a file is not JSON
 */
export function readChampionFiles(dir) {
    if (!existsSync(dir)) {
        throw new Error(`championsDir: ${dir} does not exist (write it with npm run train:export)`);
    }
    const names = readdirSync(dir)
        .filter((name) => name.endsWith('.json') && !NOT_CHAMPIONS.has(name))
        .sort();
    if (names.length === 0) {
        throw new Error(`championsDir: no champion .json files in ${dir}`);
    }
    return names.map((name) => {
        try {
            return JSON.parse(readFileSync(join(dir, name), 'utf8'));
        } catch (error) {
            throw new Error(`championsDir: ${join(dir, name)}: ${/** @type {Error} */ (error).message}`, {
                cause: error,
            });
        }
    });
}
