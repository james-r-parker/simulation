// The planted herd scenes (docs/designs/metric-noise.md, Phase 6, T21): the stampede of `playStampede` (role-scenes-herd.js:
// a herd startled toward a body that stands in its path, and a body oracle that runs for the nearer flank) played under the eval
// observer by `playObserved`, and a startle scene (a hunter that stands beside a herd, or a forager that does). The staging is
// `playStampede`'s own, rebuilt here because that module keeps it private; the truth is read from the world (the energy a
// trample took, the body's distance off the herd's path, the stampede events), never from the metrics.

import { detCos, detSin } from '../../../js/sim/det-math.js';
import { EVENT_STRIDE, EVENT_TICK, EVENT_TYPE } from '../../../js/sim/events.js';
import { setEnergy, emptied } from '../../../js/evo/role-scenes-thrive.js';
import { BURN_IN_TICKS } from '../../../js/sim/burn-in.js';
import { ARENA_CENTRE, arenaConfig, stageArena } from '../../../js/evo/chase-arena.js';
import { clearerBrain } from '../../../js/evo/herd-oracles.js';
import { herdNumbers } from '../../../js/evo/role-budget-herd.js';
import { roleParams } from '../../../js/evo/role-budget-params.js';
import { viewReach } from '../../../js/evo/role-budget-senses.js';
import { playObserved } from './role-scene.js';

/** The energy a tick must take to be a trample, not the cost of the tick (`TRAMPLE_FLOOR` of role-scenes-herd.js). */
const TRAMPLE_FLOOR = 5;

/**
 * @typedef {object} HerdRun what a played herd scene says
 * @property {Record<string, any>} metrics `computeMetrics` of the observer
 * @property {number} tramples the ticks a trample took energy from the body
 * @property {boolean} cleared whether the body got `half` off the herd's path
 * @property {boolean} died whether the body died
 * @property {number} stampedes the stampede events the world raised
 * @property {number} ticks the ticks played
 */

/**
 * Lays a herd of one group on its ring around a centroid, startled toward +x or not.
 * @param {Record<string, any>} world the staged world
 * @param {{cx: number, cy: number, ring: number, alarm: number}} herd the centroid, the ring and the alarm ticks (0: calm)
 * @returns {void}
 */
function layHerd(world, { cx, cy, ring, alarm }) {
    const size = world.config.herdSize;
    for (let animal = 0; animal < size; animal++) {
        const a = (animal / size) * 2 * Math.PI;
        world.herdX[animal] = cx + ring * detCos(a);
        world.herdY[animal] = cy + ring * detSin(a);
        world.herdVx[animal] = 0;
        world.herdVy[animal] = 0;
    }
    world.groupCentroidX[0] = cx;
    world.groupCentroidY[0] = cy;
    world.groupAlarm[0] = alarm;
    world.groupFleeX[0] = 1;
    world.groupFleeY[0] = 0;
}

/**
 * Plays a stampede toward one body under the observer.
 * @param {{spec: string, facing: 'herd' | 'away', run: boolean, energy?: number, ticks?: number}} scene the spec, the way it faces,
 *   whether it runs (false: it stands), the energy it holds when set (a trample at that energy kills) and the ticks (220)
 * @returns {HerdRun} the readings and the planted truth
 */
export function playStampedeObserved({ spec, facing, run, energy, ticks = 220 }) {
    const arena = emptied(arenaConfig({ seed: 1 }), 16000, { herds: 1 });
    const specs = /** @type {Record<string, any>} */ (arena.specialisations);
    const herd = herdNumbers(arena);
    const p = roleParams(arena, spec);
    const seeGap = viewReach(p, facing === 'herd' ? 0 : Math.PI) + herd.radius;
    const { x, y } = ARENA_CENTRE;
    const staged = stageArena(arena, [{ spec: specs[spec].index, x, y, angle: facing === 'herd' ? Math.PI : 0 }]);
    const w = staged.world;
    layHerd(w, { cx: x - seeGap - herd.ring, cy: y, ring: herd.ring, alarm: herd.stampede });
    if (energy !== undefined) {
        setEnergy(w, 0, energy);
    }
    const half = herd.ring + herd.radius + p.size;
    const truth = { tramples: 0, cleared: false, died: false };
    let before = w.energy[0];
    const played = playObserved(staged, {
        config: arena,
        ticks,
        brains: [clearerBrain({ slot: 0, seeGap, reaction: 2, sprint: true, run })],
        before() {
            before = w.energy[0];
        },
        after() {
            truth.tramples += before - w.energy[0] > TRAMPLE_FLOOR ? 1 : 0;
            truth.cleared = truth.cleared || Math.abs(w.y[0] - y) >= half;
            truth.died = w.alive[0] === 0;
            return truth.died;
        },
    });
    return { metrics: played.metrics, stampedes: 0, ticks: played.ticks, ...truth };
}

/**
 * Plays a calm herd with one body standing `gap` px from its centroid: a predator (a hunter, which startles the herd) or a
 * forager (which does not).
 * @param {{spec: 'predator' | 'forager', gap: number, ticks: number}} scene the spec, its distance from the centroid and the ticks
 * @returns {HerdRun} the readings and the stampede events the world raised
 */
export function playStartleObserved({ spec, gap, ticks }) {
    const arena = emptied(arenaConfig({ seed: 1 }), 16000, { herds: 1 });
    const specs = /** @type {Record<string, any>} */ (arena.specialisations);
    const { x, y } = ARENA_CENTRE;
    const staged = stageArena(arena, [{ spec: specs[spec].index, x: x + gap, y, angle: 0 }]);
    const w = staged.world;
    layHerd(w, { cx: x, cy: y, ring: herdNumbers(arena).ring, alarm: 0 });
    let stampedes = 0;
    const played = playObserved(staged, {
        config: arena,
        ticks,
        brains: [(world) => world.outputs.fill(0)],
        after() {
            const { data, count } = w.events;
            for (let offset = 0; offset < count * EVENT_STRIDE; offset += EVENT_STRIDE) {
                const settled = data[offset + EVENT_TICK] > BURN_IN_TICKS;
                stampedes += data[offset] === EVENT_TYPE.HERD_STAMPEDE && settled ? 1 : 0;
            }
        },
    });
    return { metrics: played.metrics, tramples: 0, cleared: false, died: false, stampedes, ticks: played.ticks };
}
