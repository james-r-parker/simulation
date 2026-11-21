// The effect registry's engine (docs/designs/status-effects.md, "The registry"): an effect is a stacked, capped, timed
// change to what a body can do. It multiplies a lane (`liveOf` reads the lane with every effect applied) or closes a gate
// (`gateOpen`), for as long as its level is above 0. The effects themselves are the list in `effect-list.js`;
// `createEffects` builds the readers over any list, so the contract test runs them on fixture effects. A lane is read by
// its index (`LANE_ID`), each rule holds its level reader and its numbers compiled, and a rule at level 0 is skipped:
// its factor is exactly 1. Nothing here allocates per call and nothing draws from the RNG.

import { EFFECTS } from './effect-list.js';
import { LANE_ID, compileRef, numberOf } from './effect-refs.js';
import { raiseEffect } from './effect-raise.js';

export { LANE_ID, compileRef, numberOf };

/**
 * The gates an effect can close, by name. `ALARM` and `HUNT` are the two halves of the plan's `call` gate: an alarm
 * and a hunt call each wait for their own timer, so one running timer must not close the other call.
 */
export const GATE = Object.freeze({ EAT: 0, MATE: 1, SPLIT: 2, BITE: 3, ALARM: 4, HUNT: 5, SMOKE: 6 });

/** The number of gates. */
export const GATE_COUNT = Object.keys(GATE).length;

/** @typedef {import('./effect-refs.js').Ref} Ref */
/** @typedef {import('./effect-refs.js').Compiled} Compiled */

/**
 * @typedef {object} Scale
 * @property {string} lane the lane multiplied (a name of `LANES`)
 * @property {Ref} [perStack] the lane is multiplied by `1 + perStack x level`, never below 0
 * @property {readonly Ref[]} [levels] the lane is multiplied by `levels[level]` (level 0 first, and 1)
 * @property {string} [by] a lane of the body that multiplies `perStack` (the `nerve` of the adrenaline effects)
 */

/**
 * @typedef {object} Effect
 * @property {string} name the key of its config numbers, its inspector row and its detector
 * @property {'body' | 'feeding' | 'social' | 'combat'} family
 * @property {number} maxStacks the cap, 1 for an effect that is on or off
 * @property {'stacks' | 'share' | 'step'} level a stored count, or a number computed from the body when read
 * @property {(world: any, slot: number) => number} [read] the level of a `share` or `step` effect
 * @property {{kind: 'ticks' | 'every' | 'held', key: string, by?: string}} [fades] a `stacks` effect's timer, its length a
 *   config key (times the `by` lane of the body, when it names one); a `held` effect's applier keeps the clock itself
 * @property {string} [then] the effect raised on a slot when this one's `ticks` timer ends (`panicked` hands over to `shaken`)
 * @property {readonly Scale[]} scales the lanes it multiplies
 * @property {readonly string[]} gates the gates it closes while its level is above 0 (`GATE` names)
 * @property {readonly {perTick: Ref, cause: string, times?: string}[]} drains the energy removed each tick it is on,
 *   `perTick x level` (x the named per-slot array, `dose`), booked under the `LOSS_CAUSE` named
 * @property {string | null} applier the rule that raises it, null for a computed effect
 * @property {boolean} visible whether the renderer and the inspector show it
 */

/**
 * @typedef {object} Rule one effect's multiplication of one lane
 * @property {(world: any, slot: number) => number} read the effect's level reader
 * @property {number} effect the effect's index
 * @property {Compiled | null} per the `perStack` reference
 * @property {Compiled[] | null} levels the `levels` references
 * @property {number} by the lane that multiplies `perStack`, -1 for none
 */

/**
 * @param {string} effect the effect's name, for the message
 * @param {string} lane a lane's name
 * @returns {number} the lane's index
 * @throws {Error} for a lane that is not in the catalogue
 */
function laneIdOf(effect, lane) {
    const id = /** @type {Record<string, number>} */ (LANE_ID)[lane];
    if (id === undefined) {
        throw new Error(`effects: ${effect} names ${lane}, which is not a lane`);
    }
    return id;
}

/**
 * @param {readonly Effect[]} list the effects
 * @param {{reads: Array<(world: any, slot: number) => number>, configKeys: string[]}} ctx the level readers and the
 *   config keys compiled so far
 * @returns {Rule[][]} each lane's rules in registry order, by lane index
 * @throws {Error} for a lane that is not in the catalogue, or a scale that has neither form or both, or a table whose
 *   level 0 is not 1
 */
