import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';
import { createRng, nextFloat } from '../../js/sim/rng.js';
import { buildHunterGrid, createHunterGrid, nearestHunterIn } from '../../js/evo/hunter-grid.js';

/**
 * The scan `nearestHunterIn` replaces: the last hunter, in slot order, among those of another lineage nearest within
 * range.
 * @param {any} world a world-like object
 * @param {number[]} hunters the hunter slots in ascending order
 * @param {number} slot the agent
 * @param {number} vision the range
 * @returns {number}
 */
function naive(world, hunters, slot, vision) {
    let best = -1;
    let bestDistance = vision * vision;
    for (const h of hunters) {
        const dx = world.x[h] - world.x[slot];
        const dy = world.y[h] - world.y[slot];
        const d2 = dx * dx + dy * dy;
        if (h !== slot && world.lineageId[h] !== world.lineageId[slot] && d2 <= bestDistance) {
            best = h;
            bestDistance = d2;
        }
    }
    return best;
}

describe('nearestHunterIn', () => {
    const config = createConfig({ maxAgents: 200 });
    const rng = createRng(7);

    it('matches a scan of every hunter, including points off the map and equal distances', () => {
        const n = 200;
        const world = { x: new Float64Array(n), y: new Float64Array(n), lineageId: new Uint32Array(n) };
        const hunters = new Int32Array(n);
        const list = [];
        for (let s = 0; s < n; s++) {
            const snap = nextFloat(rng) < 0.3;
            world.x[s] = snap
                ? 100 * Math.floor(nextFloat(rng) * 40)
                : nextFloat(rng) * (config.worldWidth + 400) - 200;
            world.y[s] = snap
                ? 100 * Math.floor(nextFloat(rng) * 40)
                : nextFloat(rng) * (config.worldHeight + 400) - 200;
            world.lineageId[s] = 1 + Math.floor(nextFloat(rng) * 3);
            if (s % 3 === 0) {
                hunters[list.length] = s;
                list.push(s);
            }
        }
        const grid = createHunterGrid(config);
        buildHunterGrid(grid, world, hunters, list.length);
        for (let s = 0; s < n; s++) {
            for (const vision of [250, 400]) {
                expect(nearestHunterIn(grid, world, s, vision)).toBe(naive(world, list, s, vision));
            }
        }
    });

    it('finds nothing when there are no hunters', () => {
        const world = { x: new Float64Array(2), y: new Float64Array(2), lineageId: new Uint32Array(2) };
        const grid = createHunterGrid(config);
        buildHunterGrid(grid, world, new Int32Array(2), 0);
        expect(nearestHunterIn(grid, world, 0, 400)).toBe(-1);
    });
});
