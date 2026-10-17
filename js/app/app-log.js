// Structured console records for the main thread: `{ level, event, ...fields }`, one per call, never per frame.

/** The console method each level uses. */
const METHODS = Object.freeze({ debug: 'debug', info: 'info', warn: 'warn', error: 'error' });

/**
 * Writes one structured record to the console.
 * @param {'debug' | 'info' | 'warn' | 'error'} level the severity
 * @param {string} event the event name, e.g. `WorkerRestarted`
 * @param {Record<string, any>} [fields] the record's fields
 * @param {Record<string, any>} [sink] where to write; the console by default
 * @returns {void}
 * @throws {Error} when the level is unknown
 */
export function appLog(level, event, fields = {}, sink = console) {
    if (!Object.hasOwn(METHODS, level)) {
        throw new Error(`appLog: unknown level "${level}", expected one of ${Object.keys(METHODS).join(', ')}`);
    }
    sink[METHODS[level]]({ level, event, ...fields });
}
