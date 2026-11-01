// Finds a clear local seedling centre within the visited patch's basin.
import { detCos, detSin } from './det-math.js';
import { nextFloat } from './rng.js';
import { clearOfObstacles } from './spawn.js';

const TWO_PI = 6.283185307179586;
const ROUND_OFF = 8 * Number.EPSILON;

/**
 * Tries the exact seed distance first, then bounded disc retries; a refusal never falls back globally.
 * @param {import('./world.js').World} world the world
 * @param {number} parent visited patch
 * @returns {boolean} whether world.point contains a clear local seedling centre
 */
export function placeSeed(world, parent) {
    const c = world.config;
    const radius = c.foodPatchRadius;
    const reach = radius * c.seedRadiusScale;
    const cx = world.patchX[parent];
    const cy = world.patchY[parent];
    const half = c.worldWidth / 2;
    const left = cx < half;
    const minX = left ? radius : half + radius;
    const maxX = left ? half - radius : c.worldWidth - radius;
    for (let attempt = 0; attempt < c.placementTries; attempt++) {
        const theta = nextFloat(world.rng.flora) * TWO_PI;
        const unit = nextFloat(world.rng.flora);
        const distance = attempt === 0 ? reach : reach * Math.sqrt(unit);
        const x = Math.min(maxX, Math.max(minX, cx + distance * detCos(theta)));
        const y = Math.min(c.worldHeight - radius, Math.max(radius, cy + distance * detSin(theta)));
        const dx = x - cx;
        const dy = y - cy;
        if (
            minX <= maxX &&
            dx * dx + dy * dy <= reach * reach * (1 + ROUND_OFF) &&
            clearOfObstacles(world, x, y, radius)
        ) {
            world.point[0] = x;
            world.point[1] = y;
            return true;
        }
    }
    return false;
}
