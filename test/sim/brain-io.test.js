import { describe, expect, it } from 'vitest';
import {
    BODY_INPUT,
    BRAIN_IO,
    CH_FOOD,
    CH_KIN,
    CH_MEGAFAUNA,
    CH_OBSTACLE,
    CH_OTHER,
    CH_PREY,
    CH_SMOKE,
    CH_THREAT,
    CH_WALL,
    EXTRA_INPUTS,
    FOOD_HUE_VALUES,
    GENE_OUTPUTS,
    GENE_OUTPUT_COUNT,
    OUTPUT_COUNT,
    OUTPUT_INDEX,
    POOLED_CHANNELS,
    POOLED_VALUES,
    RAY_CHANNELS,
    brainLayout,
    inputOffsets,
} from '../../js/sim/brain-layout.js';
import { createConfig } from '../../js/sim/config.js';
import { inputLabels, outputLabels } from '../../js/evo/brain-labels.js';
import { inspectLabels } from '../../js/worker/inspect.js';

describe('BRAIN_IO', () => {
    it('holds the numbers pooled-v5 pinned before it was a schema', () => {
        expect(RAY_CHANNELS).toBe(10);
        expect([CH_FOOD, CH_THREAT, CH_PREY, CH_OTHER, CH_KIN, CH_WALL, CH_OBSTACLE, CH_SMOKE, CH_MEGAFAUNA]).toEqual([
            1, 2, 3, 4, 5, 6, 7, 8, 9,
        ]);
        expect(POOLED_CHANNELS).toEqual([
            'food',
            'threat',
            'prey',
            'other',
            'kin',
            'wall',
            'obstacle',
            'smoke',
            'megafauna',
        ]);
        expect([POOLED_VALUES, FOOD_HUE_VALUES, EXTRA_INPUTS]).toEqual([56, 2, 36]);
        expect([OUTPUT_COUNT, GENE_OUTPUT_COUNT]).toEqual([11, 10]);
        expect(OUTPUT_INDEX).toEqual({
            THRUST: 0,
            TURN: 1,
            SPRINT: 2,
            MATE: 3,
            BITE: 4,
            ALARM: 5,
            SMOKE: 6,
            HUNT: 7,
            SPLIT: 8,
            MEMORY_A: 9,
            MEMORY_B: 10,
        });
        expect(GENE_OUTPUTS).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 9, 10]);
        expect(BODY_INPUT).toEqual({
            BITTEN: 10,
            SCENT: 17,
            HUNT_SCENT: 21,
            HEARD_ALARM: 24,
            HEARD_HUNT: 27,
            SEX: 30,
            MEMORY_A: 31,
            MEMORY_B: 32,
            REFUGE_BEARING_SIN: 33,
            REFUGE_BEARING_COS: 34,
            REFUGE_NEAR: 35,
        });
    });

    it('puts every keyed body input at the label its offset names', () => {
        const labels = inputLabels();
        const bodyAt = (/** @type {number} */ offset) => labels[POOLED_VALUES + offset];
        expect(bodyAt(BODY_INPUT.BITTEN)).toBe('bitten');
        expect(bodyAt(BODY_INPUT.SCENT)).toBe('danger.left');
        expect(bodyAt(BODY_INPUT.HUNT_SCENT)).toBe('hunt_scent.here');
        expect(bodyAt(BODY_INPUT.HEARD_ALARM)).toBe('heard_alarm.loudness');
        expect(bodyAt(BODY_INPUT.HEARD_HUNT)).toBe('heard_hunt.loudness');
        expect(bodyAt(BODY_INPUT.SEX)).toBe('sex');
        expect(bodyAt(BODY_INPUT.MEMORY_B)).toBe('memory_b');
        expect(bodyAt(BODY_INPUT.REFUGE_NEAR)).toBe('refuge.near');
    });

    it('builds the layout and the offsets from the schema', () => {
        const config = createConfig();
        const layout = brainLayout(config);
        expect(layout.inputCount).toBe(POOLED_VALUES + BRAIN_IO.body.length);
        expect(layout.rawInputCount).toBe(config.rayCount * BRAIN_IO.channels.length + BRAIN_IO.body.length);
        expect(inputLabels()).toHaveLength(layout.inputCount);
        expect(inputOffsets(config).foodHueStart).toBe(POOLED_VALUES - BRAIN_IO.sense[0].labels.length);
        expect(inputOffsets(config).sex).toBe(POOLED_VALUES + BRAIN_IO.body.findIndex((input) => input.key === 'SEX'));
    });

    it('labels the inputs, outputs and inspector from the same entries', () => {
        const labels = inputLabels();
        expect(labels.slice(54, 56)).toEqual(['food.hue0', 'food.hue1']);
        expect(labels.slice(56, 58)).toEqual(['energy', 'vel.forward']);
        expect(outputLabels()).toEqual([
            'thrust',
            'turn',
            'sprint',
            'mate',
            'bite',
            'alarm',
            'smoke',
            'hunt',
            'memory_a',
            'memory_b',
        ]);
        const inspect = inspectLabels();
        expect(inspect.rayChannels).toEqual(BRAIN_IO.channels.map((channel) => channel.display));
        expect(inspect.rayChannels[2]).toBe('can bite me');
        expect(inspect.bodyInputs).toHaveLength(EXTRA_INPUTS);
        expect(inspect.bodyInputs[13]).toEqual({ name: 'temperature', group: 'Temperature' });
        expect(inspect.outputs).toEqual(BRAIN_IO.outputs.map((output) => output.name));
    });

    it('names a threshold key for each call and none for the rest, and no gene for split alone', () => {
        const thresholds = Object.fromEntries(BRAIN_IO.outputs.map((output) => [output.name, output.threshold]));
        expect(thresholds).toMatchObject({
            alarm: 'alarmThreshold',
            hunt: 'huntCallThreshold',
            smoke: 'smokeThreshold',
        });
        expect(BRAIN_IO.outputs.filter((output) => output.threshold === null)).toHaveLength(8);
        expect(BRAIN_IO.outputs.filter((output) => !output.gene).map((output) => output.name)).toEqual(['split']);
        const config = createConfig();
        for (const output of BRAIN_IO.outputs) {
            expect(output.threshold === null || output.threshold in config, output.name).toBe(true);
        }
    });

    it('gives every body input a label, an inspector name and a group, with no label twice', () => {
        for (const input of BRAIN_IO.body) {
            expect([input.label, input.display, input.group].every((text) => text.length > 0)).toBe(true);
        }
        expect(new Set(BRAIN_IO.body.map((input) => input.label)).size).toBe(BRAIN_IO.body.length);
    });
});
