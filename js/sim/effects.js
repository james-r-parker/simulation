// The effect registry's engine (docs/designs/status-effects.md, "The registry"): an effect is a stacked, capped, timed
// change to what a body can do. It multiplies a lane (`liveOf` reads the lane with every effect applied) or closes a gate
// (`gateOpen`), for as long as its level is above 0. The effects themselves are the list in `effect-list.js`;
// `createEffects` builds the readers over any list, so the contract test runs them on fixture effects.
// Nothing here allocates per call and nothing draws from the RNG.

import { LANES } from './body-lanes.js';
import { EFFECTS } from './effect-list.js';

/**
 * The gates an effect can close, by name. `ALARM` and `HUNT` are the two halves of the plan's `call` gate: an alarm
 * and a hunt call each wait for their own timer, so one running timer must not close the other call.
 */
export const GATE = Object.freeze({ EAT: 0, MATE: 1, SPLIT: 2, BITE: 3, ALARM: 4, HUNT: 5, SMOKE: 6 });

/** The number of gates. */
export const GATE_COUNT = Object.keys(GATE).length;

/**
 * A number a rule reads: a literal, a config key or lane name, or `{key, scale, offset}` for `scale x value + offset`
 * (a ramp's `temperaturePassiveLossFactor - 1`, a drag's `-fatSlowShare`).
 * @typedef {number | string | {key: string, scale?: number, offset?: number}} Ref
 */

/**
 * @typedef {object} Scale
 * @property {string} lane the lane multiplied (a name of `LANES`)
 * @property {Ref} [perStack] the lane is multiplied by `1 + perStack x level`, never below 0
 * @property {readonly Ref[]} [levels] the lane is multiplied by `levels[level]` (level 0 first)
 */

/**
 * @typedef {object} Effect
 * @property {string} name the key of its config numbers, its inspector row and its detector
 * @property {'body' | 'feeding' | 'social' | 'combat'} family
 * @property {number} maxStacks the cap, 1 for an effect that is on or off
 * @property {'stacks' | 'share' | 'step'} level a stored count, or a number computed from the body when read
 * @property {(world: any, slot: number) => number} [read] the level of a `share` or `step` effect
 * @property {{kind: 'ticks' | 'every', key: string}} [fades] a `stacks` effect's timer, its length a config key
 * @property {readonly Scale[]} scales the lanes it multiplies
 * @property {readonly string[]} gates the gates it closes while its level is above 0 (`GATE` names)
 * @property {readonly {perTick: Ref, cause: string, times?: string}[]} drains the energy removed each tick it is on,
 *   `perTick x level` (x the named per-slot array, `dose`), booked under the `LOSS_CAUSE` named
 * @property {string | null} applier the rule that raises it, null for a computed effect
 * @property {boolean} visible whether the renderer and the inspector show it
 */

/** @typedef {{kind: 'literal', value: number} | {kind: 'key', key: string, scale: number, offset: number}} Compiled */

/**
 * @param {Ref} ref a reference
 * @returns {Compiled} the reference in the form `numberOf` reads
 */
function compileRef(ref) {
    if (typeof ref === 'number') {
        return { kind: 'literal', value: ref };
    }
    if (typeof ref === 'string') {
        return { kind: 'key', key: ref, scale: 1, offset: 0 };
    }
    return { kind: 'key', key: ref.key, scale: ref.scale ?? 1, offset: ref.offset ?? 0 };
}

/**
 * @param {any} world the world
 * @param {number} slot the agent slot
 * @param {Compiled} ref a compiled reference
 * @returns {number} its value for the slot: a literal, or `scale x (the lane at the slot, else the config key) + offset`
 */
export function numberOf(world, slot, ref) {
    if (ref.kind === 'literal') {
        return ref.value;
    }
    const lane = world.lanes[ref.key];
    const value = lane === undefined ? world.config[ref.key] : lane[slot];
    return ref.scale * value + ref.offset;
}

/**
 * @typedef {object} Rule one effect's multiplication of one lane
 * @property {number} effect the effect's index
 * @property {Compiled | null} per the `perStack` reference
 * @property {Compiled[] | null} levels the `levels` references
 */

/**
 * @param {readonly Effect[]} list the effects
 * @returns {Record<string, Rule[]>} each lane's rules in registry order
 * @throws {Error} for a lane that is not in the catalogue, or a scale that has neither form or both
 */
