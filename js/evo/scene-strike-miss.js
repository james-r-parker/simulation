// What does striking at nothing cost the hunters (eat-choice.md, Phase 5, T23)? G4 charges a hunter `strikeMissCost` on
// each tick it holds `BITE` above 0 with no body in its jaws (`chargeStrikeMisses` in `js/sim/feeding.js`). The observer
// reads the same tick after the step: `feed` stamps `jawsStamp` with `world.tick + 1` during the step, and `step` then
// raises `world.tick` by 1, so after the step a hunter that had a body in its jaws has `jawsStamp === world.tick`. A hunter
// alive with `BITE` above 0 and a stamp of another value struck at nothing.
//
// - `eval.strike_miss_energy_share` (lower): over the run, the strike misses priced at `strikeMissCost`, over the energy
//   hunters stored (`hunterIncomeBySpec`: kill, bite, carcass and herd meals, as `eval.hunter_income_share` counts it).
//   0 with `strikeMissCost` 0; null with no hunter income. A ratio, not a share: a run in which the hunters miss more than
//   they earn reads above 1 (seed 2 of the invariants test does).
//
// The price is the cost, not the energy `removeEnergy` took: a hunter with less than `strikeMissCost` is charged only what
// it has, so the metric slightly overstates the charge on a starving hunter. A hunter that dies in the step is not alive
// when the observer reads, and its last miss is not counted. The scene reads the world and writes only itself, so no hash
// can move; nothing is allocated per tick.

import { OUTPUT_COUNT, OUTPUT_INDEX } from '../sim/brain-layout.js';
import { INCOME_KINDS } from '../sim/hunter-ledger.js';
import { none, ok } from './metrics-stats.js';

const NO_INCOME = 'no hunter income';

/** @returns {Record<string, any>} an empty strike-miss scene: the hunter-ticks that struck at nothing */
export function createStrikeMissScene() {
    return { misses: 0 };
}

/**
 * Counts the hunters that struck at nothing in the step that just ran. Call it once per tick after the step.
 * @param {Record<string, any>} scene the strike-miss scene
 * @param {Record<string, any>} world the world after the step
 * @returns {void}
 */
export function tickStrikeMiss(scene, world) {
    if (world.config.strikeMissCost <= 0) {
        return;
    }
    for (let slot = 0; slot < world.alive.length; slot++) {
        if (
            world.alive[slot] === 1 &&
            world.huntBySpec[world.spec[slot]] === 1 &&
            world.outputs[slot * OUTPUT_COUNT + OUTPUT_INDEX.BITE] > 0 &&
            world.jawsStamp[slot] !== world.tick
        ) {
            scene.misses += 1;
        }
    }
}

/**
 * @param {Record<string, any>} world the world at the last tick
 * @returns {number} the energy the hunters stored over the run
 */
function hunterIncome(world) {
    let total = 0;
    for (let spec = 0; spec < world.hunterIncomeBySpec.length / INCOME_KINDS; spec++) {
        for (let k = 0; k < INCOME_KINDS && world.huntBySpec[spec] === 1; k++) {
            total += world.hunterIncomeBySpec[spec * INCOME_KINDS + k];
        }
    }
    return total;
}

/**
 * @param {Record<string, any>} scene the strike-miss scene
 * @param {Record<string, any>} world the world at the last tick
 * @returns {import('./metrics-stats.js').MetricRecord} the strike miss energy share
 */
export function strikeMissMetrics(scene, world) {
    const income = world.hunterIncomeBySpec === undefined ? 0 : hunterIncome(world);
    return {
        'eval.strike_miss_energy_share':
            income > 0 ? ok((scene.misses * world.config.strikeMissCost) / income) : none(NO_INCOME),
    };
}
