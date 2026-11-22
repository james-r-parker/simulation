// The body numbers of one specialisation (docs/designs/role-budget.md, "Body numbers"): every number the budget's
// formulas read, resolved from the lane bases of body-genes.md (`laneBases`) so it follows whatever the config and the
// spec's `body` overrides say. Plain numbers only; no function, no world, no RNG.

import { laneBases } from '../sim/body-lanes.js';
import { checkTraits, lanesAt } from './role-budget-genes.js';
import { checkEffects, lanesWithEffects, startWorld } from './role-budget-effects.js';
import { EFFECT, effectFactor } from '../sim/effects.js';

export { startWorld };

/** The share of its store a body holds at the start of a scene: the arena's `STORE_SHARE` of `chase-body.js`. */
export const STORE_SHARE = 0.5;

/**
 * @typedef {object} RoleParams
 * @property {string} spec the specialisation's name
 * @property {number} hunts 1 for a body that can hunt, else 0
 * @property {number} size the size at the start of a scene
 * @property {number} energy the energy at the start of a scene
 * @property {{max: number, base: number, min: number, perEnergy: number}} sizing `maxEnergy`, `baseSize`, `minSize`
 *   and `energyToSize`: size is `max(min, base + energy / perEnergy)`
 * @property {{base: number, cruise: number, sprint: number, graze: number, handling: number, gain: number, fatShare: number}} thrust
 *   `base` is `THRUST` x `maxThrust` x efficiency; `cruise`, `sprint`, `graze` and `handling` are the gaits at the start
 *   energy (fat factor included); `gain` is `sprintMultiplier x sprintBoost`; `fatShare` is `fatSlowShare`
 * @property {number} damping
 * @property {{cruise: number, sprint: number}} cap the speed caps
 * @property {{start: number, max: number}} turnRate `maxTurn` x `turnMultiplier` x the fat factor, and without the factor
 * @property {{range: number, rearShare: number, rays: number}} view
 * @property {{on: number, drain: number, refill: number, floor: number, restThrust: number}} store
 * @property {{damage: number, taken: number, arc: number, sizeRatio: number, cost: number, kick: number, miss: number, alarm: number}} bite
 * @property {{line: number, gorgeShare: number, gorgeCap: number}} kill
 * @property {{passive: number, size: number, move: number, turn: number, sprint: number, upkeep: number, juvenile: number, standingMult: number, drain: number, heat: number}} cost
 * @property {{restitution: number}} contact the contact impulse of `resolveContacts`
 * @property {{radius: number, ticks: number, threshold: number, cost: number}} call
 * @property {{radius: number, ticks: number, cooldown: number, cost: number, threshold: number, decoy: number}} smoke
 * @property {{energy: number, cost: number, impulse: number}} repel the defender's shove (`tryDefenderRepel`): the energy it drains
 *   from a hunter in its jaws, what it costs the defender, and the knockback; 0 and 0 energy and impulse is off
 * @property {{gainMove: number, lossPassive: number, optimalMax: number, start: number, efficiency: number, optimalMin: number,
 *   max: number, passiveFactor: number, speedCap: number, seasonLoss: number}} heat the heat numbers; `seasonLoss` is the first
 *   season's factor on the passive cooling, `max(0, 1 - temperatureModifier x temperatureSeasonSlope)`
 * @property {{splitMin: number, birthReserve: number, childShare: number, mateMin: number, mateCost: number, maturityTicks: number, maxAgeTicks: number,
 *   founderEnergy: number, entrantEnergy: number, childMin: number}} repro the life numbers and the three birth energies
 *   (`initialEnergy`, `entrantEnergy` with 0 reading as `initialEnergy`, and `childEnergyMin`)
 * @property {{plantValue: number, meatValue: number, handlingTicks: number, digestTicks: number, satiation: number,
 *   foodEnergy: number, foodRadius: number}} feed the feeding numbers: a spec's share of a plant item and of a carcass, the
 *   handling and digest windows (one `ateTimer` holds both), the share of the store at which it stops eating, and an item's
 *   energy and radius
 */

/**
 * @param {Readonly<Record<string, any>>} config the validated config
 * @param {Record<string, number>} lane the spec's lane bases
 * @returns {number} what `thrustEfficiency` was: the cold and heat bands' factor on `maxThrust` at the start temperature
 */
