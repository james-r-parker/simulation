// A hunter that lands a fatal bite in one real step, for the one-kill tests (docs/designs/metric-trust.md, "One kill"):
// the real `step` and `observe` on a scripted world, the hunter's prey tracker planted deliberate or not.

import { OUTPUT_INDEX } from '../../../js/sim/brain-layout.js';
import { EVENT_STRIDE, EVENT_TYPE } from '../../../js/sim/events.js';
import { sourceRun, zeroPolicy } from '../../evo/helpers/source-world.js';

const PREDATOR = 1;

/**
 * Two bodies in contact, the hunter's bite wanted, the victim down to one unit of energy, then one step: the hunter's
 * bite lands in this tick and the victim dies in it.
 * @param {{deliberate: boolean, killerDiesToo?: boolean}} options whether the hunter's prey tracker reads deliberate at
 *   the tick; whether the hunter also starves in the tick (it still holds the kill, as the reap credits before it frees)
 * @returns {{run: ReturnType<typeof sourceRun>, hunter: number, victim: number, hunterId: number,
 *   events: (type: number) => number[][]}} the run after the step, the two slots, the hunter's genome id and a reader
 *   of the step's events of one type
 */
export function fatalBite({ deliberate, killerDiesToo = false }) {
    const policy = {
        ...zeroPolicy(),
        initSpec: (/** @type {any} */ _w, /** @type {number} */ slot) => (slot === 0 ? PREDATOR : 0),
    };
    const run = sourceRun({ over: { maxAgents: 8 }, policy });
    const { world } = run;
    const hunter = run.spawn();
    const victim = run.spawn();
    const hunterId = world.genomeId[hunter];
    for (const slot of [hunter, victim]) {
        world.ageTicks[slot] = 100;
        world.y[slot] = 500;
        world.angle[slot] = 0;
    }
    world.x[hunter] = 500;
    world.x[victim] = 530;
    world.energy[victim] = 1;
    if (deliberate) {
        world.meritPrey.seen[hunter] = world.tick;
        world.meritPrey.bits[hunter] = 0xff;
        world.meritPrey.turn[hunter] = world.tick;
    }
    run.want(hunter, OUTPUT_INDEX.BITE);
    run.tick((w) => {
        if (killerDiesToo) {
            w.energy[hunter] = 0.0001;
        }
    });
    const events = (/** @type {number} */ type) => {
        const d = world.events.data;
        const rows = [];
        for (let i = 0; i < world.events.count; i++) {
            if (d[i * EVENT_STRIDE] === type) {
                rows.push(Array.from(d.subarray(i * EVENT_STRIDE, (i + 1) * EVENT_STRIDE)));
            }
        }
        return rows;
    };
    return { run, hunter, victim, hunterId, events };
}

export { EVENT_TYPE };
