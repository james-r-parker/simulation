import { describe, expect, it } from 'vitest';
import { createCameraController } from '../../js/app/camera.js';
import { agentAt } from '../../js/app/hover-pick.js';
import { createInterpolated, interpolateInto } from '../../js/app/interpolate.js';
import { makeSnapshot } from './helpers/snapshots.js';

describe('agentAt', () => {
    const camera = createCameraController({ canvas: { width: 200, height: 100 }, world: { width: 200, height: 100 } });
    const agents = createInterpolated(4);
    interpolateInto(
        null,
        makeSnapshot(1, [
            { slot: 0, genomeId: 11, x: 100, y: 50, size: 10, spec: 0 },
            { slot: 1, genomeId: 22, x: 20, y: 20, size: 1, spec: 1 },
        ]),
        1,
        agents,
    );
    const view = { agents, camera, minPx: [16, 12] };

    it('finds the agent under a device point, as an index into the agents', () => {
        const hit = agentAt(view, { x: 100, y: 50 });
        expect(hit?.index).toBe(0);
        expect(hit?.agents).toBe(agents);
    });

    it('finds a small agent through its widened drawn radius', () => {
        const z = camera.zoom;
        expect(agentAt(view, { x: 100 + (20 + 9 - 100) * z, y: 50 - (20 - 50) * z })?.index).toBe(1);
    });

    it('returns null over empty space', () => {
        expect(agentAt(view, { x: 190, y: 90 })).toBeNull();
    });
});
