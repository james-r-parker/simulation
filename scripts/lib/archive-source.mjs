// What `drill` and `reflex` read their genomes and world rules from: a trainer or policy archive file, and a config
// file that may be a training stage (docs/designs/training-stages.md, Phase 6, T33).

import { readFileSync } from 'node:fs';
import { decodeArchive } from '../../js/evo/archive-codec.js';
import { TRAINER_DESCRIPTOR } from '../../js/evo/trainer.js';
import { createConfig, rulesHash } from '../../js/sim/config.js';

/**
 * The keys of a stage file that size and fill its training world. A drill stages its own arena and agents, so these
 * would replace that staging (`initialAgents` would add 60 agents to it); the rule keys and `specialisations` stay.
 */
const STAGE_WORLD_KEYS = Object.freeze([
    'worldWidth',
    'worldHeight',
    'initialAgents',
    'maxAgents',
    'minAgents',
    'maxFood',
    'initialFood',
    'initialEnergy',
    'maxEnergy',
    'hashCellSize',
    'foodPatchRadius',
    'wallGaps',
    'herdCount',
    'refugeCount',
    'coldMarginWidth',
]);

/**
 * @param {string | null} path a `--config` file, or null for none
 * @returns {Record<string, any>} its config overrides without the keys that size and fill a stage's world, so a stage
 *   file can be given as `--config` and a drill still stages its own arena (`{}` for none)
 */
export function readDrillConfig(path) {
    if (path === null) {
        return {};
    }
    const json = JSON.parse(readFileSync(path, 'utf8'));
    return Object.fromEntries(Object.entries(json).filter(([key]) => !STAGE_WORLD_KEYS.includes(key)));
}

/**
 * Decodes a trainer archive the way `train:export` does: the archive's `rulesHash` is the curriculum stage's, so the
 * running config's is put in its place, and the layout, version and descriptor (v7) are what must fit.
 * @param {Record<string, any>} json a parsed `archive-<g>.json`
 * @param {Readonly<Record<string, any>>} config the config the archive is checked against
 * @param {import('../../js/sim/log.js').SimLog} [log] where a rejection is logged
 * @returns {import('../../js/evo/archive.js').Archive} the archive
 * @throws {Error} when the version, descriptor or layout does not fit
 */
export function decodeTrainerArchive(json, config, log) {
    return decodeArchive({ ...json, rulesHash: rulesHash(config) }, config, log, TRAINER_DESCRIPTOR);
}

/**
 * @param {string} path an archive file: a trainer's (descriptor v7) or a policy's (v1)
 * @param {Record<string, any>} overrides the config overrides it is checked against
 * @param {import('../../js/sim/log.js').SimLog} log where a rejection is logged
 * @returns {import('../../js/evo/archive.js').Archive} the archive, by the descriptor the file names
 * @throws {Error} when the file does not fit the layout
 */
export function readArchiveFile(path, overrides, log) {
    const json = JSON.parse(readFileSync(path, 'utf8'));
    const config = createConfig(overrides);
    return json.descriptor === TRAINER_DESCRIPTOR.name
        ? decodeTrainerArchive(json, config, log)
        : decodeArchive(json, config, log);
}
