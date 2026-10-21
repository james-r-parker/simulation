import { describe, expect, it } from 'vitest';
import { CLASS_CHANNELS, inspectorView, temperatureBand } from '../../../js/app/ui/inspector-data.js';
import { AGENT_FIELD, AGENT_STRIDE, HEADER_WORDS } from '../../../js/app/interpolate.js';
import { createFamilySlots } from '../../../js/app/family-slots.js';
import { selectedWorld } from '../helpers/inspect-world.js';

describe('inspectorView on a real selected agent', () => {
    const { ready, snapshot, genomeId } = selectedWorld();
    const view = inspectorView({ snapshot, ready, slots: createFamilySlots() });

    it('is valid and names the agent', () => {
        expect(view.valid).toBe(true);
        expect(view.header.genomeId).toBe(genomeId);
        expect(ready.info.specs.map((/** @type {any} */ s) => s.name)).toContain(view.header.spec);
        expect(view.header.familyName).toMatch(/^[A-Z][a-z]{5}$/);
        expect(view.header.color).toMatch(/^rgb\(\d+, \d+, \d+\)$/);
        expect(view.header.now).toMatch(
            /^(being bitten|biting|calling the pack|sounding an alarm|eating|pregnant|sprinting|resting|wandering)$/,
        );
    });

    it('groups the body inputs under the six labels, each bar clamped to -1..1', () => {
        expect(view.groups.map((g) => g.name)).toEqual([
            'Body',
            'Senses',
            'Temperature',
            'Scent antennae',
            'Heard calls',
            'Memory',
        ]);
        const bars = view.groups.flatMap((g) => g.bars);
        expect(bars).toHaveLength(ready.layout.inputCount - ready.info.rayCount * 9);
        expect(bars.every((b) => b.value >= -1 && b.value <= 1 && b.label !== '')).toBe(true);
    });

    it('draws one spoke per ray, with a class channel only where the ray saw something', () => {
        expect(view.radar.lengths).toHaveLength(ready.info.rayCount);
        for (let k = 0; k < view.radar.lengths.length; k++) {
            expect(view.radar.channels[k]).toBeGreaterThanOrEqual(-1);
            expect(view.radar.channels[k]).toBeLessThan(CLASS_CHANNELS.length);
        }
    });

    it('lists the hidden layer and the eleven labelled outputs', () => {
        expect(view.hidden).toHaveLength(ready.layout.hidden);
        expect(view.outputs.map((o) => o.label)).toEqual([
            'thrust',
            'turn',
            'sprint',
            'mate',
            'bite',
            'alarm',
            'smoke',
            'hunt call',
            'split',
            'memory A',
            'memory B',
        ]);
    });

    it('lights an output while its action fires', () => {
        for (const o of view.outputs) {
            if (o.label !== 'smoke') {
                expect(o.firing).toBe(o.value > 0);
            }
        }
    });

    it('lists the counters as text', () => {
        expect(view.counters.map((c) => c.label)).toEqual([
            'type',
            'family',
            'generation',
            'age',
            'energy',
            'temperature',
            'food eaten',
            'bite energy taken',
            'kills',
            'children',
            'fitness so far',
        ]);
        expect(view.counters.find((c) => c.label === 'age')?.text).toMatch(/ticks \(.+ seasons\)$/);
        expect(view.counters.find((c) => c.label === 'energy')?.text).toMatch(/^\d+%$/);
    });
});

describe('inspectorView without a selection', () => {
    it('is not valid when the inspect part says the agent is gone', () => {
        const { ready, snapshot } = selectedWorld();
        snapshot.u32[ready.layout.inspectOffset + 2] = 0;
        expect(inspectorView({ snapshot, ready, slots: createFamilySlots() }).valid).toBe(false);
    });

    it('still describes the agent when it is not among the snapshot rows', () => {
        const { ready, snapshot } = selectedWorld();
        snapshot.u32[1] = 0;
        const view = inspectorView({ snapshot, ready, slots: createFamilySlots() });
        expect(view.valid).toBe(true);
    });

    it('is not valid when the snapshot is too short to hold the part', () => {
        const { ready } = selectedWorld();
        const short = { tick: 1, u32: new Uint32Array(8), f32: new Float32Array(8) };
        expect(inspectorView({ snapshot: short, ready, slots: createFamilySlots() }).valid).toBe(false);
    });
});

describe('temperatureBand', () => {
    const info = {
        temperatureColdStress: 10,
        temperatureOptimalMin: 20,
        temperatureOptimalMax: 30,
        temperatureHeatStress: 40,
    };

    it('names the band a temperature is in', () => {
        expect(temperatureBand(5, info)).toBe('cold stress');
        expect(temperatureBand(15, info)).toBe('cool');
        expect(temperatureBand(25, info)).toBe('optimal');
        expect(temperatureBand(35, info)).toBe('warm');
        expect(temperatureBand(45, info)).toBe('heat stress');
    });
});

describe('inspectorView sex and trait rows', () => {
    it('adds a sex row and the trait rows only when the world has them', () => {
        const { ready, snapshot } = selectedWorld();
        const slots = createFamilySlots();
        const labels = (/** @type {any} */ info, /** @type {number} */ flagBits = 0) => {
            for (let i = 0; i < snapshot.u32[1]; i++) {
                snapshot.u32[HEADER_WORDS + i * AGENT_STRIDE + AGENT_FIELD.FLAGS] |= flagBits;
            }
            return inspectorView({ snapshot, ready: { ...ready, info }, slots }).counters;
        };
        expect(labels(ready.info).map((c) => c.label)).not.toContain('sex');
        const on = { ...ready.info, sexesEnabled: true, traitsEnabled: true };
        expect(labels(on).find((c) => c.label === 'sex')?.text).toBe('female');
        expect(labels(on, ready.layout.flags.MALE).find((c) => c.label === 'sex')?.text).toBe('male');
        expect(
            labels(on)
                .slice(-3)
                .map((c) => c.label),
        ).toEqual(['vision', 'size', 'child share']);
    });
});
