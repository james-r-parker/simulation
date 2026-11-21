// The scripted stampede in the real sim (docs/designs/role-budget.md, "Cross-check against the sim"): a herd startled toward a body that
// stands in its path, and a body oracle that runs for the nearer flank once a herd animal is on a ray. Each reading carries the name of
// the formula it checks (`HerdCase` of role-budget-herd.js).

import { detCos, detSin } from '../sim/det-math.js';
import { step } from '../sim/step.js';
import { ARENA_CENTRE, stageArena } from './chase-arena.js';
import { clearerBrain } from './herd-oracles.js';
import { herdNumbers } from './role-budget-herd.js';
import { roleParams } from './role-budget-params.js';
import { emptied } from './role-scenes-thrive.js';
import { viewReach } from './role-budget-senses.js';

/** The ticks a scene runs: the herd covers its half-width many times over. */
const SCENE_TICKS = 220;
/** The energy a tick must take for it to be a trample, not the cost of the tick (the cost is overwritten into `lastLoss` later in the tick, so the cause cannot be read). */
const TRAMPLE_FLOOR = 5;

/**
 * @typedef {object} StampedeScene
 * @property {{seen: number, arrival: number | null, clear: number | null}} ticks the tick the herd was seen, the tick a herd animal first
 *   trampled the body (null: never) and the tick the body had cleared the half-width sideways (null: never)
 * @property {{tramples: number, firstLoss: number | null}} outcome the tramples taken and the energy the first took
 */

/**
 * Stages a herd of one group startled toward +x on a ring around its centroid, the body `view + herdRadius` ahead of the front animal.
 * @param {Readonly<Record<string, any>>} config the world's config
 * @param {{spec: string, facing: 'herd' | 'away'}} body the spec and the way it faces
 * @returns {{staged: ReturnType<typeof stageArena>, seeGap: number, half: number}} the arena, the centre gap at which the body sees the
 *   herd and the herd's half-width with the body
 */
function stage(config, { spec, facing }) {
    const arena = emptied(config, 16000, { herds: 1 });
    const specs = /** @type {Record<string, any>} */ (arena.specialisations);
    const herd = herdNumbers(arena);
    const p = roleParams(arena, spec);
    const seeGap = viewReach(p, facing === 'herd' ? 0 : Math.PI) + herd.radius;
    const { x, y } = ARENA_CENTRE;
    const angle = facing === 'herd' ? Math.PI : 0;
    const staged = stageArena(arena, [{ spec: specs[spec].index, x, y, angle }]);
    const w = staged.world;
    const cx = x - seeGap - herd.ring;
    for (let animal = 0; animal < arena.herdSize; animal++) {
        const a = (animal / arena.herdSize) * 2 * Math.PI;
        w.herdX[animal] = cx + herd.ring * detCos(a);
        w.herdY[animal] = y + herd.ring * detSin(a);
        w.herdVx[animal] = 0;
        w.herdVy[animal] = 0;
    }
    w.groupCentroidX[0] = cx;
    w.groupCentroidY[0] = y;
    w.groupAlarm[0] = herd.stampede;
    w.groupFleeX[0] = 1;
    w.groupFleeY[0] = 0;
    return { staged, seeGap, half: herd.ring + herd.radius + p.size };
}

/**
 * Plays the stampede. With `run` false the body stands (the herd's arrival and the first trample); with it true the body runs for the
 * nearer flank `reaction` ticks after it sees the herd, at its best gait.
 * @param {Readonly<Record<string, any>>} config the world's config
 * @param {{spec: string, facing: 'herd' | 'away', run: boolean, sprint?: boolean, reaction?: number}} scene the spec, the way it faces,
 *   whether it runs, whether it sprints and the ticks it takes to react
 * @returns {StampedeScene} the readings
 */
export function playStampede(config, { spec, facing, run, sprint = true, reaction = 2 }) {
    const { staged, seeGap, half } = stage(config, { spec, facing });
    const w = staged.world;
    const brain = clearerBrain({ slot: 0, seeGap, reaction, sprint, run });
    const tally = { arrival: null, clear: null, loss: null, tramples: 0 };
    const y0 = w.y[0];
    for (let n = 1; n <= SCENE_TICKS && w.alive[0] === 1; n++) {
        const before = w.energy[0];
        step(w, staged.policy, { brain });
        note(tally, { n, taken: before - w.energy[0], off: Math.abs(w.y[0] - y0) >= half });
    }
    return {
        ticks: { seen: brain.state.seenTick, arrival: tally.arrival, clear: tally.clear },
        outcome: { tramples: tally.tramples, firstLoss: tally.loss },
    };
}

/**
 * @param {{arrival: number | null, clear: number | null, loss: number | null, tramples: number}} tally the readings so far, updated
 * @param {{n: number, taken: number, off: boolean}} tick the tick, the energy it took and whether the body is past the half-width
 * @returns {void}
 */
function note(tally, { n, taken, off }) {
    if (taken > TRAMPLE_FLOOR) {
        tally.tramples += 1;
        tally.arrival = tally.arrival ?? n;
        tally.loss = tally.loss ?? taken;
    }
    tally.clear = tally.clear ?? (off ? n : null);
}

/**
 * @typedef {object} HerdMeasure the herd on its own, with nobody in its way
 * @property {number} centroid80 the centroid's travel after 80 ticks, in px
 * @property {number} centroid the centroid's travel after the whole alarm
 * @property {number} peakSpeed the highest mean speed of the animals
 * @property {{start: number, end: number}} halfWidth the largest distance of an animal from the centroid at the start and the end
 */

/**
 * Reads how a startled herd moves in the sim with no body in its way: how far its centroid travels, how fast it goes and how its half-width
 * changes (the readings the plan's Phase 5 section quotes).
 * @param {Readonly<Record<string, any>>} config the world's config
 * @returns {HerdMeasure} the readings
 */
export function measureStampede(config) {
    const { staged } = stage(config, { spec: 'forager', facing: 'herd' });
    const w = staged.world;
    const size = w.config.herdSize;
    const spread = () => {
        let widest = 0;
        for (let a = 0; a < size; a++) {
            const dx = w.herdX[a] - w.groupCentroidX[0];
            const dy = w.herdY[a] - w.groupCentroidY[0];
            widest = Math.max(widest, Math.sqrt(dx * dx + dy * dy));
        }
        return widest;
    };
    const x0 = w.groupCentroidX[0];
    const out = { centroid80: 0, centroid: 0, peakSpeed: 0, halfWidth: { start: spread(), end: 0 } };
    const idle = () => {};
    const alarm = w.config.herdStampedeTicks;
    for (let n = 1; n <= alarm; n++) {
        step(w, staged.policy, { brain: idle });
        let mean = 0;
        for (let a = 0; a < size; a++) {
            mean += Math.sqrt(w.herdVx[a] * w.herdVx[a] + w.herdVy[a] * w.herdVy[a]) / size;
        }
        out.peakSpeed = Math.max(out.peakSpeed, mean);
        out.centroid80 = n === 80 ? w.groupCentroidX[0] - x0 : out.centroid80;
    }
    out.centroid = w.groupCentroidX[0] - x0;
    out.halfWidth.end = spread();
    return out;
}