function thrustEfficiency(config, lane) {
    const world = startWorld(config, lane);
    return (
        effectFactor(world, 0, EFFECT.COLD_BAND, 'maxThrust') * effectFactor(world, 0, EFFECT.HEAT_BAND, 'maxThrust')
    );
}

/**
 * @param {import('../sim/world.js').World} world a one-slot world at the temperature wanted
 * @returns {number} what `passiveMultiplier` was: the cold and hot ramps' factor on the standing cost
 */
export function passiveFactorAt(world) {
    return (
        effectFactor(world, 0, EFFECT.COLD_RAMP, 'passiveLoss') * effectFactor(world, 0, EFFECT.HOT_RAMP, 'passiveLoss')
    );
}

/**
 * @param {Readonly<Record<string, any>>} config the validated config
 * @param {Record<string, number>} lane the spec's lane bases
 * @returns {number} the passive factor at the start temperature
 */
function passiveMultiplier(config, lane) {
    return passiveFactorAt(startWorld(config, lane));
}

/**
 * @param {Readonly<Record<string, any>>} config the validated config
 * @param {Record<string, number>} lane the spec's lane bases
 * @param {number} fat the fat factor at the start energy
 * @returns {RoleParams['thrust']} the thrust numbers
 */
function thrustOf(config, lane, fat) {
    const base = lane.maxThrust * thrustEfficiency(config, lane);
    const gain = config.sprintMultiplier * lane.sprintBoost;
    const cruise = base * fat;
    return {
        base,
        cruise,
        sprint: cruise * (1 + gain),
        graze: cruise * lane.grazeThrust,
        handling: cruise * lane.handlingThrust,
        gain,
        fatShare: lane.fatSlowShare,
    };
}

/**
 * @param {Readonly<Record<string, any>>} config the validated config
 * @param {Record<string, number>} lane the spec's lane bases
 * @param {{entry: Record<string, any>, burn: number}} body the spec's entry and its juvenile burn
 * @returns {RoleParams['cost']} the terms of `tickCost`
 */
function costOf(config, lane, { entry, burn }) {
    const hunts = entry.canHunt && config.specMutationRate > 0;
    return {
        passive: lane.passiveLoss,
        size: lane.sizeEnergyLoss,
        move: lane.movementCost,
        turn: lane.turnCost * entry.moveCostMultiplier,
        sprint: lane.sprintCost,
        upkeep: hunts ? lane.huntUpkeep : 0,
        juvenile: burn,
        standingMult: entry.passiveLossMultiplier,
        drain: config.seasons[0].energyDrain,
        heat: passiveMultiplier(config, lane),
    };
}

/**
 * Resolves one specialisation's numbers.
 * @param {Readonly<Record<string, any>>} config the validated config
 * @param {string} specName a specialisation name
 * @param {Record<string, number>} [traits] a ratio per trait, composed as `applyTraits` composes it (a trait left out is at
 *   1; `heatBand` is a shift in degrees); with every ratio 1 the lanes are `laneBases`
 * @param {{age?: 'adult' | 'juvenile', storeShare?: number, effects?: Record<string, number>}} [options] the age and the
 *   store share the body starts at, and `effects`: a level per effect that stores stacks (`rallied: 1`), composed as `liveOf`
 *   composes it (docs/designs/status-effects.md); with every level 0, or none, the record is the one of today
 * @returns {Readonly<RoleParams>} the record
 * @throws {Error} on an unknown specialisation, a name in `traits` that is not a trait, or an effect that takes no level
 */
export function roleParams(config, specName, traits = {}, options = {}) {
    checkTraits(config, specName, traits);
    const { age = 'adult', storeShare = STORE_SHARE, effects } = options;
    checkEffects(effects ?? {});
    const entry = config.specialisations[specName];
    const lane = lanesWithEffects(config, lanesAt(config, laneBases(config, specName), traits), effects);
    const energy = storeShare * lane.maxEnergy;
    const size = Math.max(lane.minSize, lane.baseSize + energy / lane.energyToSize);
    const fat = 1 - (lane.fatSlowShare * energy) / lane.maxEnergy;
    const burn = entry.canHunt && age === 'juvenile' ? lane.juvenileBurn : 1;
    const thrust = thrustOf(config, lane, fat);
    return Object.freeze({
        spec: specName,
        hunts: entry.canHunt ? 1 : 0,
        size,
        energy,
        sizing: { max: lane.maxEnergy, base: lane.baseSize, min: lane.minSize, perEnergy: lane.energyToSize },
        thrust,
        damping: config.damping,
        cap: { cruise: lane.maxVelocity, sprint: lane.maxVelocity * (1 + thrust.gain) },
        turnRate: { start: lane.maxTurn * fat, max: lane.maxTurn },
        view: { range: lane.visionRange, rearShare: lane.rearVisionShare, rays: config.rayCount },
        store: {
            on: config.sprintStoreEnabled ? 1 : 0,
            drain: lane.sprintDrain,
            refill: lane.sprintRefill,
            floor: lane.sprintFloor,
            restThrust: lane.sprintRestThrust,
        },
        ...combatOf(lane),
        cost: costOf(config, lane, { entry, burn }),
        contact: { restitution: config.restitution },
        ...signalsOf(config, lane),
    });
}

