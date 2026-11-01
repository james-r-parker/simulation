import { describe, expect, it } from 'vitest';
import { createObserver } from '../../js/evo/observer.js';
import { EXTRA_INPUTS, OUTPUT_COUNT, RAY_CHANNELS } from '../../js/sim/brain-layout.js';
import { BORN_CAUSE } from '../../js/sim/events.js';
import { createRng } from '../../js/sim/rng.js';
import { snapshotLayout } from '../../js/sim/snapshot.js';
import { spawnAgent } from '../../js/sim/spawn.js';
import { createGenerations } from '../../js/worker/generation.js';
import {
    INSPECT_COUNTERS,
    INSPECT_HEADER_WORDS,
    inspectLabels,
    workerLayout,
    writeInspect,
} from '../../js/worker/inspect.js';
import { EFFECT_CAPACITY, EFFECT_WORDS } from '../../js/worker/effects.js';
import { smallWorld } from '../sim/helpers/small-world.js';
import { testPolicy } from '../sim/helpers/test-policy.js';

describe('inspectLabels', () => {
    it('names the 10 ray channels, the 33 body inputs and the 11 outputs', () => {
        const labels = inspectLabels();
        expect(labels.rayChannels).toHaveLength(RAY_CHANNELS);
        expect(labels.rayChannels.at(-1)).toBe('megafauna');
        expect(labels.bodyInputs).toHaveLength(EXTRA_INPUTS);
        expect(labels.outputs).toEqual([
            'thrust',
            'turn',
            'sprint',
            'mate',
            'bite',
            'alarm',
            'smoke',
            'hunt',
            'split',
            'memory_a',
            'memory_b',
        ]);
    });

    it('groups the body inputs as the inspector shows them', () => {
        const groups = inspectLabels().bodyInputs.map((input) => input.group);
        expect(groups.filter((g) => g === 'Body')).toHaveLength(9);
        expect(groups.filter((g) => g === 'Senses')).toHaveLength(5);
        expect(groups.filter((g) => g === 'Temperature')).toHaveLength(4);
        expect(groups.filter((g) => g === 'Scent antennae')).toHaveLength(7);
        expect(groups.filter((g) => g === 'Heard calls')).toHaveLength(6);
        expect(groups.filter((g) => g === 'Memory')).toHaveLength(2);
    });

    it('has no season input: the blob is not told the calendar', () => {
        const names = inspectLabels().bodyInputs.map((input) => input.name);
        expect(names.filter((name) => name.startsWith('season'))).toEqual([]);
    });

    it('gives every body input a distinct name', () => {
        const names = inspectLabels().bodyInputs.map((input) => input.name);
        expect(new Set(names).size).toBe(names.length);
    });
});

describe('workerLayout', () => {
    it('places the effects part after the sim parts and the inspect part after the effects', () => {
        const { config } = smallWorld();
        const layout = workerLayout(config);
        expect(layout.simBytes).toBe(snapshotLayout(config).bytes);
        expect(layout.effectsOffset).toBe(layout.simBytes / 4);
        expect(layout.effectsWords).toBe(2 + EFFECT_CAPACITY * EFFECT_WORDS);
        expect(layout.inspectOffset).toBe(layout.effectsOffset + layout.effectsWords);
        const inputs = config.rayCount * RAY_CHANNELS + EXTRA_INPUTS;
        expect(layout.inspectWords).toBe(INSPECT_HEADER_WORDS + inputs + config.brainHidden + OUTPUT_COUNT + 16);
        expect(layout.bytes).toBe((layout.inspectOffset + layout.inspectWords) * 4);
    });

    it('keeps the sim layout fields for the reader', () => {
        const layout = workerLayout(smallWorld().config);
        expect(layout).toMatchObject({ headerWords: 8, agentStride: 12, rayStride: 4, inputCount: 4 * 10 + 33 });
    });
});

