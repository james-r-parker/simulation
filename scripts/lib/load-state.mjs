// Machine load for the gates that measure time. Load only ever slows a measurement, so a pass under load is still a
// pass; a failure under load is inconclusive (docs/designs/quality-gates-and-test-tiers.md, Phase 3).
import { readFileSync } from 'node:fs';
import { cpus } from 'node:os';

/** One-minute load average above `cores / BUSY_DIVISOR` counts as a busy machine. */
export const BUSY_DIVISOR = 8;
/** The most a busy machine stretches a test timeout. Measured 2026-11-07: 2.9x on the step bench at load 11 to 39. */
export const MAX_LOAD_SCALE = 4;

/**
 * @param {Record<string, string | undefined>} [env] reads `CHECK_LOADAVG_FILE` (a `/proc/loadavg` fixture)
 * @returns {number} the one-minute load average; 0 when it cannot be read
 */
export function readLoad(env = process.env) {
    try {
        return Number(readFileSync(env.CHECK_LOADAVG_FILE || '/proc/loadavg', 'utf8').split(/\s+/)[0]) || 0;
    } catch {
        return 0;
    }
}

/** @returns {number} the CPU thread count */
export function coreCount() {
    return Math.max(1, cpus().length);
}

/**
 * @param {number} load one-minute load average
 * @param {number} cores CPU thread count
 * @returns {boolean} whether the load is above the busy limit
 */
export function isBusy(load, cores) {
    return load > cores / BUSY_DIVISOR;
}

/**
 * @param {number} load one-minute load average
 * @param {number} cores CPU thread count
 * @returns {number} what a time limit is multiplied by: 1 on a quiet machine (so a quiet run is as strict as ever),
 *   up to MAX_LOAD_SCALE as the load passes the busy limit
 */
export function loadScale(load, cores) {
    if (!isBusy(load, cores)) {
        return 1;
    }
    return Math.min(MAX_LOAD_SCALE, Math.max(2, Math.ceil(load / (cores / BUSY_DIVISOR) / 2)));
}