function compileRules(list) {
    /** @type {Record<string, Rule[]>} */
    const rules = Object.create(null);
    list.forEach((effect, index) => {
        for (const scale of effect.scales) {
            if (!LANES.some((lane) => lane.name === scale.lane)) {
                throw new Error(`effects: ${effect.name} scales ${scale.lane}, which is not a lane`);
            }
            if ((scale.perStack === undefined) === (scale.levels === undefined)) {
                throw new Error(`effects: ${effect.name} scales ${scale.lane} by perStack or levels, exactly one`);
            }
            const per = scale.perStack === undefined ? null : compileRef(scale.perStack);
            const levels = scale.levels === undefined ? null : scale.levels.map(compileRef);
            (rules[scale.lane] ??= []).push({ effect: index, per, levels });
        }
    });
    return rules;
}

/**
 * @param {readonly Effect[]} list the effects
 * @returns {number[][]} for each gate, the indices of the effects that close it, in registry order
 * @throws {Error} for a gate name that `GATE` lacks
 */
function compileGates(list) {
    /** @type {number[][]} */
    const gates = Array.from({ length: GATE_COUNT }, () => []);
    list.forEach((effect, index) => {
        for (const name of effect.gates) {
            const gate = /** @type {Record<string, number>} */ (GATE)[name];
            if (gate === undefined) {
                throw new Error(`effects: ${effect.name} closes ${name}, which is not a gate`);
            }
            gates[gate].push(index);
        }
    });
    return gates;
}

/**
 * Builds the readers over a list of effects.
 * @param {readonly Effect[]} list the effects, in registry order
 * @returns {EffectSystem} the readers, the stored rows and the fade pass of the list
 */
export function createEffects(list) {
    const names = list.map((effect) => effect.name);
    if (new Set(names).size !== names.length) {
        throw new Error('effects: every effect needs its own name');
    }
    for (const effect of list) {
        if (effect.level === 'stacks' && effect.fades === undefined) {
            throw new Error(`effects: ${effect.name} stores stacks, so it needs fades`);
        }
    }
    const rules = compileRules(list);
    const gates = compileGates(list);
    /** The effects that store a count, by their row in `world.effectStacks`; -1 for an effect that stores nothing. */
    const rowOf = list.map(() => -1);
    const stored = list.filter((effect) => effect.level === 'stacks');
    stored.forEach((effect) => {
        rowOf[list.indexOf(effect)] = stored.indexOf(effect);
    });
    const drainRefs = list.map((effect) => effect.drains.map((drain) => compileRef(drain.perTick)));
    return new EffectSystem({ list, rules, gates, rowOf, stored, drainRefs });
}

/** The readers over one effect list. Construct through `createEffects`. */
export class EffectSystem {
    /**
     * @param {object} parts what `createEffects` compiled
     * @param {readonly Effect[]} parts.list the effects
     * @param {Record<string, Rule[]>} parts.rules each lane's rules
     * @param {number[][]} parts.gates each gate's effect indices
     * @param {number[]} parts.rowOf each effect's stored row, -1 for none
     * @param {readonly Effect[]} parts.stored the effects that store a count, in row order
     * @param {Compiled[][]} parts.drainRefs each effect's drains' `perTick` references
     */
    constructor(parts) {
        this.list = parts.list;
        this.rules = parts.rules;
        this.gates = parts.gates;
        this.rowOf = parts.rowOf;
        this.stored = parts.stored;
        this.drainRefs = parts.drainRefs;
    }

    /**
     * @param {any} world the world
     * @param {number} slot the agent slot
     * @param {number} effect an effect's index
     * @returns {number} its level now: the stored count of a `stacks` effect, else what its `read` computes from the body
     */
    levelOf(world, slot, effect) {
        const row = this.rowOf[effect];
        if (row >= 0) {
            return world.effectStacks[row][slot];
        }
        return /** @type {(world: any, slot: number) => number} */ (this.list[effect].read)(world, slot);
    }

    /**
     * @param {any} world the world
     * @param {number} slot the agent slot
     * @param {string} lane a lane's name
     * @returns {number} the lane at the slot times the factor of every effect that scales it, in registry order, each
     *   read from the state as it stands now
     */
    liveOf(world, slot, lane) {
        let value = world.lanes[lane][slot];
        const rules = this.rules[lane];
        if (rules === undefined) {
            return value;
        }
        for (let k = 0; k < rules.length; k++) {
            const rule = rules[k];
            const level = this.levelOf(world, slot, rule.effect);
            if (rule.levels === null) {
                const factor = 1 + numberOf(world, slot, /** @type {Compiled} */ (rule.per)) * level;
                value *= factor > 0 ? factor : 0;
            } else {
                value *= numberOf(world, slot, rule.levels[level]);
            }
        }
        return value;
    }

