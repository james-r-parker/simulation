import { describe, expect, it } from 'vitest';
import { BODY_INPUT, OUTPUT_COUNT, OUTPUT_INDEX, RAY_CHANNELS } from '../../js/sim/brain-layout.js';
import { FLORA_DEFAULTS } from '../../js/sim/config-flora.js';
import { INPUT_READER, readerSubject } from '../../js/evo/lesson-reference.js';
import { REFERENCES, referenceSubject } from '../../js/evo/memory-probe-references.js';
import { stageWorld } from '../../js/evo/pool-discrimination-stage.js';
import { CH_FOOD, CH_PREY, CH_THREAT } from '../../js/evo/scripted-parts.js';

/**
 * Runs the reader once on a staged agent whose rays are set by hand.
 * @param {{ray?: number, channel?: number, hue?: number, body?: Record<number, number>, also?: {ray: number, proximity: number}[]}} senses a hit on one ray (proximity
 *   0.8 in the channel, the food hue on it) and body inputs by offset
 * @returns {Float32Array} the agent's outputs
 */
function outputsFor({ ray = 0, channel = 0, hue = 0, body = {}, also = [] }) {
    const { world } = stageWorld({
        foods: [],
        rocks: [],
        agents: [{ x: 1500, y: 2000, angle: 0, spec: 0, energy: 800 }],
        seed: 1,
    });
    world.inputs.fill(0);
    if (channel > 0) {
        world.inputs[ray * RAY_CHANNELS] = 0.8;
        world.inputs[ray * RAY_CHANNELS + channel] = 1;
        world.rayHue[ray] = hue;
    }
    for (const { ray: other, proximity } of also) {
        world.inputs[other * RAY_CHANNELS] = proximity;
        world.inputs[other * RAY_CHANNELS + channel] = 1;
        world.rayHue[other] = hue;
    }
    for (const [offset, value] of Object.entries(body)) {
        world.inputs[world.config.rayCount * RAY_CHANNELS + Number(offset)] = value;
    }
    readerSubject().act?.(world);
    return world.outputs.slice(0, OUTPUT_COUNT);
}

describe('the input reader', () => {
    it('is reachable through referenceSubject without joining the memory probe references', () => {
        expect(referenceSubject(INPUT_READER).name).toBe('input-reader');
        expect(REFERENCES).not.toContain(INPUT_READER);
        expect(referenceSubject(INPUT_READER).spec).toBeNull();
    });

    it('seeks a safe food and bites, and ignores a food of the toxic hue', () => {
        const safe = outputsFor({ ray: 1, channel: CH_FOOD, hue: FLORA_DEFAULTS.grass.hue });
        expect(safe[OUTPUT_INDEX.BITE]).toBe(1);
        expect(safe[OUTPUT_INDEX.TURN]).not.toBe(0);
        const toxic = outputsFor({ ray: 1, channel: CH_FOOD, hue: FLORA_DEFAULTS.toxiccap.hue });
        expect(toxic[OUTPUT_INDEX.BITE]).toBe(0);
        expect(toxic[OUTPUT_INDEX.THRUST]).toBe(0);
        expect(toxic[OUTPUT_INDEX.TURN]).toBe(1);
    });

    it('sprints and bites at prey and sprints away from a threat', () => {
        const prey = outputsFor({ ray: 1, channel: CH_PREY });
        expect(prey[OUTPUT_INDEX.SPRINT]).toBe(1);
        expect(prey[OUTPUT_INDEX.BITE]).toBe(1);
        const threat = outputsFor({ ray: 1, channel: CH_THREAT });
        expect(threat[OUTPUT_INDEX.SPRINT]).toBe(1);
        expect(threat[OUTPUT_INDEX.BITE]).toBe(0);
        expect(Math.sign(threat[OUTPUT_INDEX.TURN])).toBe(-Math.sign(prey[OUTPUT_INDEX.TURN]));
    });

    it('flees to the refuge when the body inputs name one', () => {
        const body = {
            [BODY_INPUT.REFUGE_NEAR]: 0.5,
            [BODY_INPUT.REFUGE_BEARING_SIN]: -0.5,
            [BODY_INPUT.REFUGE_BEARING_COS]: 0.8,
        };
        const out = outputsFor({ ray: 8, channel: CH_THREAT, body });
        expect(out[OUTPUT_INDEX.TURN]).toBeLessThan(0);
    });

    it('turns full to the side of a refuge behind it, and to the positive side when it is dead behind', () => {
        const behind = (/** @type {number} */ sin) => ({
            [BODY_INPUT.REFUGE_NEAR]: 0.5,
            [BODY_INPUT.REFUGE_BEARING_SIN]: sin,
            [BODY_INPUT.REFUGE_BEARING_COS]: -0.9,
        });
        expect(outputsFor({ ray: 8, channel: CH_THREAT, body: behind(-0.2) })[OUTPUT_INDEX.TURN]).toBe(-1);
        expect(outputsFor({ ray: 8, channel: CH_THREAT, body: behind(0.2) })[OUTPUT_INDEX.TURN]).toBe(1);
        expect(outputsFor({ ray: 8, channel: CH_THREAT, body: behind(0) })[OUTPUT_INDEX.TURN]).toBe(1);
    });

    it('seeks the nearest of several safe foods, whichever ray it is on', () => {
        const turnAt = (/** @type {number} */ ray) => outputsFor({ ray, channel: CH_FOOD })[OUTPUT_INDEX.TURN];
        const earlierNearer = outputsFor({ ray: 2, channel: CH_FOOD, also: [{ ray: 14, proximity: 0.5 }] });
        const laterNearer = outputsFor({ ray: 2, channel: CH_FOOD, also: [{ ray: 14, proximity: 0.95 }] });
        expect(earlierNearer[OUTPUT_INDEX.TURN]).toBeCloseTo(turnAt(2), 6);
        expect(laterNearer[OUTPUT_INDEX.TURN]).toBeCloseTo(turnAt(14), 6);
        expect(turnAt(2)).not.toBeCloseTo(turnAt(14), 3);
    });

    it('scans in place when it senses nothing', () => {
        const out = outputsFor({});
        expect(out[OUTPUT_INDEX.THRUST]).toBe(0);
        expect(out[OUTPUT_INDEX.TURN]).toBe(1);
    });
});
