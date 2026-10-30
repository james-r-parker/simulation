// The per-tick pass of the selection-rule scenes over the alive slots: a child's tenth meal, a child that matures (it
// credits its grandparents and its lineage's rare-niche account), the matings that start this tick, and the 1000-tick
// niche checkpoint. Split from `observer-scenes.js`, which owns the scenes and their events.

import { BURN_IN_TICKS } from './burn-in.js';
import { creditGrandparents, trackHeritage } from './scene-heritage.js';
import { trackMatings } from './scene-mate.js';
import { checkpointNiche, noteNicheMatured } from './scene-niche.js';

const NICHE_CHECKPOINT_TICKS = 1000;

/**
 * Runs the per-tick pass.
 * @param {Record<string, any>} scenes the scenes
 * @param {Record<string, any>} observer the observer, whose slot arrays hold the tracked genomes
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function trackSlots(scenes, observer, world) {
    const { maturityTicks } = world.config;
    const { alive, ageTicks, genomeId } = world;
    for (let slot = 0; slot < alive.length; slot++) {
        if (alive[slot] !== 1) {
            continue;
        }
        trackHeritage(scenes.heritage, world, slot);
        if (maturityTicks > 0 && ageTicks[slot] === maturityTicks && observer.genomeId[slot] === genomeId[slot]) {
            creditGrandparents(scenes.heritage, observer, slot);
            noteNicheMatured(scenes.niche, observer, world, slot);
        }
    }
    trackMatings(scenes.mate, observer, world);
    if (world.tick >= BURN_IN_TICKS && world.tick % NICHE_CHECKPOINT_TICKS === 0) {
        checkpointNiche(scenes.niche, observer, world);
    }
}
