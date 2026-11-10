// The per-life bite detectors (hunter-practice.md Phase 1c, T22 and T23), from the `HunterLedger` records and the hunters
// alive:
//
// - `eval.hunter_carrion_idle_share`: the carcass energy eaten by hunter lives with zero kills over all hunter income. It
//   is `zeroKillCarcassOfIncome` of `splitHunterIncome` (js/evo/hunter-income-split.js), not a second implementation; the
//   lives are the dead (one record each) and the hunters alive at the last tick, at their end age.
// - `eval.hunter_recoil_per_life`: the ticks on which `recoil` (js/sim/feeding.js) charged `recoilEnergy`, over the same
//   lives. It reads `recoilStamp`, which `recoil` sets to the tick plus 1; after `step` that equals `world.tick`. The
//   ledger's bite cost also holds the bite's kick, so it cannot give recoils. A hunter that dies on the tick it recoils is
//   already zeroed and not counted.
//
// Both are detectors, never fitness. One growable log; nothing is allocated per tick.

import { BORN_CAUSE, EVENT_TYPE } from '../sim/events.js';
import { createLog, ensureRoom } from './growable-log.js';
import { splitHunterIncome } from './hunter-income-split.js';
import { none, ok } from './metrics-stats.js';

/**
 * @returns {Record<string, any>} an empty scene: one row per hunter death, and the recoil ticks so far
 */
export function createBiteLifeScene() {
    return {
        log: createLog(['kills', 'carcassEnergy', 'killEnergy', 'biteGainEnergy']),
        rows: 0,
        recoilLives: createLog(['energy']),
        recoilRows: 0,
        reflexMateBirths: 0,
        reflexSplitBirths: 0,
        reflexCohorts: new Map(),
        reflexSplitKills: 0,
        reflexSplitTicks: 0,
        reflexSameKills: 0,
        reflexSameTicks: 0,
    };
}

/**
 * Notes one event record when it is a `HunterLedger` (fields 4, 5, 9 and 10: the packed kills, the carcass energy, the kill
 * energy and the bite gain, as `noteHunterDeath` in js/sim/hunter-ledger.js writes them).
 * @param {Record<string, any>} scene the scene
 * @param {Float64Array} d the event ring data
 * @param {number} o the record offset
 * @param {Record<string, any>} [world] the world, needed for a mating birth event
 * @returns {void}
 */
export function noteBiteLifeRecord(scene, d, o, world) {
    if (d[o] === EVENT_TYPE.AGENT_BORN && d[o + 8] === BORN_CAUSE.MATE) {
        noteMatingBirth(scene, d, o, world);
        return;
    }
    if (d[o] === EVENT_TYPE.HUNTER_KILL) {
        noteCohortKill(scene, d, o);
        return;
    }
    if (d[o] === EVENT_TYPE.HUNTER_RECOIL_LIFE) {
        noteRecoil(scene, d, o);
        return;
    }
    if (d[o] !== EVENT_TYPE.HUNTER_LEDGER) {
        return;
    }
    noteLedger(scene, d, o);
}

/** @param {Record<string, any>} scene scene @param {Float64Array} d event ring @param {number} o offset @param {Record<string, any> | undefined} world sim world */
function noteMatingBirth(scene, d, o, world) {
    if (world === undefined) {
        return;
    }
    const slot = d[o + 2];
    if (world.huntBySpec[world.spec[slot]] !== 1) {
        return;
    }
    const split = world.biteSkipParent[slot] !== world.thrustSkipParent[slot];
    scene.reflexMateBirths += 1;
    scene.reflexSplitBirths += split ? 1 : 0;
    scene.reflexCohorts.set(world.genomeId[slot], { split });
}

/** @param {Record<string, any>} scene scene @param {Float64Array} d event ring @param {number} o offset */
function noteCohortKill(scene, d, o) {
    const cohort = scene.reflexCohorts.get(d[o + 2]);
    if (cohort !== undefined) {
        cohort.kills = (cohort.kills ?? 0) + 1;
    }
}

/** @param {Record<string, any>} scene scene @param {Float64Array} d event ring @param {number} o offset */
function noteRecoil(scene, d, o) {
    const row = scene.recoilRows++;
    ensureRoom(scene.recoilLives, row);
    scene.recoilLives.energy[row] = d[o + 3];
}

/** @param {Record<string, any>} scene scene @param {Float64Array} d event ring @param {number} o offset */
function noteLedger(scene, d, o) {
    const cohort = scene.reflexCohorts.get(d[o + 2]);
    if (cohort !== undefined) {
        const kills = Math.floor(d[o + 4] / 64);
        if (cohort.split) {
            scene.reflexSplitKills += kills;
            scene.reflexSplitTicks += d[o + 3];
        } else {
            scene.reflexSameKills += kills;
            scene.reflexSameTicks += d[o + 3];
        }
        scene.reflexCohorts.delete(d[o + 2]);
    }
    const row = scene.rows++;
    ensureRoom(scene.log, row);
    scene.log.kills[row] = Math.floor(d[o + 4] / 64);
    scene.log.carcassEnergy[row] = d[o + 5];
    scene.log.killEnergy[row] = d[o + 9];
    scene.log.biteGainEnergy[row] = d[o + 10];
}

