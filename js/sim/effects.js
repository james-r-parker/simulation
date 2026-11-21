// The effect registry's engine (docs/designs/status-effects.md, "The registry"): an effect is a stacked, capped, timed
// change to what a body can do. It multiplies a lane (`liveOf` reads the lane with every effect applied) or closes a gate
// (`gateOpen`), for as long as its level is above 0. The effects themselves are the list in `effect-list.js`;
// `createEffects` builds the readers over any list, so the contract test runs them on fixture effects. A lane is read by
// its index (`LANE_ID`), each rule holds its level reader and its numbers compiled, and a rule at level 0 is skipped:
// its factor is exactly 1. Nothing here allocates per call and nothing draws from the RNG.

import { EFFECTS } from './effect-list.js';
import { LANE_ID, LEVEL, NUMBER, RESULT, SHARE, compileRef, numberInto, numberOf } from './effect-refs.js';

export { LANE_ID, RESULT, compileRef, numberOf };

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
 */

/**
 * @typedef {object} Effect
 * @property {string} name the key of its config numbers, its inspector row and its detector
 * @property {'body' | 'feeding' | 'social' | 'combat'} family
 * @property {number} maxStacks the cap, 1 for an effect that is on or off
 * @property {'stacks' | 'share' | 'step'} level a stored count, or a number computed from the body when read
 * @property {(world: any, slot: number) => number | void} [read] the level of a `share` or `step` effect: a `step` reader
 *   returns its whole level (0, 1 or 2); a `share` reader leaves its share in `SHARE[0]` and returns nothing, since a number
 *   returned from a call the compiler does not inline is boxed
 * @property {{kind: 'ticks' | 'every', key: string}} [fades] a `stacks` effect's timer, its length a config key
 * @property {readonly Scale[]} scales the lanes it multiplies
 * @property {readonly string[]} gates the gates it closes while its level is above 0 (`GATE` names)
 * @property {readonly {perTick: Ref, cause: string, times?: string}[]} drains the energy removed each tick it is on,
 *   `perTick x level` (x the named per-slot array, `dose`), booked under the `LOSS_CAUSE` named
 * @property {string | null} applier the rule that raises it, null for a computed effect
 * @property {boolean} visible whether the renderer and the inspector show it
 */

/**
 * @typedef {object} Rule one effect's multiplication of one lane
 * @property {(world: any, slot: number) => number | void} read the effect's level reader
 * @property {boolean} share whether the reader leaves a share in `SHARE[0]` (a `share` or `stacks` effect)
 * @property {number} effect the effect's index
 * @property {Compiled | null} per the `perStack` reference
 * @property {Compiled[] | null} levels the `levels` references
 */

/**
 * @param {readonly Effect[]} list the effects
 * @param {{reads: Array<(world: any, slot: number) => number | void>, shares: boolean[], configKeys: string[]}} ctx the level readers, which of them
 *   leave a share, and the config keys compiled so far
 * @returns {Rule[][]} each lane's rules in registry order, by lane index
 * @throws {Error} for a lane that is not in the catalogue, or a scale that has neither form or both, or a table whose
 *   level 0 is not 1
 */
