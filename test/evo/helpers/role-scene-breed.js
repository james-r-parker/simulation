// The planted breeding scenes (docs/designs/metric-noise.md, Phase 6, T21): bodies that split, or mate, in the real sim under the
// eval observer (`playObserved`), with the parents' and children's deaths scripted so what the reproducer metrics should read is
// fixed by the scene: the children born (counted from the sim's birth events), how long each lived, how many each parent bore,
// and how much of its store each mother gave against how rich she was.

import { EVENT, EVENT_STRIDE, EVENT_TYPE } from '../../../js/sim/events.js';
import { SEX } from '../../../js/sim/sex.js';
import { BURN_IN_TICKS } from '../../../js/sim/burn-in.js';
import { setEnergy } from '../../../js/evo/role-scenes-thrive.js';
import { arenaConfig, stageArena } from '../../../js/evo/chase-arena.js';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../../js/sim/brain-layout.js';
import { playObserved } from './role-scene.js';

/** The energy a scripted death leaves: the next tick's cost takes the rest. */
const DYING = 0.0001;
/** Parents stand this far apart, so none mates with another pair's body. */
const SPACING = 2000;
/**
 * The age of a staged parent: the ticks since it was born at tick 0, the scene starting at burn-in. A body that can split is past
 * `maturityTicks`, and the death log reads a life as ended at its birth tick plus its age, so this puts a parent's death after burn-in.
 */
const ADULT = BURN_IN_TICKS;
/** The rules a split waits on besides energy (a deliberate diet and the shark rule's wait for a mate) are the forager scenes' job. */
const SPLIT_OPEN = { splitDeliberateMin: 0, splitDeliberateShareMin: 0 };
/** A male stands this far from his mate, and a pair this far from the next. */
const PAIR_GAP = 120;
const PAIR_SPACING = 1500;

/**
 * @typedef {object} Parent one staged body that splits when its energy is over the gate
 * @property {number} energy its energy at the start (a split needs more than 900; it gives half away)
 * @property {number} [diesAt] the tick its energy is cut to nothing, so it dies at once (never when absent)
 */

/**
 * @typedef {object} Birth one birth the sim made
 * @property {number} tick the tick it was made
 * @property {number} cause the `BORN_CAUSE`
 * @property {number} mother the mother's slot
 * @property {number} child the child's slot
 */

/**
 * @typedef {object} BreedRun what a played breeding scene says
 * @property {Record<string, any>} metrics `computeMetrics` of the observer
 * @property {Birth[]} births every birth after the start, from the birth events
 * @property {number} agentTicks the alive bodies summed over the ticks, the initial observation included
 * @property {number} ticks the ticks played
 * @property {Record<string, any>} world the finished world
 */

/**
 * @param {Record<string, any>} world the world
 * @param {number} tick the tick just stepped
 * @returns {Birth[]} the births of that tick
 */
function birthsOf(world, tick) {
    const { data, count } = world.events;
    const born = /** @type {Birth[]} */ ([]);
    for (let o = 0; o < count * EVENT_STRIDE; o += EVENT_STRIDE) {
        if (data[o] === EVENT_TYPE.AGENT_BORN) {
            const child = data[o + EVENT.AGENT_BORN.SLOT];
            born.push({ tick, cause: data[o + EVENT.AGENT_BORN.CAUSE], mother: world.parentSlotA[child], child });
        }
    }
    return born;
}

/**
 * The staged arena with a policy that can bear children (their brains stay zero: the scene's brain drives every body).
 * @param {Readonly<Record<string, any>>} config the scene's config
 * @param {Parameters<typeof stageArena>[1]} bodies the bodies
 * @returns {ReturnType<typeof stageArena>} the world and its policy
 */
function stageBreeders(config, bodies) {
    const arena = stageArena(config, bodies);
    return { world: arena.world, policy: { ...arena.policy, childBrain() {} } };
}

/**
 * Plays staged parents that split on their own, the scene's hooks killing the bodies it names.
 * @param {{parents: Parent[], ticks: number, childLife?: (ordinal: number) => number | null}} scene the parents, the ticks, and how
 *   many ticks each child (by birth order) lives before its energy is cut (null: it lives on)
 * @returns {BreedRun} the readings
 */
