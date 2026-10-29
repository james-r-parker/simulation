// Niche replacement: eight agents in three descriptor cells, the single-agent cell being the rarest quarter.

import { describe, expect, it } from 'vitest';
import { computeMetrics } from '../../js/evo/metrics.js';
import { checkpointNiche, noteNicheMatured } from '../../js/evo/scene-niche.js';
import { addBlob } from '../sim/helpers/life-world.js';
import { observed } from './helpers/observer-world.js';

const T0 = 10000;

const read = (/** @type {any} */ r) => computeMetrics(r.observer, r.world)['eval.niche_replacement'];

/** Eight agents: lineages 1-4 at skill 0.05, 5-7 at skill 0.55, 8 alone at skill 0.95. */
function crowd() {
    const r = observed({ maxAgents: 16 });
    const skills = [0.05, 0.05, 0.05, 0.05, 0.55, 0.55, 0.55, 0.95];
    skills.forEach((skill, i) => {
        const slot = addBlob(r.world, { lineageId: i + 1 });
        r.observer.intent.deliberateFood[slot] = skill * 100;
        r.observer.intent.chanceFood[slot] = (1 - skill) * 100;
    });
    return r;
}

describe('eval.niche_replacement', () => {
    it('is the share of rarest-quarter lineages with a matured child by the next checkpoint', () => {
        const r = crowd();
        const scene = r.observer.scenes.niche;
        r.world.tick = T0;
        checkpointNiche(scene, r.observer, r.world);
        expect(Array.from(scene.rare)).toEqual([8]);
        expect(read(r).value).toBeNull();
        // A child of the rare lineage matures; so does one of a common lineage, which is not followed.
        const rareChild = addBlob(r.world, { lineageId: 8 });
        const commonChild = addBlob(r.world, { lineageId: 5 });
        r.observer.parentGenomeA[rareChild] = 1;
        r.observer.parentGenomeA[commonChild] = 1;
        noteNicheMatured(scene, r.observer, r.world, rareChild);
        noteNicheMatured(scene, r.observer, r.world, commonChild);
        r.world.tick = T0 + 1000;
        checkpointNiche(scene, r.observer, r.world);
        expect(read(r).value).toBe(1);
        r.world.tick = T0 + 2000;
        checkpointNiche(scene, r.observer, r.world);
        expect(read(r).value).toBe(0.5);
    });

    it('does not count a matured agent with no parents', () => {
        const r = crowd();
        const scene = r.observer.scenes.niche;
        r.world.tick = T0;
        checkpointNiche(scene, r.observer, r.world);
        const immigrant = addBlob(r.world, { lineageId: 8 });
        noteNicheMatured(scene, r.observer, r.world, immigrant);
        r.world.tick = T0 + 1000;
        checkpointNiche(scene, r.observer, r.world);
        expect(read(r).value).toBe(0);
    });

    it('rounds the rarest quarter up, so four cells give one', () => {
        const r = observed({ maxAgents: 16 });
        [0.05, 0.25, 0.55, 0.95].forEach((skill, i) => {
            const slot = addBlob(r.world, { lineageId: i + 1 });
            r.observer.intent.deliberateFood[slot] = skill * 100;
            r.observer.intent.chanceFood[slot] = (1 - skill) * 100;
        });
        r.world.tick = T0;
        checkpointNiche(r.observer.scenes.niche, r.observer, r.world);
        expect(r.observer.scenes.niche.rare.size).toBe(1);
        expect(Array.from(r.observer.scenes.niche.rare)).toEqual([1]);
    });
});