function compileRules(list, ctx) {
    /** @type {Rule[][]} */
    const rules = [];
    list.forEach((effect, index) => {
        for (const scale of effect.scales) {
            const id = laneIdOf(effect.name, scale.lane);
            if ((scale.perStack === undefined) === (scale.levels === undefined)) {
                throw new Error(`effects: ${effect.name} scales ${scale.lane} by perStack or levels, exactly one`);
            }
            if (scale.levels !== undefined && scale.levels[0] !== 1) {
                throw new Error(`effects: ${effect.name} scales ${scale.lane} with a table whose level 0 is not 1`);
            }
            const per = scale.perStack === undefined ? null : compileRef(scale.perStack, ctx.configKeys);
            const levels = scale.levels === undefined ? null : scale.levels.map((r) => compileRef(r, ctx.configKeys));
            const by = scale.by === undefined ? -1 : laneIdOf(effect.name, scale.by);
            (rules[id] ??= []).push({ read: ctx.reads[index], effect: index, per, levels, by });
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
    const thenOf = list.map((effect) => (effect.then === undefined ? -1 : names.indexOf(effect.then)));
    list.forEach((effect, i) => {
        if (effect.then !== undefined && (thenOf[i] < 0 || effect.fades?.kind !== 'ticks')) {
            throw new Error(
                `effects: ${effect.name} hands over to ${effect.then}, which needs a \`ticks\` fade and a listed effect`,
            );
        }
    });
    const stored = list.filter((effect) => effect.level === 'stacks');
    const rowOf = list.map((effect) => (effect.level === 'stacks' ? stored.indexOf(effect) : -1));
    const reads = list.map((effect, i) => {
        const row = rowOf[i];
        return row >= 0
            ? (/** @type {any} */ world, /** @type {number} */ slot) => world.effectStacks[row][slot]
            : /** @type {(world: any, slot: number) => number} */ (effect.read);
    });
    const ctx = { reads, configKeys: /** @type {string[]} */ ([]) };
    const rules = compileRules(list, ctx);
    const gates = compileGates(list);
    const drainRefs = list.map((effect) => effect.drains.map((drain) => compileRef(drain.perTick, ctx.configKeys)));
    return new EffectSystem({
        list,
        rules,
        gates,
        rowOf,
        stored,
        drainRefs,
        reads,
        thenOf,
        configKeys: ctx.configKeys,
    });
}

/** The readers over one effect list. Construct through `createEffects`. */
export class EffectSystem {
    /**
     * @param {object} parts what `createEffects` compiled
     * @param {readonly Effect[]} parts.list the effects
     * @param {Rule[][]} parts.rules each lane's rules, by lane index
     * @param {number[][]} parts.gates each gate's effect indices
     * @param {number[]} parts.rowOf each effect's stored row, -1 for none
     * @param {readonly Effect[]} parts.stored the effects that store a count, in row order
     * @param {Compiled[][]} parts.drainRefs each effect's drains' `perTick` references
     * @param {Array<(world: any, slot: number) => number>} parts.reads each effect's level reader
     * @param {number[]} parts.thenOf each effect's follow-on effect, -1 for none
     * @param {string[]} parts.configKeys the config keys the rules read, in the order of `world.effectConfig`
     */
    constructor(parts) {
        this.list = parts.list;
        this.rules = parts.rules;
        this.gates = parts.gates;
        this.rowOf = parts.rowOf;
        this.stored = parts.stored;
        this.drainRefs = parts.drainRefs;
        this.reads = parts.reads;
        this.thenOf = parts.thenOf;
        /** Each stored row's follow-on effect, -1 for none. */
        this.storedThen = parts.stored.map((effect) => parts.thenOf[parts.list.indexOf(effect)]);
        this.configKeys = parts.configKeys;
        /** The slot whose computed levels are memoised, -1 for none (`pin`). */
        this.pinned = -1;
        this.memo = new Float64Array(parts.list.length);
        this.have = new Uint32Array(parts.list.length);
        this.epoch = 0;
    }

    /**
     * Memoises each effect's level for one slot until `unpin`, for a caller that reads several lanes of a slot while the body
     * does not change (the cost of a tick, the thrust and turn of a slot): a level is read once, not once a lane.
     * @param {number} slot the agent slot
     * @returns {void}
     */
    pin(slot) {
        this.pinned = slot;
        this.epoch = (this.epoch + 1) >>> 0;
    }

    /** Ends `pin`: levels are read from the body again. */
    unpin() {
        this.pinned = -1;
    }

    /**
     * @param {any} world the world
     * @param {number} slot the agent slot
     * @param {Rule} rule one effect's rule on a lane
     * @returns {number} the effect's level for the slot, from the memo while the slot is pinned
     */
    level(world, slot, rule) {
        if (this.pinned !== slot) {
            return rule.read(world, slot);
        }
        const e = rule.effect;
        if (this.have[e] !== this.epoch) {
            this.memo[e] = rule.read(world, slot);
            this.have[e] = this.epoch;
        }
        return this.memo[e];
    }

    /**
     * @param {any} world the world
     * @param {number} slot the agent slot
     * @param {number} effect an effect's index
     * @returns {number} its level now: the stored count of a `stacks` effect, else what its `read` computes from the body
     */
    levelOf(world, slot, effect) {
        return this.reads[effect](world, slot);
    }

    /**
     * @param {any} world the world
     * @param {number} slot the agent slot
     * @param {number | string} lane a lane's index (`LANE_ID`), or its name
     * @returns {number} the lane at the slot times the factor of every effect that scales it, in registry order, each
     *   read from the state as it stands now; a rule at level 0 multiplies by exactly 1 and is skipped
     */
    liveOf(world, slot, lane) {
        const id = typeof lane === 'number' ? lane : /** @type {Record<string, number>} */ (LANE_ID)[lane];
        return this.fold(world, slot, { id, start: world.laneArrays[id][slot] });
    }

    /**
     * @param {any} world the world
     * @param {number} slot the agent slot
     * @param {number | string} lane a lane's index (`LANE_ID`), or its name
     * @returns {number} the product of the factors of every effect that scales the lane, in registry order, 1 for a lane
     *   no effect scales: `liveOf` without the base, for a number that carries the factor on (`sprintFactor`)
     */
    factorOf(world, slot, lane) {
        const id = typeof lane === 'number' ? lane : /** @type {Record<string, number>} */ (LANE_ID)[lane];
        return this.fold(world, slot, { id, start: 1 });
    }

    /**
     * @param {any} world the world
     * @param {number} slot the agent slot
     * @param {{id: number, start: number}} from the lane's index and the value the factors multiply: its base, or 1
     * @returns {number} `start` times the factor of each rule on the lane in registry order; a rule at level 0
     *   multiplies by exactly 1 and is skipped
     */
    fold(world, slot, { id, start }) {
        let value = start;
        const rules = this.rules[id];
        if (rules !== undefined) {
            for (let k = 0; k < rules.length; k++) {
                const rule = rules[k];
                const level = this.level(world, slot, rule);
                if (level !== 0) {
                    value *= this.factorAt(world, slot, rule, level);
                }
            }
        }
        return value;
    }

    /**
     * @param {any} world the world
     * @param {number} slot the agent slot
     * @param {number} effect an effect's index
     * @param {number | string} lane a lane's index or name
     * @returns {number} the factor that one effect puts on the lane now, 1 when it does not scale it
     */
    effectFactor(world, slot, effect, lane) {
        const id = typeof lane === 'number' ? lane : /** @type {Record<string, number>} */ (LANE_ID)[lane];
        const rule = (this.rules[id] ?? []).find((candidate) => candidate.effect === effect);
        return rule === undefined ? 1 : this.ruleFactor(world, slot, rule);
    }

    /**
     * @param {any} world the world
     * @param {number} slot the agent slot
     * @param {Rule} rule one effect's rule on a lane
     * @returns {number} its factor now (1 at level 0)
     */
    ruleFactor(world, slot, rule) {
        const level = rule.read(world, slot);
        return level === 0 ? 1 : this.factorAt(world, slot, rule, level);
    }

    /**
     * @param {any} world the world
     * @param {number} slot the agent slot
     * @param {Rule} rule one effect's rule on a lane
     * @param {number} level the effect's level, above 0
     * @returns {number} `1 + perStack x level` (never below 0), or the `levels` entry of the level
     */
    factorAt(world, slot, rule, level) {
        if (rule.levels === null) {
            let amount = numberOf(world, slot, /** @type {Compiled} */ (rule.per)) * level;
            if (rule.by >= 0) {
                amount *= world.laneArrays[rule.by][slot];
            }
            const factor = 1 + amount;
            return factor > 0 ? factor : 0;
        }
        return numberOf(world, slot, rule.levels[level]);
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
            if (this.reads[closing[k]](world, slot) > 0) {
                return false;
            }
        }
        return true;
    }

    /**
     * Gathers what a world being built holds for the effects: the stored rows, `effectStacks[row][slot]` and
     * `effectTicks[row][slot]` (`Float64Array` rows of `maxAgents`, declared by `effectSpecs` in `agent-arrays.js`, so hashed
     * and zeroed with a freed slot like every per-slot array), and `effectConfig`, the config numbers the rules read.
     * @param {any} world the world being built, its `agentRows` allocated
     * @returns {void}
     */
    allocRows(world) {
        const n = world.config.maxAgents;
        const rowOf = (/** @type {string} */ name) => {
            if (world[name] === undefined) {
                // Not declared by `agentSpecs` (a fixture list): allocate it, and zero it with the slot.
                world[name] = new Float64Array(n);
                world.agentRows.push({ array: world[name], stride: 1, name });
            }
            return world[name];
        };
        world.effectStacks = this.stored.map((effect) => rowOf(`effect.${effect.name}.stacks`));
        world.effectTicks = this.stored.map((effect) => rowOf(`effect.${effect.name}.ticks`));
        this.refreshConfig(world);
    }

    /**
     * Reads the config numbers of the rules into `world.effectConfig` again: call it after the config changes.
     * @param {any} world the world
     * @returns {void}
     */
    refreshConfig(world) {
        world.effectConfig = Float64Array.from(this.configKeys, (key) => world.config[key]);
    }

    /**
     * The one pass over stored stacks, the last phase of a tick. A `ticks` effect counts its timer down and drops all its
     * stacks when it ends (and raises its `then` effect); an `every` effect drops one stack each time its timer runs out
     * and restarts the timer while stacks remain; a `held` effect is left to its applier. A follow-on is listed before its
     * cause in the registry, so this pass has already read its row and its timer starts on the next tick.
     * @param {any} world the world
     * @returns {void}
     */
    fade(world) {
        for (let row = 0; row < this.stored.length; row++) {
            const fades = /** @type {NonNullable<Effect['fades']>} */ (this.stored[row].fades);
            if (fades.kind === 'held') {
                continue;
            }
            const length = world.config[fades.key];
            const stacks = world.effectStacks[row];
            const ticks = world.effectTicks[row];
            const then = this.storedThen[row];
            for (let slot = 0; slot < stacks.length; slot++) {
                if (stacks[slot] > 0 && fadeSlot(fades.kind, { stacks, ticks, length }, slot) && then >= 0) {
                    raiseEffect(this, world, slot, { effect: then, source: 0 });
                }
            }
        }
    }
}

/**
 * @param {'ticks' | 'every'} kind the fade kind
 * @param {{stacks: Float64Array, ticks: Float64Array, length: number}} row the effect's stored rows and timer length
 * @param {number} slot a slot holding stacks
 * @returns {boolean} whether the slot's last stack ended
 */
function fadeSlot(kind, row, slot) {
    row.ticks[slot] -= 1;
    if (row.ticks[slot] > 0) {
        return false;
    }
    if (kind === 'ticks') {
        row.stacks[slot] = 0;
        row.ticks[slot] = 0;
        return true;
    }
    row.stacks[slot] -= 1;
    row.ticks[slot] = row.stacks[slot] > 0 ? row.length : 0;
    return false;
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
 * @param {number | string} lane a lane's index (`LANE_ID`) or name
 * @returns {number} the lane with every effect applied (see `EffectSystem.liveOf`)
 */
export function liveOf(world, slot, lane) {
    return SYSTEM.liveOf(world, slot, lane);
}

/**
 * @param {any} world the world
 * @param {number} slot the agent slot
 * @param {number | string} lane a lane's index (`LANE_ID`) or name
 * @returns {number} the product of the effects' factors on the lane (see `EffectSystem.factorOf`)
 */
export function factorOf(world, slot, lane) {
    return SYSTEM.factorOf(world, slot, lane);
}

/**
 * @param {any} world the world
 * @param {number} slot the agent slot
 * @param {number} effect an `EFFECT` code
 * @param {number | string} lane a lane's index or name
 * @returns {number} the factor that one effect puts on the lane now, 1 when it does not scale it
 */
export function effectFactor(world, slot, effect, lane) {
    return SYSTEM.effectFactor(world, slot, effect, lane);
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

/**
 * Memoises the effect levels of one slot until `unpinSlot` (see `EffectSystem.pin`).
 * @param {number} slot the agent slot
 * @returns {void}
 */
export function pinSlot(slot) {
    SYSTEM.pin(slot);
}

/** Ends `pinSlot`. */
export function unpinSlot() {
    SYSTEM.unpin();
}
