// Whether an archive's champions may be published (docs/designs/training-stages.md, "Stage-local archive evidence"): an
// export candidate needs recorded evaluation under the target rules, and an easy-stage score alone cannot qualify it.
// Stage and rules identifiers survive snapshots and resume, so the archive says which world its last generation ran in.
// Pure.

import { endsInTargetWorld } from './curriculum.js';

/**
 * @param {Record<string, any>} archiveJson a parsed `archive-<g>.json`: its `rulesHash` (the world of the last generation,
 *   a review's included) and its `stages` record
 * @param {string} targetHash the target world's `rulesHash`
 * @returns {{eligible: boolean, reason: string | null}} whether the champions may be published, and why not
 */
export function exportEligibility(archiveJson, targetHash) {
    const stages = archiveJson.stages;
    if (!Array.isArray(stages) || stages.length === 0) {
        return { eligible: false, reason: 'it records no training stages' };
    }
    if (archiveJson.rulesHash !== targetHash) {
        return { eligible: false, reason: 'its last generation ran in a world that is not the target world' };
    }
    if (!endsInTargetWorld(stages, targetHash)) {
        return { eligible: false, reason: 'its last stage is not the target world' };
    }
    return { eligible: true, reason: null };
}