/**
 * @param {Record<string, number>} lane the spec's lane bases
 * @returns {Pick<RoleParams, 'bite' | 'kill'>} the bite and the kill numbers
 */
function combatOf(lane) {
    return {
        bite: {
            damage: lane.biteEnergy,
            taken: lane.biteTakenMultiplier,
            arc: lane.biteArc,
            sizeRatio: lane.huntSizeRatio,
            cost: lane.biteCost,
            kick: lane.kickMultiplier,
            miss: lane.strikeMissCost,
            alarm: lane.alarmBiteShare,
        },
        kill: { line: lane.killShare * lane.maxEnergy, gorgeShare: lane.killGorgeShare, gorgeCap: lane.killGorgeCap },
    };
}

/**
 * @param {Readonly<Record<string, any>>} config the validated config
 * @param {Record<string, number>} lane the spec's lane bases
 * @returns {Pick<RoleParams, 'heat' | 'repro' | 'feed'>} the heat, life and feeding numbers
 */
function lifeNumbers(config, lane) {
    return {
        heat: {
            gainMove: lane.temperatureGainMove,
            lossPassive: lane.temperatureLossPassive,
            optimalMax: lane.temperatureOptimalMax,
            start: config.temperatureStart,
            efficiency: thrustEfficiency(config, lane),
            optimalMin: lane.temperatureOptimalMin,
            max: config.temperatureMax,
            passiveFactor: config.temperaturePassiveLossFactor,
            speedCap: lane.heatSpeedCap,
            seasonLoss: Math.max(0, 1 - config.seasons[0].temperatureModifier * config.temperatureSeasonSlope),
        },
        repro: {
            splitMin: lane.splitMinEnergy,
            birthReserve: lane.birthReserve,
            childShare: lane.childEnergyShare,
            mateMin: lane.mateMinEnergy,
            mateCost: lane.mateCost,
            maturityTicks: lane.maturityTicks,
            maxAgeTicks: lane.maxAgeTicks,
            founderEnergy: config.initialEnergy,
            entrantEnergy: config.entrantEnergy === 0 ? config.initialEnergy : config.entrantEnergy,
            childMin: lane.childEnergyMin,
        },
        feed: {
            plantValue: lane.plantFoodValue,
            meatValue: lane.meatFoodValue,
            handlingTicks: lane.handlingTicks,
            digestTicks: lane.digestTicks,
            satiation: lane.satiationShare,
            foodEnergy: config.foodEnergy,
            foodRadius: config.foodRadius,
        },
    };
}

/**
 * @param {Readonly<Record<string, any>>} config the validated config
 * @param {Record<string, number>} lane the spec's lane bases (a scout's call radius and alarm cost are its body entries, already in them)
 * @returns {Pick<RoleParams, 'call' | 'smoke' | 'repel' | 'heat' | 'repro' | 'feed'>} the call numbers of the lanes, the smoke, repel, heat, life and feeding numbers
 */
function signalsOf(config, lane) {
    return {
        call: {
            radius: lane.callRadius,
            ticks: lane.callTicks,
            threshold: lane.alarmThreshold,
            cost: lane.alarmCost,
        },
        smoke: {
            radius: lane.smokeRadius,
            ticks: lane.smokeTicks,
            cooldown: lane.smokeCooldown,
            cost: lane.smokeCost,
            threshold: lane.smokeThreshold,
            decoy: config.smokeDecoyTicks,
        },
        repel: {
            energy: lane.defenderRepelEnergy,
            cost: lane.defenderRepelCost,
            impulse: lane.defenderRepelImpulse,
        },
        ...lifeNumbers(config, lane),
    };
}
