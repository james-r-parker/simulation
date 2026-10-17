// The debug bundle: everything `npm run replay` needs to reproduce the run on screen, as JSON the page downloads.

/** The file name the replay command reads the config overrides from. */
export const BUNDLE_CONFIG_FILE = 'replay-config.json';

/**
 * @typedef {object} BundleInput
 * @property {Record<string, any>} ready the newest `ready` message (seed, policy, hashes)
 * @property {Record<string, number>} overrides the config overrides the world was started with
 * @property {number} tick the tick to replay to
 * @property {string | null} [archive] the archive JSON the worker started from; null until Phase 5 stores one
 */

/**
 * @param {BundleInput} input what the run was
 * @returns {{app: string, seed: number, tick: number, policy: string, configHash: string, rulesHash: string,
 *   config: Record<string, number>, archive: string | null, configFile: string, replay: string}} the bundle; `replay`
 *   is the command that reproduces the run once `config` is saved as `configFile`
 * @throws {Error} when there is no `ready` message, since there is no world to describe
 */
export function buildDebugBundle({ ready, overrides, tick, archive = null }) {
    if (ready === null || ready === undefined) {
        throw new Error('buildDebugBundle: no ready message yet, so there is no run to describe');
    }
    return {
        app: 'v6',
        seed: ready.seed,
        tick,
        policy: ready.policy,
        configHash: ready.configHash,
        rulesHash: ready.rulesHash,
        config: { ...overrides },
        archive,
        configFile: BUNDLE_CONFIG_FILE,
        replay: `npm run replay -- --seed ${ready.seed} --config ${BUNDLE_CONFIG_FILE} --policy ${ready.policy} --ticks ${tick}`,
    };
}
