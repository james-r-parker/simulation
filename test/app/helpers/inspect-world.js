// A real worker host run for the inspector tests: a small world stepped a few ticks, one agent selected, and the
// snapshot that carries its inspect part, with the `ready` message that describes it.

import { createHarness, SMALL_CONFIG } from '../../worker/helpers/host-harness.js';

/**
 * @param {{ticks?: number, rays?: boolean}} [options] ticks to run before selecting, and whether the snapshot carries
 *   the ray part
 * @returns {{ready: Record<string, any>, snapshot: {tick: number, u32: Uint32Array, f32: Float32Array}, genomeId: number}}
 *   the ready message, the snapshot after the selection and the selected agent's genome id
 */
export function selectedWorld({ ticks = 6, rays = false } = {}) {
    const h = createHarness();
    h.send({ type: 'init', seed: 5, config: SMALL_CONFIG });
    for (let i = 0; i < 1000 && h.run().world.tick < ticks; i++) {
        h.advance(20);
    }
    h.send({ type: 'pause' });
    h.advance(1);
    const { world } = h.run();
    const genomeId = world.genomeId[world.alive.indexOf(1)];
    h.send({ type: 'select', genomeId });
    if (rays) {
        h.send({ type: 'setLenses', rays: true });
    }
    const last = h.of('snapshot').at(-1);
    const buffer = last.buffer.slice(0);
    return {
        ready: h.of('ready')[0],
        snapshot: { tick: last.tick, u32: new Uint32Array(buffer), f32: new Float32Array(buffer) },
        genomeId,
    };
}
