import { LIVE_POLICY, POLICIES } from '../../js/evo/policies/index.js';

// The `RunConfig` record: the first event every run-style tool logs, so a log says which policy and config it ran, and
// the `--policy` flag the tools that run a policy share.

/**
 * @typedef {object} RunConfigFields
 * @property {string} tool the script that logs the record (`replay`, `eval`, `screen`, `train`, `drill`)
 * @property {string | null} policy the resolved policy name (never `live`), or null when the tool runs none
 * @property {string} configHash the hash of the world config the run used
 * @property {number[] | null} seeds the seeds, or null when the tool draws its own
 * @property {number | null} ticks the ticks per seed or episode, or null when the tool sets none
 * @property {Record<string, any>} [extra] tool-specific fields kept beside the shared ones
 */

/**
 * @param {RunConfigFields} fields what the run is
 * @returns {Record<string, any>} an info record named `RunConfig`, for a sink or `SimLog.log`
 */
export function runConfigRecord({ tool, policy, configHash, seeds, ticks, extra = {} }) {
    return { level: 'info', event: 'RunConfig', tool, policy, configHash, seeds, ticks, ...extra };
}

/**
 * Logs the `RunConfig` record through a sim log.
 * @param {import('../../js/sim/log.js').SimLog} log the log
 * @param {RunConfigFields} fields what the run is
 * @returns {void}
 */
export function logRunConfig(log, fields) {
    const { level, event, ...rest } = runConfigRecord(fields);
    log.log(level, event, rest);
}

/**
 * @param {string | undefined} value a `--policy` value: a policy name, or `live`
 * @param {string} usage the tool's usage line, appended to the error
 * @returns {string} the registered name (`live` is `LIVE_POLICY`)
 * @throws {Error} on an unknown name, listing the known ones
 */
export function resolvePolicyFlag(value, usage) {
    const name = value === 'live' ? LIVE_POLICY : value;
    if (name === undefined || !Object.hasOwn(POLICIES, name)) {
        throw new Error(
            `--policy: Unknown policy "${value}"; known: live, ${Object.keys(POLICIES).join(', ')}\n${usage}`,
        );
    }
    return name;
}
