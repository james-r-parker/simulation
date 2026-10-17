// The intent episode latch of agents without `canHunt`: one per run of bites on an agent. It records whether a threat
// was seen before the first bite and whether the agent responded, and classifies the episode once at
// `episodeFirst + RESPONSE_WINDOW` as unseen, undefended or neither.

import { INTENT_WINDOW, RESPONSE_WINDOW } from './observer-intent-state.js';

/** After a step, `bittenTimer` is 1 exactly when `feed` reset it this tick. */
export const BITTEN_THIS_TICK = 1;

/**
 * Opens an episode on a fresh bite: the threat sighting that counts is the latest one within `INTENT_WINDOW` ticks.
 * @param {Record<string, any>} intent the intent state
 * @param {number} slot an alive slot
 * @param {number} tick the observed tick
 * @returns {void}
 */
function openEpisode(intent, slot, tick) {
    const seen = tick - intent.lastThreat[slot] <= INTENT_WINDOW;
    intent.episodeOpen[slot] = 1;
    intent.episodeClassified[slot] = 0;
    intent.episodeFirst[slot] = tick;
    intent.threatAtFirst[slot] = seen ? 1 : 0;
    intent.episodeBase[slot] = seen ? intent.lastThreat[slot] : tick;
    intent.responded[slot] = 0;
}

/**
 * Counts a finished episode as unseen or undefended; one that was seen and answered counts as neither.
 * @param {Record<string, any>} intent the intent state
 * @param {number} slot an alive slot
 * @returns {void}
 */
function classifyEpisode(intent, slot) {
    const { run } = intent;
    intent.episodeClassified[slot] = 1;
    run.episodesClassified += 1;
    if (intent.threatAtFirst[slot] === 0) {
        intent.unseenBite[slot] += 1;
        run.unseenEpisodes += 1;
    } else if (intent.responded[slot] === 0) {
        intent.undefendedBite[slot] += 1;
        run.undefendedEpisodes += 1;
    }
}

/**
 * Advances the latch of one alive agent that is not a hunter, after its sightings and last response are current.
 * @param {Record<string, any>} intent the intent state
 * @param {Record<string, any>} world the world after the step
 * @param {number} slot an alive slot
 * @returns {void}
 */
export function trackIntentEpisode(intent, world, slot) {
    const { tick } = world;
    if (intent.episodeOpen[slot] === 0) {
        if (world.bittenTimer[slot] !== BITTEN_THIS_TICK) {
            return;
        }
        openEpisode(intent, slot, tick);
    }
    if (intent.episodeClassified[slot] === 1) {
        return;
    }
    const due = intent.episodeFirst[slot] + RESPONSE_WINDOW;
    if (tick <= due && intent.lastResponse[slot] >= intent.episodeBase[slot]) {
        intent.responded[slot] = 1;
    }
    if (tick >= due) {
        classifyEpisode(intent, slot);
    }
}

/**
 * Ends the open episode of a slot whose bite episode resolved as escaped, crediting `respondedEscape` when it responded.
 * @param {Record<string, any>} intent the intent state
 * @param {number} slot the slot
 * @returns {void}
 */
export function noteEscape(intent, slot) {
    if (intent.episodeOpen[slot] === 0) {
        return;
    }
    if (intent.responded[slot] === 1) {
        intent.respondedEscape[slot] += 1;
        intent.run.escapedResponded += 1;
    }
    intent.episodeOpen[slot] = 0;
}
