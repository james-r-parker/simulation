import { describe, expect, it } from 'vitest';
import { DEATH_CAUSE, EVENT_TYPE, pushEvent } from '../../js/sim/events.js';
import { BURN_IN_TICKS } from '../../js/evo/burn-in.js';
import {
    createDiseaseScene,
    diseaseMetrics,
    MIN_SLOPE_POINTS,
    noteDiseaseEvents,
    sampleDiseaseFamilies,
} from '../../js/evo/scene-disease.js';
import { addBlob, lifeWorld } from '../sim/helpers/life-world.js';

/**
 * @param {Record<string, any>} [over] config overrides
 * @returns {any} a world with the contagion on
 */
function world(over = {}) {
    return lifeWorld({ diseaseSeedRate: 0.01, diseaseMinHosts: 1, maxAgents: 8, ...over });
}

/**
 * Pushes one event with its fields after the tick.
 * @param {any} w the world
 * @param {number} type the event type
 * @param {number[]} fields the fields from offset 2
 * @returns {void}
 */
function push(w, type, fields) {
    const o = pushEvent(w.events, type, w.tick);
    w.events.data.set(fields, o + 2);
}

/**
 * Gives a slot a weight row far from the zero row, so it founds its own family.
 * @param {any} w the world
 * @param {number} slot the slot
 * @param {number} value the weight value
 * @returns {void}
 */
function family(w, slot, value) {
    const n = w.layout.weightCount;
    w.weights.fill(value, slot * n, slot * n + w.layout.traitStart);
}

describe('diseaseMetrics', () => {
    it('is null with reason disease-off while diseaseSeedRate is 0', () => {
        const scene = createDiseaseScene(world({ diseaseSeedRate: 0 }).config);
        for (const result of Object.values(diseaseMetrics(scene))) {
            expect(result).toEqual({ value: null, reason: 'disease-off' });
        }
    });

    it('gives null reasons with no deaths, no passed-on infections and too few points', () => {
        const w = world();
        const scene = createDiseaseScene(w.config);
        const m = diseaseMetrics(scene);
        expect(m['eval.disease_deaths_share'].reason).toBe('no-deaths');
        expect(m['eval.strains_per_100k'].reason).toBe('no-ticks');
        expect(m['eval.strain_family_focus'].reason).toBe('no-infections');
        expect(m['eval.disease_frequency_slope'].reason).toBe('few-points');
    });

    it('counts disease deaths after burn-in, strains per 100k ticks and the in-family share of passed infections', () => {
        const w = world();
        const scene = createDiseaseScene(w.config);
        w.tick = BURN_IN_TICKS + 10;
        push(w, EVENT_TYPE.STRAIN_EMERGED, [0, 1, 11, 11]);
        push(w, EVENT_TYPE.AGENT_INFECTED, [1, 11, 0, 0]);
        push(w, EVENT_TYPE.AGENT_INFECTED, [2, 12, 0, 0.2]);
        push(w, EVENT_TYPE.AGENT_INFECTED, [3, 13, 0, 0.6]);
        push(w, EVENT_TYPE.AGENT_INFECTED, [4, 14, 0, 0.3]);
        push(w, EVENT_TYPE.AGENT_DIED, [5, 15, DEATH_CAUSE.DISEASE]);
        push(w, EVENT_TYPE.AGENT_DIED, [6, 16, DEATH_CAUSE.STARVED]);
        noteDiseaseEvents(scene, w);
        const m = diseaseMetrics(scene);
        expect(m['eval.disease_deaths_share'].value).toBe(0.5);
        expect(m['eval.strains_per_100k'].value).toBeCloseTo(100000 / w.tick);
        expect(m['eval.strain_family_focus'].value).toBeCloseTo(2 / 3);
    });

    it('ignores deaths during burn-in', () => {
        const w = world();
        const scene = createDiseaseScene(w.config);
        w.tick = 5;
        push(w, EVENT_TYPE.AGENT_DIED, [5, 15, DEATH_CAUSE.DISEASE]);
        noteDiseaseEvents(scene, w);
        expect(diseaseMetrics(scene)['eval.disease_deaths_share'].reason).toBe('no-deaths');
    });
});

describe('the scene while the contagion is off', () => {
    it('reads no events and samples no families', () => {
        const w = world({ diseaseSeedRate: 0 });
        addBlob(w);
        const scene = createDiseaseScene(w.config);
        push(w, EVENT_TYPE.STRAIN_EMERGED, [0, 0, 1, 1]);
        noteDiseaseEvents(scene, w);
        sampleDiseaseFamilies(scene, w);
        expect(scene.strains).toBe(0);
        expect(scene.alive).toBe(0);
    });
});

describe('eval.disease_frequency_slope', () => {
    it('is null with few-points when every family has the same share, so x has no spread', () => {
        const w = world();
        addBlob(w);
        const scene = createDiseaseScene(w.config);
        for (let window = 0; window <= MIN_SLOPE_POINTS; window++) {
            sampleDiseaseFamilies(scene, w);
        }
        expect(diseaseMetrics(scene)['eval.disease_frequency_slope']).toEqual({ value: null, reason: 'few-points' });
    });

    /**
     * Builds 5 agents in two families (4 clones, 1 stranger), checkpoints, infects `common` members of the big family
     * and `rare` of the small one, and repeats for `windows` windows.
     * @param {number} common infections in the big family per window
     * @param {number} rare infections in the small family per window
     * @returns {import('../../js/evo/metrics-stats.js').MetricResult} the slope
     */
    function slopeFor(common, rare) {
        const w = world();
        for (let i = 0; i < 5; i++) {
            addBlob(w);
        }
        family(w, 4, 10);
        const scene = createDiseaseScene(w.config);
        for (let window = 0; window <= MIN_SLOPE_POINTS / 2; window++) {
            sampleDiseaseFamilies(scene, w);
            w.events.count = 0;
            for (let k = 0; k < common; k++) {
                push(w, EVENT_TYPE.AGENT_INFECTED, [k, w.genomeId[k], 0, 0]);
            }
            for (let k = 0; k < rare; k++) {
                push(w, EVENT_TYPE.AGENT_INFECTED, [4, w.genomeId[4], 0, 0]);
            }
            noteDiseaseEvents(scene, w);
        }
        return diseaseMetrics(scene)['eval.disease_frequency_slope'];
    }

    it('is positive when the common family is infected more per head', () => {
        expect(slopeFor(4, 0).value).toBeGreaterThan(0);
    });

    it('is negative when the rare family is infected more per head', () => {
        expect(slopeFor(0, 1).value).toBeLessThan(0);
    });

    it('does not credit an infection to a family when the slot holds a different genome than at the checkpoint', () => {
        const w = world();
        addBlob(w);
        const scene = createDiseaseScene(w.config);
        sampleDiseaseFamilies(scene, w);
        push(w, EVENT_TYPE.AGENT_INFECTED, [0, w.genomeId[0] + 99, 0, 0]);
        noteDiseaseEvents(scene, w);
        expect(scene.hits[0]).toBe(0);
    });
});
