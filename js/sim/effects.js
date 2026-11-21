// The effect registry's engine (docs/designs/status-effects.md, "The registry"): an effect is a stacked, capped, timed
// change to what a body can do. It multiplies a lane (`liveOf` reads the lane with every effect applied) or closes a gate
// (`gateOpen`), for as long as its level is above 0. The effects themselves are the list in `effect-list.js`;
// `createEffects` builds the readers over any list, so the contract test runs them on fixture effects. A lane is read by
// its index (`LANE_ID`), each rule holds its level reader and its numbers compiled, and a rule at level 0 is skipped:
// its factor is exactly 1. Nothing here allocates per call and nothing draws from the RNG.

import { levelOfEffect } from './effect-dispatch.js';
import { EFFECTS } from './effect-list.js';
import { LANE_ID, LEVEL, NUMBER, REF, RESULT, SHARE, compileRef, numberOf } from './effect-refs.js';
import { raiseEffect } from './effect-raise.js';
import { ruleFactor } from './effect-factor.js';
import { GROUP, compileGroups, foldGroup, liveIn } from './effect-group.js';
import { GATE, GATE_COUNT, compileGates, compileRules, compileThen } from './effect-compile.js';

export { GATE, GATE_COUNT, GROUP, LANE_ID, RESULT, compileRef, liveIn, numberOf };

/** @typedef {import('./effect-refs.js').Ref} Ref */
/** @typedef {import('./effect-refs.js').Compiled} Compiled */

/**
 * @typedef {object} Scale
 * @property {string} lane the lane multiplied (a name of `LANES`)
 * @property {Ref} [perStack] the lane is multiplied by `1 + perStack x level`, never below 0
 * @property {readonly Ref[]} [levels] the lane is multiplied by `levels[level]` (level 0 first, and 1)
 * @property {string} [by] a lane of the body that multiplies `perStack` (the `nerve` of the adrenaline effects)
 * @property {boolean} [power] the lane is multiplied by `perStack ^ level`, not `1 + perStack x level` (`hoarse`: each stack
 *   multiplies the call cost again)
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
 * @property {number} effect the effect's index
 * @property {Compiled | null} per the `perStack` reference
 * @property {Compiled[] | null} levels the `levels` references
 * @property {number} by the lane that multiplies `perStack`, -1 for none
 * @property {boolean} power whether the factor is `perStack ^ level`
 */

/**
 * @param {readonly Effect[]} list the effects
 * @param {number[]} rowOf each effect's stored row, -1 for none
 * @returns {(world: any, slot: number, effect: number) => void} a level dispatch over any list: leaves in `LEVEL[0]` the
 *   effect's stored stacks, or what its reader computes. One call site sees every reader, so the sim's own list uses the
 *   generated `levelOfEffect` in its place.
 */
function readerDispatch(list, rowOf) {
    return (world, slot, effect) => {
        const row = rowOf[effect];
        const read = /** @type {Function} */ (list[effect].read);
        if (row >= 0) {
            LEVEL[0] = world.effectStacks[row][slot];
        } else if (list[effect].level === 'share') {
            read(world, slot);
            LEVEL[0] = SHARE[0];
        } else {
            LEVEL[0] = read(world, slot);
        }
    };
}

/**
 * Builds the readers over a list of effects.
 * @param {readonly Effect[]} list the effects, in registry order
 * @param {{dispatch?: (world: any, slot: number, effect: number) => void}} [options] `dispatch`, a level dispatch written
 *   for this list (`levelOfEffect` for `EFFECTS`); by default one that calls each effect's reader
 * @returns {EffectSystem} the readers, the stored rows and the fade pass of the list
 */
