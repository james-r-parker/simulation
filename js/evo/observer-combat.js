// The observer's combat state: bite episodes on prey, hunter agent-ticks, pack kills, and the alarm and smoke
// follow-ups. `observeCombat` runs at the top of `observe`, before the observer reassigns slots, so a killer or a
// victim is still found by its genome id. It reads the world and draws nothing.

import { DEATH_CAUSE, EVENT_STRIDE, EVENT_TYPE } from '../sim/events.js';
import { hunterTable, SPEC_RADIX } from './hunter-table.js';
import { createAlarmFollow, noteAlarm, resolveAlarms } from './observer-alarm.js';
import { BITTEN_THIS_TICK, noteEscape } from './observer-intent-episode.js';
import { createSmokeFollow, noteSmokeRelease, resolveSmoke } from './observer-smoke.js';

export { ALARM_RESPONSE_TICKS } from './observer-alarm.js';

/** Ticks after an episode's last bite at which the victim's survival is read. */
export const ESCAPE_TICKS = 300;

/** The `knownAgents` and `diedAt` maps are pruned when `world.tick` divides by this. */
export const PRUNE_TICKS = 256;

/** What `killKind` returns: not a hunter's kill, a hunter's kill, a kill by two hunters of one lineage. */
export const KILL = Object.freeze({ NONE: 0, HUNT: 1, PACK: 2 });

/**
 * @param {Readonly<Record<string, any>>} config the world's config
 * @returns {Record<string, any>} fresh combat counters, all zero
 */
export function createCombatCounters(config) {
    const n = config.maxAgents;
    const hunterSpec = hunterTable(config);
    return {
        hunterSpec,
        packWindow: config.packWindow,
        knownAgents: new Map(),
        diedAt: new Map(),
        episodeOpen: new Uint8Array(n),
        episodeGenome: new Uint32Array(n),
        episodeLast: new Float64Array(n),
        hunterAgentTicks: 0,
        caughtEpisodes: 0,
        escapedEpisodes: 0,
        eatenDeaths: 0,
        huntKills: 0,
        packKills: 0,
        alarm: createAlarmFollow(config, hunterSpec),
        smoke: createSmokeFollow(),
    };
}

/**
 * Closes the open episode of a slot as caught, or counts a death by eating that had no episode open.
 * @param {Record<string, any>} combat the combat counters
 * @param {number} slot the victim's slot
 * @param {number} genomeId the victim's genome id
 * @param {boolean} eaten whether the death was by eating
 * @returns {void}
 */
function closeEpisode(combat, slot, genomeId, eaten) {
    const open = combat.episodeOpen[slot] === 1 && combat.episodeGenome[slot] === genomeId;
    if (open || eaten) {
        combat.caughtEpisodes += 1;
    }
    combat.episodeOpen[slot] = 0;
}

/**
 * @param {Record<string, any>} combat the combat counters
 * @param {number} genomeId a genome id seen in an event
 * @returns {number} the agent's specialisation, or -1 when the id is unknown
 */
function specOf(combat, genomeId) {
    const packed = combat.knownAgents.get(genomeId);
    return packed === undefined ? -1 : packed % SPEC_RADIX;
}

/**
 * @param {Record<string, any>} combat the combat counters
 * @param {number} genomeId a genome id
 * @returns {boolean} whether the id is a known agent with `canHunt`
 */
function isKnownHunter(combat, genomeId) {
    const spec = specOf(combat, genomeId);
    return spec >= 0 && combat.hunterSpec[spec] === 1;
}

/**
 * @param {Record<string, any>} combat the combat counters
 * @param {number} killer the killer's genome id
 * @param {number} previous the previous biter's genome id, or 0
 * @returns {number} a `KILL` value: a hunter's kill when the killer is a known `canHunt` agent, and a pack kill when
 *   the previous biter is a hunter of the killer's lineage too
 */
export function killKind(combat, killer, previous) {
    if (!isKnownHunter(combat, killer)) {
        return KILL.NONE;
    }
    if (previous !== 0 && isKnownHunter(combat, previous)) {
        const a = combat.knownAgents.get(killer);
        const b = combat.knownAgents.get(previous);
        if (Math.floor(a / SPEC_RADIX) === Math.floor(b / SPEC_RADIX)) {
            return KILL.PACK;
        }
    }
    return KILL.HUNT;
}

/**
 * Counts an eaten death: toward `eaten`, toward the hunters' catches, and toward the pack kills when the killer and
 * the previous biter are hunters of one lineage.
 * @param {Record<string, any>} combat the combat counters
 * @param {Float64Array} d the event data
 * @param {number} o the record offset of the `AgentDied`
 * @returns {void}
 */