export function playSplits({ parents, ticks, childLife = () => null }) {
    const config = arenaConfig({ seed: 1, maxAgents: 80, ...SPLIT_OPEN });
    const spec = /** @type {Record<string, any>} */ (config.specialisations).forager.index;
    const staged = stageBreeders(
        config,
        parents.map((p, i) => ({ spec, x: 1000 + i * SPACING, y: 4000, angle: 0, energy: p.energy })),
    );
    const w = staged.world;
    parents.forEach((_, i) => {
        w.ageTicks[i] = ADULT;
    });
    const births = /** @type {Birth[]} */ ([]);
    const dies = /** @type {Map<number, number>} */ (new Map());
    let agentTicks = w.population;
    const played = playObserved(staged, {
        config,
        ticks,
        brains: [(world) => world.outputs.fill(0)],
        before(world, t) {
            parents.forEach((p, i) => (p.diesAt === t ? setEnergy(world, i, DYING) : undefined));
            for (const [slot, at] of dies) {
                if (at === t) {
                    setEnergy(world, slot, DYING);
                }
            }
        },
        after(world, t) {
            for (const birth of birthsOf(world, t)) {
                const life = childLife(births.length);
                births.push(birth);
                if (life !== null) {
                    dies.set(birth.child, t + life);
                }
            }
            agentTicks += world.population;
        },
    });
    return { metrics: played.metrics, births, agentTicks, ticks: played.ticks, world: played.world };
}

/**
 * @typedef {object} Mother one staged female, her male and what she gives
 * @property {number} energy the energy she is held at, every tick, so her condition at a birth is this
 * @property {number} share her `childEnergyShare`, the share of her energy a child gets
 */

/**
 * Plays mothers that mate with a male beside them (the sim's own mating, pregnancy and birth), all of one lineage, each held at a
 * set energy; every child is killed at birth so the colony does not grow. The mother's condition and her gift are the scene's.
 * @param {{mothers: Mother[], ticks: number}} scene the mothers and the ticks
 * @returns {BreedRun} the readings
 */
export function playMothers({ mothers, ticks }) {
    const config = arenaConfig({ seed: 1, maxAgents: 120, ...SPLIT_OPEN });
    const spec = /** @type {Record<string, any>} */ (config.specialisations).forager.index;
    const bodies = mothers.flatMap((m, i) => {
        const x = 1000 + (i % 4) * PAIR_SPACING;
        const y = 2000 + Math.floor(i / 4) * 3000;
        return [
            { spec, x, y, angle: 0, energy: m.energy },
            { spec, x: x + PAIR_GAP, y, angle: 0, energy: 1000 },
        ];
    });
    const staged = stageBreeders(config, bodies);
    const w = staged.world;
    mothers.forEach((m, i) => {
        w.sex[2 * i] = SEX.FEMALE;
        w.sex[2 * i + 1] = SEX.MALE;
        w.lineageId[2 * i] = w.lineageId[0];
        w.lanes.childEnergyShare[2 * i] = m.share;
    });
    w.ageTicks.fill(ADULT, 0, bodies.length);
    const births = /** @type {Birth[]} */ ([]);
    let agentTicks = w.population;
    const played = playObserved(staged, {
        config,
        ticks,
        brains: [
            (world) => {
                for (let slot = 0; slot < bodies.length; slot++) {
                    world.outputs.fill(0, slot * OUTPUT_COUNT, (slot + 1) * OUTPUT_COUNT);
                    world.outputs[slot * OUTPUT_COUNT + OUTPUT_INDEX.MATE] = 1;
                }
            },
        ],
        before(world) {
            mothers.forEach((m, i) => setEnergy(world, 2 * i, m.energy));
            mothers.forEach((_, i) => setEnergy(world, 2 * i + 1, 1000));
        },
        after(world, t) {
            for (const birth of birthsOf(world, t)) {
                births.push(birth);
                setEnergy(world, birth.child, DYING);
            }
            agentTicks += world.population;
        },
    });
    return { metrics: played.metrics, births, agentTicks, ticks: played.ticks, world: played.world };
}