export function createEffects(list, options = {}) {
    const names = list.map((effect) => effect.name);
    if (new Set(names).size !== names.length) {
        throw new Error('effects: every effect needs its own name');
    }
    for (const effect of list) {
        if (effect.level === 'stacks' && effect.fades === undefined) {
            throw new Error(`effects: ${effect.name} stores stacks, so it needs fades`);
        }
    }
    const thenOf = compileThen(list);
    const stored = list.filter((effect) => effect.level === 'stacks');
    const rowOf = list.map((effect) => (effect.level === 'stacks' ? stored.indexOf(effect) : -1));
    const ctx = { configKeys: /** @type {string[]} */ ([]) };
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
        dispatch: options.dispatch ?? readerDispatch(list, rowOf),
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
     * @param {(world: any, slot: number, effect: number) => void} parts.dispatch leaves an effect's level in `LEVEL[0]`
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
        this.dispatch = parts.dispatch;
        this.configKeys = parts.configKeys;
        /** Each stored row's follow-on effect, -1 for none. */
        this.storedThen = parts.stored.map((effect) => parts.thenOf[parts.list.indexOf(effect)]);
    }

    /**
     * @param {any} world the world
     * @param {number} slot the agent slot
     * @param {number} effect an effect's index
     * @returns {number} its level now: the stored count of a `stacks` effect, else what its reader computes from the body
     */
    levelOf(world, slot, effect) {
        this.dispatch(world, slot, effect);
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
        const rules = world.laneRules[id];
        for (let k = 0; rules !== undefined && k < rules.length; k++) {
            this.dispatch(world, slot, rules[k].effect);
            if (LEVEL[0] !== 0) {
                ruleFactor(world, slot, rules[k]);
                RESULT[0] *= NUMBER[0];
            }
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
                this.dispatch(world, slot, effect);
                if (LEVEL[0] === 0) {
                    return 1;
                }
                ruleFactor(world, slot, rules[k]);
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
            this.dispatch(world, slot, closing[k]);
            if (LEVEL[0] > 0) {
                return false;
            }
        }
        return true;
    }

    /**
     * Gathers what a world being built holds for the effects: the stored rows, `effectStacks[row][slot]` and
     * `effectTicks[row][slot]` (`Float64Array` rows of `maxAgents`, declared by `effectSpecs` in `agent-arrays.js`, so hashed
     * and zeroed with a freed slot like every per-slot array), `effectLive`, each row's count of slots holding a stack (kept by
     * `effect-raise.js` and the fade pass), and `effectConfig`, the config numbers the rules read.
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
        world.effectLive = new Int32Array(this.stored.length);
        this.refreshConfig(world);
    }

    /**
     * Reads the config numbers of the rules into `world.effectConfig` again: call it after the config changes.
     * @param {any} world the world
     * @returns {void}
     */
    refreshConfig(world) {
        world.effectConfig = Float64Array.from(this.configKeys, (key) => world.config[key]);
        world.laneRules = this.rules.map((rules) => rules?.filter((rule) => !isNeutral(rule, world.effectConfig)));
        world.effectGroups = compileGroups(this.list, world.laneRules);
    }

    /**
     * The one pass over stored stacks, the last phase of a tick. A `ticks` effect counts its timer down and drops all its
     * stacks when it ends (and raises its `then` effect); an `every` effect drops one stack each time its timer runs out
     * and restarts the timer while stacks remain; a `held` effect is left to its applier. A follow-on is listed before its
     * cause in the registry, so this pass has already read its row and its timer starts on the next tick. A row no slot holds
     * a stack of (`effectLive` 0) is skipped, and the walk of any other row recounts it.
     * @param {any} world the world
     * @returns {void}
     */
    fade(world) {
        const live = world.effectLive;
        for (let row = 0; row < this.stored.length; row++) {
            if (this.stored[row].fades?.kind !== 'held' && live[row] !== 0) {
                live[row] = this.fadeRow(world, row);
            }
        }
    }

    /**
     * Fades one `ticks` or `every` row over every slot (see `fade`).
     * @param {any} world the world
     * @param {number} row the stored row
     * @returns {number} the slots that still hold a stack of it
     */
    fadeRow(world, row) {
        const kind = /** @type {'ticks' | 'every'} */ (this.stored[row].fades?.kind);
        const stacks = world.effectStacks[row];
        FADE.stacks = stacks;
        FADE.ticks = world.effectTicks[row];
        FADE.length = world.config[/** @type {NonNullable<Effect['fades']>} */ (this.stored[row].fades).key];
        const then = this.storedThen[row];
        let held = 0;
        for (let slot = 0; slot < stacks.length; slot++) {
            if (stacks[slot] > 0 && fadeSlot(kind, slot) && then >= 0) {
                CAUSE.effect = then;
                CAUSE.source = 0;
                raiseEffect(this, world, slot, CAUSE);
            }
            held += stacks[slot] > 0 ? 1 : 0;
        }
        return held;
    }
}