    /**
     * @param {any} world the world
     * @param {number} slot the agent slot
     * @param {number} gate a `GATE` code
     * @returns {boolean} whether no effect that names the gate has a level above 0 for the slot
     */
    gateOpen(world, slot, gate) {
        const closing = this.gates[gate];
        for (let k = 0; k < closing.length; k++) {
            if (this.levelOf(world, slot, closing[k]) > 0) {
                return false;
            }
        }
        return true;
    }

    /**
     * Allocates the stored rows of a world being built: `effectStacks[row][slot]` and `effectTicks[row][slot]` for each
     * `stacks` effect, `Float64Array` rows of `maxAgents`, also pushed onto `agentRows` so a freed slot is zeroed.
     * @param {any} world the world being built, its `agentRows` allocated
     * @returns {void}
     */
    allocRows(world) {
        const n = world.config.maxAgents;
        world.effectStacks = this.stored.map(() => new Float64Array(n));
        world.effectTicks = this.stored.map(() => new Float64Array(n));
        this.stored.forEach((effect, row) => {
            world.agentRows.push({ array: world.effectStacks[row], stride: 1, name: `effect.${effect.name}.stacks` });
            world.agentRows.push({ array: world.effectTicks[row], stride: 1, name: `effect.${effect.name}.ticks` });
        });
    }

    /**
     * The one pass over stored stacks, the last phase of a tick. A `ticks` effect counts its timer down and drops all its
     * stacks when it ends; an `every` effect drops one stack each time its timer runs out and restarts the timer while
     * stacks remain.
     * @param {any} world the world
     * @returns {void}
     */
    fade(world) {
        for (let row = 0; row < this.stored.length; row++) {
            const fades = /** @type {NonNullable<Effect['fades']>} */ (this.stored[row].fades);
            const length = world.config[fades.key];
            const stacks = world.effectStacks[row];
            const ticks = world.effectTicks[row];
            for (let slot = 0; slot < stacks.length; slot++) {
                if (stacks[slot] > 0) {
                    fadeSlot(fades.kind, { stacks, ticks, length }, slot);
                }
            }
        }
    }
}

/**
 * @param {'ticks' | 'every'} kind the fade kind
 * @param {{stacks: Float64Array, ticks: Float64Array, length: number}} row the effect's stored rows and timer length
 * @param {number} slot a slot holding stacks
 * @returns {void}
 */
function fadeSlot(kind, row, slot) {
    row.ticks[slot] -= 1;
    if (row.ticks[slot] > 0) {
        return;
    }
    if (kind === 'ticks') {
        row.stacks[slot] = 0;
        row.ticks[slot] = 0;
        return;
    }
    row.stacks[slot] -= 1;
    row.ticks[slot] = row.stacks[slot] > 0 ? row.length : 0;
}

/** The effects of the sim, in registry order. */
export const EFFECT_LIST = EFFECTS;

/** The readers over `EFFECTS`. */
export const SYSTEM = createEffects(EFFECTS);

/** An effect's index by name: `EFFECT_INDEX.fat`. */
export const EFFECT_INDEX = Object.freeze(Object.fromEntries(EFFECTS.map((effect, i) => [effect.name, i])));

/** The same, by the effect's name in `UPPER_SNAKE`: `EFFECT.COLD_BAND`. */
export const EFFECT = Object.freeze(
    Object.fromEntries(EFFECTS.map((effect, i) => [effect.name.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase(), i])),
);

/**
 * @param {any} world the world
 * @param {number} slot the agent slot
 * @param {string} lane a lane's name
 * @returns {number} the lane with every effect applied (see `EffectSystem.liveOf`)
 */
export function liveOf(world, slot, lane) {
    return SYSTEM.liveOf(world, slot, lane);
}

/**
 * @param {any} world the world
 * @param {number} slot the agent slot
 * @param {number} gate a `GATE` code
 * @returns {boolean} whether the gate is open for the slot
 */
export function gateOpen(world, slot, gate) {
    return SYSTEM.gateOpen(world, slot, gate);
}

/**
 * @param {any} world the world
 * @param {number} slot the agent slot
 * @param {number} effect an `EFFECT` code
 * @returns {number} the effect's level for the slot
 */
export function levelOf(world, slot, effect) {
    return SYSTEM.levelOf(world, slot, effect);
}

/**
 * @param {any} world the world being built, its `agentRows` allocated
 * @returns {void}
 */
export function allocEffects(world) {
    SYSTEM.allocRows(world);
}

/**
 * @param {any} world the world
 * @returns {void}
 */
export function fadeEffects(world) {
    SYSTEM.fade(world);
}