function compileRules(list, ctx) {
    /** @type {Rule[][]} */
    const rules = [];
    list.forEach((effect, index) => {
        for (const scale of effect.scales) {
            const id = /** @type {Record<string, number>} */ (LANE_ID)[scale.lane];
            if (id === undefined) {
                throw new Error(`effects: ${effect.name} scales ${scale.lane}, which is not a lane`);
            }
            if ((scale.perStack === undefined) === (scale.levels === undefined)) {
                throw new Error(`effects: ${effect.name} scales ${scale.lane} by perStack or levels, exactly one`);
            }
            if (scale.levels !== undefined && scale.levels[0] !== 1) {
                throw new Error(`effects: ${effect.name} scales ${scale.lane} with a table whose level 0 is not 1`);
            }
            const per = scale.perStack === undefined ? null : compileRef(scale.perStack, ctx.configKeys);
            const levels = scale.levels === undefined ? null : scale.levels.map((r) => compileRef(r, ctx.configKeys));
            (rules[id] ??= []).push({ read: ctx.reads[index], share: ctx.shares[index], effect: index, per, levels });
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
    const stored = list.filter((effect) => effect.level === 'stacks');
    const rowOf = list.map((effect) => (effect.level === 'stacks' ? stored.indexOf(effect) : -1));
    const reads = list.map((effect, i) => {
        const row = rowOf[i];
        return row >= 0
            ? (/** @type {any} */ world, /** @type {number} */ slot) => {
                  SHARE[0] = world.effectStacks[row][slot];
              }
            : /** @type {(world: any, slot: number) => number | void} */ (effect.read);
    });
    const shares = list.map((effect) => effect.level !== 'step');
    const ctx = { reads, shares, configKeys: /** @type {string[]} */ ([]) };
    const rules = compileRules(list, ctx);
    const gates = compileGates(list);
    const drainRefs = list.map((effect) => effect.drains.map((drain) => compileRef(drain.perTick, ctx.configKeys)));
    const probes = list.map((_, effect) => ({
        read: reads[effect],
        share: shares[effect],
        effect,
        per: null,
        levels: null,
    }));
    return new EffectSystem({ list, rules, gates, rowOf, stored, drainRefs, probes, configKeys: ctx.configKeys });
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
     * @param {Rule[]} parts.probes each effect as a rule that scales nothing, to read its level
     * @param {string[]} parts.configKeys the config keys the rules read, in the order of `world.effectConfig`
     */
    constructor(parts) {
        this.list = parts.list;
        this.rules = parts.rules;
        this.gates = parts.gates;
        this.rowOf = parts.rowOf;
        this.stored = parts.stored;
        this.drainRefs = parts.drainRefs;
        this.probes = parts.probes;
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
     * Leaves in `LEVEL[0]` the effect's level for the slot, from the memo while the slot is pinned.
     * @param {any} world the world
     * @param {number} slot the agent slot
     * @param {Rule} rule one effect's rule on a lane, or its probe
     * @returns {void}
     */
    level(world, slot, rule) {
        const e = rule.effect;
        const pinned = this.pinned === slot;
        if (pinned && this.have[e] === this.epoch) {
            LEVEL[0] = this.memo[e];
            return;
        }
        if (rule.share) {
            rule.read(world, slot);
            LEVEL[0] = SHARE[0];
        } else {
            LEVEL[0] = /** @type {number} */ (rule.read(world, slot));
        }
        if (pinned) {
            this.memo[e] = LEVEL[0];
            this.have[e] = this.epoch;
        }
    }

    /**
     * @param {any} world the world
     * @param {number} slot the agent slot
     * @param {number} effect an effect's index
     * @returns {number} its level now: the stored count of a `stacks` effect, else what its reader computes from the body
     */
    levelOf(world, slot, effect) {
        this.level(world, slot, this.probes[effect]);
        return LEVEL[0];
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
        this.fold(world, slot, id, true);
        return RESULT[0];
    }

    /**
     * @param {any} world the world
     * @param {number} slot the agent slot
     * @param {number | string} lane a lane's index (`LANE_ID`), or its name
     * @returns {number} the product of the factors of every effect that scales the lane, in registry order, 1 for a lane
     *   no effect scales: `liveOf` without the base, for a number that carries the factor on (`sprintFactor`)
     */
    factorOf(world, slot, lane) {
        this.computeFactor(world, slot, lane);
        return RESULT[0];
    }

    /**
     * `factorOf` that leaves its product in `RESULT[0]` and returns nothing, so a hot caller never has it boxed.
     * @param {any} world the world
     * @param {number} slot the agent slot
     * @param {number | string} lane a lane's index (`LANE_ID`), or its name
     * @returns {void}
     */
    computeFactor(world, slot, lane) {
        const id = typeof lane === 'number' ? lane : /** @type {Record<string, number>} */ (LANE_ID)[lane];
        this.fold(world, slot, id, false);
    }

    /**
     * Leaves in `RESULT[0]` the lane's base (or 1) times the factor of each rule on it in registry order; a rule at level 0
     * multiplies by exactly 1 and is skipped. Plain indexed loops over compiled rules, and the running product lives in
     * `RESULT[0]`, not in a local that holds a small whole number or a double: a compiler that cannot tell which boxes it.
     * @param {any} world the world
     * @param {number} slot the agent slot
     * @param {number} id the lane's index
     * @param {boolean} fromLane whether the product starts at the lane's value at the slot, else at 1
     * @returns {void}
     */
    fold(world, slot, id, fromLane) {
        RESULT[0] = fromLane ? world.laneArrays[id][slot] : 1;
        const rules = this.rules[id];
        if (rules !== undefined) {
            for (let k = 0; k < rules.length; k++) {
                this.factorOfRule(world, slot, rules[k]);
                RESULT[0] *= NUMBER[0];
            }
        }
    }

    /**
     * Leaves in `NUMBER[0]` the rule's factor now: 1 at level 0, else `1 + perStack x level` (never below 0) or the
     * `levels` entry of the level.
     * @param {any} world the world
     * @param {number} slot the agent slot
     * @param {Rule} rule one effect's rule on a lane
     * @returns {void}
     */
    factorOfRule(world, slot, rule) {
        this.level(world, slot, rule);
        const level = LEVEL[0];
        if (level === 0) {
            NUMBER[0] = 1;
        } else if (rule.levels === null) {
            numberInto(world, slot, /** @type {Compiled} */ (rule.per));
            const factor = 1 + NUMBER[0] * level;
            NUMBER[0] = factor > 0 ? factor : 0;
        } else {
            numberInto(world, slot, rule.levels[level]);
        }
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
        const rules = this.rules[id];
        for (let k = 0; rules !== undefined && k < rules.length; k++) {
            if (rules[k].effect === effect) {
                this.factorOfRule(world, slot, rules[k]);
                return NUMBER[0];
            }
        }
        return 1;
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
            this.level(world, slot, this.probes[closing[k]]);
            if (LEVEL[0] > 0) {
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
 * @param {number | string} lane a lane's index (`LANE_ID`) or name
 * @returns {number} the lane with every effect applied (see `EffectSystem.liveOf`)
 */
export function liveOf(world, slot, lane) {
    return SYSTEM.liveOf(world, slot, lane);
}

/**
 * `factorOf` that leaves its product in `RESULT[0]` (see `EffectSystem.computeFactor`).
 * @param {any} world the world
 * @param {number} slot the agent slot
 * @param {number | string} lane a lane's index (`LANE_ID`) or name
 * @returns {void}
 */
export function computeFactor(world, slot, lane) {
    SYSTEM.computeFactor(world, slot, lane);
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