describe('writeInspect', () => {
    /**
     * @returns {{world: ReturnType<typeof smallWorld>, source: Record<string, any>, layout: Record<string, number>,
     *   views: {u32: Uint32Array, f32: Float32Array}}} a world with one agent in slot 0, filled rows and counters
     */
    function setup() {
        const world = smallWorld({ maxEnergy: 1000 });
        spawnAgent(world, testPolicy, BORN_CAUSE.INITIAL);
        const slot = 0;
        world.inputs.fill(0.25, 0, world.layout.rawInputCount);
        world.hidden.fill(0.5, 0, world.layout.hidden);
        world.outputs.fill(0.75, 0, 8);
        world.ageTicks[slot] = 33;
        world.energy[slot] = 500;
        world.temperature[slot] = 44;
        world.lastLoss[slot] = 2;
        world.bittenTimer[slot] = 7;
        world.ateTimer[slot] = 8;
        world.vision[slot] = 1.1;
        world.baseSize[slot] = 6;
        world.childShare[slot] = 0.5;
        world.dose[slot] = 0.36;
        const observer = createObserver(world.config, createRng(1));
        observer.foodEnergy[slot] = 11;
        observer.biteEnergy[slot] = 12;
        observer.kills[slot] = 13;
        observer.children[slot] = 14;
        const generations = createGenerations(world.config);
        generations.depth[slot] = 3;
        const policy = { fitness: () => 99 };
        const layout = workerLayout(world.config);
        const buffer = new ArrayBuffer(layout.bytes);
        return {
            world,
            source: { world, observer, policy, generations },
            layout,
            views: { u32: new Uint32Array(buffer), f32: new Float32Array(buffer) },
        };
    }

    it('writes the header, the three rows and the counters in order for a live agent', () => {
        const { world, source, layout, views } = setup();
        const genomeId = world.genomeId[0];
        expect(writeInspect(views, layout, source, { genomeId, slot: 0 })).toBe(true);
        const at = layout.inspectOffset;
        expect(Array.from(views.u32.subarray(at, at + 3))).toEqual([genomeId, 0, 1]);
        const rows = at + INSPECT_HEADER_WORDS;
        expect(views.f32[rows]).toBe(0.25);
        expect(views.f32[rows + layout.inputCount - 1]).toBe(0.25);
        expect(views.f32[rows + layout.inputCount]).toBe(0.5);
        expect(views.f32[rows + layout.inputCount + layout.hidden]).toBe(0.75);
        const counters = rows + layout.inputCount + layout.hidden + layout.outputCount;
        expect(Array.from(views.f32.subarray(counters, counters + 16))).toEqual([
            33,
            0.5,
            44,
            3,
            11,
            12,
            13,
            14,
            99,
            2,
            7,
            8,
            Math.fround(1.1),
            6,
            0.5,
            Math.fround(0.36),
        ]);
        expect(INSPECT_COUNTERS).toHaveLength(16);
    });

    it('writes only the header, with valid 0, once the agent has died', () => {
        const { world, source, layout, views } = setup();
        const genomeId = world.genomeId[0];
        world.alive[0] = 0;
        expect(writeInspect(views, layout, source, { genomeId, slot: 0 })).toBe(false);
        const at = layout.inspectOffset;
        expect(Array.from(views.u32.subarray(at, at + 3))).toEqual([genomeId, 0, 0]);
        expect(views.f32[at + INSPECT_HEADER_WORDS]).toBe(0);
    });

    it('treats a slot taken by another genome as gone, and no selection as invalid', () => {
        const { world, source, layout, views } = setup();
        expect(writeInspect(views, layout, source, { genomeId: world.genomeId[0] + 1, slot: 0 })).toBe(false);
        expect(writeInspect(views, layout, source, null)).toBe(false);
        expect(Array.from(views.u32.subarray(layout.inspectOffset, layout.inspectOffset + 3))).toEqual([0, 0, 0]);
    });

    it('writes a fitness of 0 for a policy without a fitness', () => {
        const { world, source, layout, views } = setup();
        source.policy = {};
        writeInspect(views, layout, source, { genomeId: world.genomeId[0], slot: 0 });
        const counters =
            layout.inspectOffset + INSPECT_HEADER_WORDS + layout.inputCount + layout.hidden + layout.outputCount;
        expect(views.f32[counters + 8]).toBe(0);
    });
});
