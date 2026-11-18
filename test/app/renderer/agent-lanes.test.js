import { describe, expect, it } from 'vitest';
import { createAgentRig } from '../../../js/app/renderer/agent-rig.js';
import {
    AGENT_LANES,
    AGENT_ROW_FLOATS,
    bucketLanes,
    meshTable,
    RIG_NAMES,
    rigContext,
} from '../../../js/app/renderer/agent-lanes.js';
import { createAgentStore } from '../../../js/app/renderer/agents-pack.js';
import { smallReady } from '../helpers/ready.js';

describe('agent lanes', () => {
    it('names the pose then each rig lane as an instance attribute, four floats apiece', () => {
        expect(AGENT_LANES).toEqual([
            'iPose',
            'iNeon',
            'iRig0',
            'iRig1',
            'iRig2',
            'iGate',
            'iGate2',
            'iAccent',
            'iCall',
            'iDent',
        ]);
        expect(AGENT_ROW_FLOATS).toBe(AGENT_LANES.length * 4);
    });

    it('maps spec indices to meshes', () => {
        expect(meshTable({ specs: [{ index: 2 }, { index: 0 }] })).toEqual([1, -1, 0]);
    });

    it('lists a bucket lanes in attribute order', () => {
        const store = createAgentStore(2, 1, [0], [1]);
        const rig = createAgentRig(2, 1);
        const lanes = bucketLanes(store.buckets[0], rig.arrays[0]);
        expect(lanes).toHaveLength(AGENT_LANES.length);
        expect(lanes[0]).toBe(store.buckets[0].pose);
        RIG_NAMES.forEach((name, k) => expect(lanes[k + 1]).toBe(rig.arrays[0][name]));
    });

    it('builds a rig context holding the cold and heat stress shares', () => {
        const ready = smallReady();
        const ctx = rigContext(ready.info, ready.layout.flags, ready.layout.stateBits);
        expect(ctx.stress.cold01).toBeCloseTo(ready.info.temperatureColdStress / ready.info.temperatureMax);
        expect(ctx.dents).toBeNull();
        expect(ctx.flags).toBe(ready.layout.flags);
    });
});
