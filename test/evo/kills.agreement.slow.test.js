// The sim's `deliberateKills` (js/sim/kills.js) against the observer's `intent.deliberateKills`, the reference, on a replay of
// the predator world: every alive agent the observer tracks has the same count in both, tick by tick.

import { describe, expect, it } from 'vitest';
import { EVENT_STRIDE, EVENT_TYPE } from '../../js/sim/events.js';
import { scaleTimeout } from '../../scripts/lib/test-timeout.mjs';
import { playPredatorWorld } from './helpers/predator-world.js';

const TICKS = 4000;

/**
 * @param {number} seed the world seed
 * @returns {{kills: number, mismatches: string[], events: number, ledger: number, observed: number, positiveKillEnergyWithoutKill: number}}
 *   the kills the sim counted, where it disagreed with the observer, and the kills the events, ledger and observer counted
 */
function replay(seed) {
    let kills = 0;
    let events = 0;
    let retired = 0;
    let positiveKillEnergyWithoutKill = 0;
    /** @type {string[]} */
    const mismatches = [];
    const run = playPredatorWorld(seed, TICKS, {
        onTick: (world, observer) => {
            const d = world.events.data;
            for (let i = 0; i < world.events.count; i++) {
                events += d[i * EVENT_STRIDE] === EVENT_TYPE.HUNTER_KILL ? 1 : 0;
                // A HunterLedger record holds `(kills * 8 + cause) * 8 + source` of a hunter that died.
                if (d[i * EVENT_STRIDE] === EVENT_TYPE.HUNTER_LEDGER) {
                    const offset = i * EVENT_STRIDE;
                    const ledgerKills = Math.floor(d[offset + 4] / 64);
                    retired += ledgerKills;
                    if (d[offset + 9] > 0 && ledgerKills === 0) {
                        positiveKillEnergyWithoutKill += 1;
                    }
                }
            }
            let total = 0;
            for (let slot = 0; slot < world.alive.length; slot++) {
                if (world.alive[slot] === 1 && observer.genomeId[slot] === world.genomeId[slot]) {
                    total += world.deliberateKills[slot];
                    if (world.deliberateKills[slot] !== observer.intent.deliberateKills[slot]) {
                        mismatches.push(
                            `tick ${world.tick} slot ${slot}: sim ${world.deliberateKills[slot]} observer ${observer.intent.deliberateKills[slot]}`,
                        );
                    }
                }
            }
            kills = Math.max(kills, total);
        },
    });
    // One kill rule: the ledger (dead hunters' records plus the living hunters' counts), the HunterKill events and the
    // observer's deliberate hunt kills count the same kills.
    const { world, observer } = run;
    let living = 0;
    for (let slot = 0; slot < world.alive.length; slot++) {
        living += world.alive[slot] === 1 ? world.ledgerKills[slot] : 0;
    }
    return {
        kills,
        mismatches,
        events,
        ledger: retired + living,
        observed: observer.intent.run.huntKillsDeliberate,
        positiveKillEnergyWithoutKill,
    };
}

describe('deliberateKills against the observer', () => {
    it(
        'agrees with intent.deliberateKills for every tracked agent on a replay with kills',
        () => {
            let kills = 0;
            let named = 0;
            for (const seed of [1, 2]) {
                const result = replay(seed);
                expect(result.mismatches.slice(0, 5), `seed ${seed}`).toEqual([]);
                kills += result.kills;
                named += result.events;
                expect(result.ledger, `seed ${seed} ledger`).toBe(result.events);
                expect(result.observed, `seed ${seed} observer`).toBe(result.events);
                expect(result.positiveKillEnergyWithoutKill, `seed ${seed} kill energy`).toBe(0);
            }
            expect(kills).toBeGreaterThan(0);
            expect(named).toBeGreaterThan(0);
        },
        scaleTimeout(120_000),
    );
});
