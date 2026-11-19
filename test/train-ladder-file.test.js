// The committed stage ladder (docs/designs/training-stages.md, Stage ladder): `evals/train-ladder.json` and the stage
// configs under `evals/stages/` load, build into valid configs and agree with the table of the design doc.

import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { planRun, validateStageFloors } from '../js/evo/curriculum.js';
import { createConfig } from '../js/sim/config.js';
import { loadStages } from '../scripts/lib/train-state.mjs';

/** @param {string} path a repo-relative JSON file @returns {any} its contents */
const readJson = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));

const LADDER = readJson('evals/train-ladder.json');
const ORDER = ['nursery', 'hunt-contact', 'hunt-weak', 'hunt-mid', 'hunt', 'evade', 'arms-race', 'habitat', 'world'];

describe('evals/train-ladder.json', () => {
    it('lists the stages of the design doc in order, the world last', () => {
        expect(LADDER.map((/** @type {any} */ e) => e.name)).toEqual(ORDER);
        expect(LADDER.at(-1).config).toBeNull();
        expect(LADDER.at(-1).gate).toBeUndefined();
    });

    it('is a valid gated curriculum whose floors the validator accepts', () => {
        expect(() => planRun(LADDER, 0)).not.toThrow();
        expect(() =>
            validateStageFloors(LADDER, {
                overridesOf: (config) => readJson(config),
                targetMinAgents: createConfig({}).minAgents,
            }),
        ).not.toThrow();
    });

    it('leaves `pack` out (its gate has no valid reference) and gives every gated stage its limits', () => {
        const gated = LADDER.filter((/** @type {any} */ e) => e.gate !== undefined);
        expect(gated.map((/** @type {any} */ e) => e.name)).toEqual(ORDER.slice(0, -1));
        expect(LADDER.some((/** @type {any} */ e) => e.name === 'pack' || e.optional)).toBe(false);
        for (const entry of gated) {
            expect(entry.minGenerations).toBeLessThanOrEqual(entry.maxGenerations);
        }
    });

    it('gives every gated stage plateauStop 6 (docs/designs/training-loop.md)', () => {
        const gated = LADDER.filter((/** @type {any} */ e) => e.gate !== undefined);
        expect(gated.map((/** @type {any} */ e) => e.plateauStop)).toEqual(gated.map(() => 6));
        expect(
            loadStages(
                /** @type {any} */ ({
                    curriculum: 'evals/train-ladder.json',
                    config: null,
                    until: null,
                    generations: 2,
                    checkpointEvery: 1,
                }),
            )[4].plateauStop,
        ).toBe(6);
    });

    it('gives the arms-race and evade stages the pool shares of the doc', () => {
        const pool = Object.fromEntries(LADDER.map((/** @type {any} */ e) => [e.name, e.pool]));
        expect(pool['evade']).toBe(0.5);
        expect(pool['arms-race']).toBe(0.2);
    });

    it('loads through the trainer with one brain layout across the stages', () => {
        const args = /** @type {any} */ ({
            curriculum: 'evals/train-ladder.json',
            config: null,
            until: null,
            generations: 2,
            checkpointEvery: 1,
        });
        const stages = loadStages(args);
        expect(stages.map((s) => s.name)).toEqual(ORDER);
    });
});

describe('evals/stages', () => {
    const files = readdirSync(new URL('../evals/stages', import.meta.url)).filter((f) => f.endsWith('.json'));

    it('has one file per configured stage', () => {
        const wanted = LADDER.filter((/** @type {any} */ e) => e.config !== null).map(
            (/** @type {any} */ e) => `${e.name}.json`,
        );
        expect([...files].sort()).toEqual([...wanted].sort());
    });

    it.each(files)('%s builds a valid config with no floor', (file) => {
        const config = createConfig(readJson(`evals/stages/${file}`));
        expect(config.minAgents).toBe(0);
    });

    it('slows the four prey specialisations in hunt-contact and not the hunter', () => {
        const config = createConfig(readJson('evals/stages/hunt-contact.json'));
        for (const prey of ['forager', 'reproducer', 'scout', 'defender']) {
            expect(config.specialisations[prey].turnMultiplier).toBe(0.5);
        }
        expect(config.specialisations.predator.turnMultiplier).toBe(
            createConfig({}).specialisations.predator.turnMultiplier,
        );
    });

    it('lays the evade arena at twice the hunt arena with rock rings, and habitat at a quarter of the default world', () => {
        const hunt = createConfig(readJson('evals/stages/hunt.json'));
        const evade = createConfig(readJson('evals/stages/evade.json'));
        expect((evade.worldWidth * evade.worldHeight) / (hunt.worldWidth * hunt.worldHeight)).toBeCloseTo(2, 1);
        expect(evade.refugeCount).toBe(2);
        const habitat = createConfig(readJson('evals/stages/habitat.json'));
        const target = createConfig({});
        expect(habitat.worldWidth * habitat.worldHeight).toBe((target.worldWidth * target.worldHeight) / 4);
        expect(habitat.herdCount).toBeGreaterThan(0);
        expect(habitat.coldMarginWidth).toBeGreaterThan(0);
    });
});

describe('evals/train-ladder-no-mid.json', () => {
    const NO_MID = readJson('evals/train-ladder-no-mid.json');

    it('is the ladder without hunt-mid, so a run that began before the rung resumes under it', () => {
        expect(NO_MID).toEqual(LADDER.filter((/** @type {any} */ e) => e.name !== 'hunt-mid'));
    });

    it('gives the hunt stage 200 generations, the bar unchanged, in both ladders', () => {
        for (const ladder of [LADDER, NO_MID]) {
            const hunt = ladder.find((/** @type {any} */ e) => e.name === 'hunt');
            expect(hunt.maxGenerations).toBe(200);
            const bar = hunt.gate.find((/** @type {any} */ c) => c.read === 'drill.prey-ahead.winShareOverReference');
            expect(bar.min).toBe(0.5);
        }
    });
});
