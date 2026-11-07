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

import { EVENT_TYPE } from '../sim/events.js';
import { createLog, ensureRoom } from './growable-log.js';
import { splitHunterIncome } from './hunter-income-split.js';
import { none, ok } from './metrics-stats.js';

/** The direction of each metric of this module. */
export const BITE_LIFE_DIRECTIONS = Object.freeze({
    'eval.hunter_carrion_idle_share': 'lower',
    'eval.hunter_recoil_per_life': 'watch',
});

/**
 * @returns {Record<string, any>} an empty scene: one row per hunter death, and the recoil ticks so far
 */
export function createBiteLifeScene() {
    return {
        log: createLog(['kills', 'carcassEnergy', 'killEnergy', 'biteGainEnergy']),
        rows: 0,
        recoilTicks: 0,
    };
}

/**
 * Notes one event record when it is a `HunterLedger` (fields 4, 5, 9 and 10: the packed kills, the carcass energy, the kill
 * energy and the bite gain, as `noteHunterDeath` in js/sim/hunter-ledger.js writes them).
 * @param {Record<string, any>} scene the scene
 * @param {Float64Array} d the event ring data
 * @param {number} o the record offset
 * @returns {void}
 */
export function noteBiteLifeRecord(scene, d, o) {
    if (d[o] !== EVENT_TYPE.HUNTER_LEDGER) {
        return;
    }
    const row = scene.rows++;
    ensureRoom(scene.log, row);
    scene.log.kills[row] = Math.floor(d[o + 4] / 64);
    scene.log.carcassEnergy[row] = d[o + 5];
    scene.log.killEnergy[row] = d[o + 9];
    scene.log.biteGainEnergy[row] = d[o + 10];
}

/**
 * Counts the hunters that recoiled this tick. Call it once a tick after `step`, not at tick 0 (a fresh slot's stamp is 0).
 * @param {Record<string, any>} scene the scene
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function tickRecoil(scene, world) {
    const { alive, spec, huntBySpec, recoilStamp } = world;
    for (let slot = 0; slot < alive.length; slot++) {
        if (alive[slot] === 1 && huntBySpec[spec[slot]] === 1 && recoilStamp[slot] === world.tick) {
            scene.recoilTicks += 1;
        }
    }
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
 * @returns {Record<string, import('./metrics-stats.js').MetricResult>} the two per-life metrics
 */
export function biteLifeMetrics(scene, world) {
    const records = lives(scene, world);
    const split = splitHunterIncome(records);
    return {
        'eval.hunter_carrion_idle_share':
            split.income > 0 ? ok(split.zeroKillCarcassOfIncome) : none('no hunter income'),
        'eval.hunter_recoil_per_life':
            records.length > 0 ? ok(scene.recoilTicks / records.length) : none('no hunter lives'),
    };
}