/**
 * @deprecated Recoil is captured as charged energy in the sim and summarized per life at death.
 * @param {Record<string, any>} scene the scene
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function tickRecoil(scene, world) {
    void scene;
    void world;
}

/**
 * @param {Record<string, any>} scene the scene
 * @param {Record<string, any>} world the world at the last tick
 * @returns {import('./hunter-income-split.js').LedgerRecord[]} the dead lives, then the hunters alive at their end age
 */
function lives(scene, world) {
    const records = [];
    for (let row = 0; row < scene.rows; row++) {
        records.push({
            kills: scene.log.kills[row],
            carcassEnergy: scene.log.carcassEnergy[row],
            killEnergy: scene.log.killEnergy[row],
            biteGainEnergy: scene.log.biteGainEnergy[row],
        });
    }
    for (let slot = 0; world.alive !== undefined && slot < world.alive.length; slot++) {
        if (world.alive[slot] === 1 && world.huntBySpec[world.spec[slot]] === 1) {
            records.push({
                kills: world.ledgerKills[slot],
                carcassEnergy: world.ledgerCarcass[slot],
                killEnergy: world.ledgerKillEnergy[slot],
                biteGainEnergy: world.ledgerBiteGain[slot],
            });
        }
    }
    return records;
}

/**
 * @param {Record<string, any>} scene the scene
 * @param {Record<string, any>} world the world at the last tick
 * @returns {import('./metrics-stats.js').MetricRecord} the two per-life metrics
 */
export function biteLifeMetrics(scene, world) {
    const records = lives(scene, world);
    const split = splitHunterIncome(records);
    const recoilEnergies = observedRecoilLives(scene, world);
    const [splitKills, splitTicks, sameKills, sameTicks] = reflexTotals(scene, world);
    return {
        'eval.hunter_carrion_idle_share':
            split.income > 0 ? ok(split.zeroKillCarcassOfIncome) : none('no hunter income'),
        'eval.hunter_zero_kill_carcass_share': records.some((record) => record.carcassEnergy > 0)
            ? ok(split.zeroKillCarcassShare)
            : none('no carcass energy'),
        'eval.hunter_recoil_per_life': recoilEnergies.length > 0 ? ok(median(recoilEnergies)) : none('no hunter lives'),
        'eval.hunter_reflex_column_split_share':
            scene.reflexMateBirths > 0
                ? ok(scene.reflexSplitBirths / scene.reflexMateBirths)
                : none('no mating-born hunter children'),
        'eval.hunter_reflex_column_split_kill_rate':
            splitTicks > 0
                ? ok((1000 * splitKills) / splitTicks)
                : none('no observed agent-ticks in split-column mating-born hunters'),
        'eval.hunter_reflex_column_same_kill_rate':
            sameTicks > 0
                ? ok((1000 * sameKills) / sameTicks)
                : none('no observed agent-ticks in same-parent-column mating-born hunters'),
    };
}

/** @param {Record<string, any>} scene scene @param {Record<string, any>} world sim world @returns {number[]} */
function observedRecoilLives(scene, world) {
    const values = Array.from(scene.recoilLives.energy.subarray(0, scene.recoilRows));
    for (let slot = 0; world.alive !== undefined && slot < world.alive.length; slot++) {
        if (world.alive[slot] === 1 && world.huntBySpec[world.spec[slot]] === 1) {
            values.push(world.recoilEnergyLife[slot]);
        }
    }
    values.sort((a, b) => a - b);
    return values;
}

/** @param {number[]} values sample @returns {number} median */
function median(values) {
    const middle = Math.floor(values.length / 2);
    return values.length % 2 === 0 ? (values[middle - 1] + values[middle]) / 2 : values[middle];
}

/** @param {Record<string, any>} scene scene @param {Record<string, any>} world sim world @returns {number[]} */
function reflexTotals(scene, world) {
    const totals = [scene.reflexSplitKills, scene.reflexSplitTicks, scene.reflexSameKills, scene.reflexSameTicks];
    for (let slot = 0; world.alive !== undefined && slot < world.alive.length; slot++) {
        if (world.alive[slot] !== 1) {
            continue;
        }
        const cohort = scene.reflexCohorts.get(world.genomeId[slot]);
        if (cohort === undefined) {
            continue;
        }
        const offset = cohort.split ? 0 : 2;
        totals[offset] += world.ledgerKills[slot];
        totals[offset + 1] += world.ageTicks[slot];
    }
    return totals;
}
