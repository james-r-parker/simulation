// Appends one JSON line per record to a file through a buffered write stream.
import { createWriteStream, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * @typedef {object} JsonlSink
 * @property {(record: Record<string, any>) => void} sink Appends one record as a line.
 * @property {() => Promise<void>} close Resolves once every line is flushed to the file.
 */

/**
 * Creates the file's parent directories and opens it for appending.
 * @param {string} path The JSONL file path.
 * @returns {JsonlSink} The sink and its close function.
 */
export function createJsonlSink(path) {
    mkdirSync(dirname(path), { recursive: true });
    const stream = createWriteStream(path, { flags: 'a' });
    return {
        sink(record) {
            stream.write(`${JSON.stringify(record)}\n`);
        },
        close() {
            return new Promise((resolve, reject) => {
                stream.once('error', reject);
                stream.end(() => resolve());
            });
        },
    };
}