function countEaten(combat, d, o) {
    combat.eatenDeaths += 1;
    const kind = killKind(combat, d[o + 5], d[o + 11]);
    combat.huntKills += kind >= KILL.HUNT ? 1 : 0;
    combat.packKills += kind === KILL.PACK ? 1 : 0;
}

/**
 * Handles one `AgentDied`: the eaten-death counts and the victim's episode.
 * @param {Record<string, any>} combat the combat counters
 * @param {Float64Array} d the event data
 * @param {number} o the record offset
 * @param {number} tick the observed tick
 * @returns {void}
 */
function onDeath(combat, d, o, tick) {
    const eaten = d[o + 4] === DEATH_CAUSE.EATEN;
    if (eaten) {
        countEaten(combat, d, o);
    }
    if (combat.hunterSpec[d[o + 6]] === 0) {
        closeEpisode(combat, d[o + 2], d[o + 3], eaten);
    }
    combat.diedAt.set(d[o + 3], tick);
}

/**
 * Dispatches a tick's event records, in ring order.
 * @param {Record<string, any>} combat the combat counters
 * @param {Record<string, any>} world the world after the step
 * @returns {void}
 */
function applyCombatEvents(combat, world) {
    const d = world.events.data;
    const end = world.events.count * EVENT_STRIDE;
    for (let o = 0; o < end; o += EVENT_STRIDE) {
        switch (d[o]) {
            case EVENT_TYPE.AGENT_BORN:
                combat.knownAgents.set(d[o + 3], d[o + 4] * SPEC_RADIX + d[o + 5]);
                break;
            case EVENT_TYPE.AGENT_DIED:
                onDeath(combat, d, o, world.tick);
                break;
            case EVENT_TYPE.ALARM_CALLED:
                noteAlarm(combat.alarm, world, d[o + 2]);
                break;
            case EVENT_TYPE.SMOKE_RELEASED:
                noteSmokeRelease(combat.smoke, world, d[o + 2], d[o + 3]);
                break;
            default:
        }
    }
}

/**
 * Updates the episode of one alive agent that is not a hunter: a fresh bite opens or extends it, and one whose last
 * bite is `ESCAPE_TICKS` old resolves as escaped.
 * @param {Record<string, any>} combat the combat counters
 * @param {Record<string, any>} world the world after the step
 * @param {number} slot an alive slot
 * @param {Record<string, any> | undefined} intent the intent state, told when an episode escapes
 * @returns {void}
 */
function trackEpisode(combat, world, slot, intent) {
    if (world.bittenTimer[slot] === BITTEN_THIS_TICK) {
        combat.episodeOpen[slot] = 1;
        combat.episodeGenome[slot] = world.genomeId[slot];
        combat.episodeLast[slot] = world.tick;
    } else if (combat.episodeOpen[slot] === 1 && world.tick - combat.episodeLast[slot] >= ESCAPE_TICKS) {
        combat.episodeOpen[slot] = 0;
        combat.escapedEpisodes += 1;
        if (intent !== undefined) {
            noteEscape(intent, slot, world);
        }
    }
}

/**
 * Drops the agents that died more than `packWindow` ticks ago from the lookup maps.
 * @param {Record<string, any>} combat the combat counters
 * @param {number} tick the observed tick
 * @returns {void}
 */
function prune(combat, tick) {
    for (const [genomeId, diedTick] of combat.diedAt) {
        if (tick - diedTick > combat.packWindow + 1) {
            combat.diedAt.delete(genomeId);
            combat.knownAgents.delete(genomeId);
        }
    }
}

/**
 * Feeds the combat counters one tick; call it first in `observe`, once after `createWorld` and once after each `step`.
 * @param {Record<string, any>} combat the combat counters
 * @param {Record<string, any>} world the world
 * @param {Record<string, any>} [intent] the intent state; an episode that resolves as escaped is reported to it
 * @returns {void}
 */
export function observeCombat(combat, world, intent) {
    applyCombatEvents(combat, world);
    if (world.tick === 0) {
        return;
    }
    const { alive, spec } = world;
    for (let slot = 0; slot < alive.length; slot++) {
        if (alive[slot] !== 1) {
            continue;
        }
        if (combat.hunterSpec[spec[slot]] === 1) {
            combat.hunterAgentTicks += 1;
        } else {
            trackEpisode(combat, world, slot, intent);
        }
    }
    resolveAlarms(combat.alarm, world);
    resolveSmoke(combat.smoke, world);
    if (world.tick % PRUNE_TICKS === 0) {
        prune(combat, world.tick);
    }
}