/**
 * @param {Compiled} ref a compiled reference
 * @param {Float64Array} config the config numbers of the rules (`world.effectConfig`)
 * @returns {number} its value with this config, the same arithmetic as `numberInto`; NaN for a lane, which varies by body
 */
function constantOf(ref, config) {
    if (ref.kind === REF.LANE) {
        return NaN;
    }
    return ref.kind === REF.LITERAL ? ref.value : ref.scale * config[ref.index] + ref.offset;
}

/**
 * @param {Rule} rule one effect's rule on a lane
 * @param {Float64Array} config the config numbers of the rules (`world.effectConfig`)
 * @returns {boolean} whether the rule's factor is exactly 1 at every level with this config: a `perStack` number of 0 (or 1
 *   for a `power` rule), or a `levels` table whose every entry is 1. The fold leaves such a rule out, so an effect whose
 *   strength is off costs a lane nothing; a rule that reads a lane is kept.
 */
function isNeutral(rule, config) {
    if (rule.levels !== null) {
        return rule.levels.every((ref) => constantOf(ref, config) === 1);
    }
    return constantOf(/** @type {Compiled} */ (rule.per), config) === (rule.power ? 1 : 0);
}

/** The row the fade pass is walking: its stacks, its timers and the timer length, set once a row so a slot allocates nothing. */
const FADE = { stacks: new Float64Array(0), ticks: new Float64Array(0), length: 0 };

/** The cause `raiseOn` and the fade pass hand `raiseEffect`, reused so a raise allocates nothing (it reads it at once). */
const CAUSE = { effect: 0, source: 0 };

/**
 * @param {'ticks' | 'every'} kind the fade kind
 * @param {number} slot a slot holding stacks of the row in `FADE`
 * @returns {boolean} whether the slot's last stack ended
 */
function fadeSlot(kind, slot) {
    const { stacks, ticks, length } = FADE;
    ticks[slot] -= 1;
    if (ticks[slot] > 0) {
        return false;
    }
    if (kind === 'ticks') {
        stacks[slot] = 0;
        ticks[slot] = 0;
        return true;
    }
    stacks[slot] -= 1;
    ticks[slot] = stacks[slot] > 0 ? length : 0;
    return false;
}

/**
 * Raises one stack of a stored effect of `EFFECTS` on a slot (`raiseEffect` over `SYSTEM`), with no record built per call.
 * @param {any} world the world
 * @param {number} slot the agent slot
 * @param {number} effect an `EFFECT` code of a `stacks` effect
 * @param {number} source what raised it (an agent slot, or 0)
 * @returns {boolean} whether a stack was gained
 */
export function raiseOn(world, slot, effect, source) {
    CAUSE.effect = effect;
    CAUSE.source = source;
    return raiseEffect(SYSTEM, world, slot, CAUSE);
}

/** The effects of the sim, in registry order. */
export const EFFECT_LIST = EFFECTS;

/** The readers over `EFFECTS`, each level read through the generated switch. */
export const SYSTEM = createEffects(EFFECTS, { dispatch: levelOfEffect });

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
 * Folds the `maxTurn` and `maxThrust` lanes of the slot (`GROUP.MOTION`), each effect level read once, for `liveIn`.
 * @param {any} world the world
 * @param {number} slot the agent slot
 * @returns {void}
 */
export function motionFactors(world, slot) {
    foldGroup(SYSTEM.dispatch, world, slot, GROUP.MOTION);
}

/**
 * Folds the six cost lanes of `tickCost` for the slot (`GROUP.COST`), each effect level read once, for `liveIn`.
 * @param {any} world the world
 * @param {number} slot the agent slot
 * @returns {void}
 */
export function costFactors(world, slot) {
    foldGroup(SYSTEM.dispatch, world, slot, GROUP.COST);
}

/**
 * Folds the two heat lanes of `stepTemperature` for the slot (`GROUP.HEAT`), each effect level read once, for `liveIn`.
 * @param {any} world the world
 * @param {number} slot the agent slot
 * @returns {void}
 */
export function heatFactors(world, slot) {
    foldGroup(SYSTEM.dispatch, world, slot, GROUP.HEAT);
}
