// Allocation-free steering, gap queuing and rock/wall collision resolution for herds.

const HERD_AVOID = 40;
const HERD_TURN = 0.05;
const EPSILON = 1e-9;

/** @typedef {import('./world.js').World} World */

/** @param {World} world @param {number} group @param {number} slot @returns {void} */
function setDesiredVelocity(world, group, slot) {
    const { herdRadius, herdWalkSpeed, herdRunSpeed } = world.config;
    const speed = world.groupAlarm[group] > 0 ? herdRunSpeed : herdWalkSpeed;
    let dx = world.herdDesired[2] - world.herdX[slot];
    let dy = world.herdDesired[3] - world.herdY[slot];
    let distance = Math.sqrt(dx * dx + dy * dy);
    if (world.groupAlarm[group] > 0) {
        world.herdDesired[0] = world.groupFleeX[group] * speed;
        world.herdDesired[1] = world.groupFleeY[group] * speed;
    } else {
        world.herdDesired[0] = distance > EPSILON ? (dx / distance) * speed : 0;
        world.herdDesired[1] = distance > EPSILON ? (dy / distance) * speed : 0;
    }
    dx = world.groupCentroidX[group] - world.herdX[slot];
    dy = world.groupCentroidY[group] - world.herdY[slot];
    distance = Math.sqrt(dx * dx + dy * dy);
    if (distance > 4 * herdRadius) {
        world.herdDesired[0] += (dx / distance) * speed;
        world.herdDesired[1] += (dy / distance) * speed;
    }
    world.herdDesired[0] += world.groupFleeX[group] * 0.25;
    world.herdDesired[1] += world.groupFleeY[group] * 0.25;
}

/** @param {World} world @param {number} start @param {number} end @param {number} slot @returns {void} */
function addSeparation(world, start, end, slot) {
    const { herdRadius, herdWalkSpeed } = world.config;
    const reach = 2.2 * herdRadius;
    for (let other = start; other < end; other++) {
        if (other === slot || world.herdAlive[other] !== 1) {
            continue;
        }
        const dx = world.herdX[slot] - world.herdX[other];
        const dy = world.herdY[slot] - world.herdY[other];
        const sq = dx * dx + dy * dy;
        if (sq <= EPSILON || sq >= reach * reach) {
            continue;
        }
        const distance = Math.sqrt(sq);
        const push = (1 - distance / reach) * herdWalkSpeed;
        world.herdDesired[0] += (dx / distance) * push;
        world.herdDesired[1] += (dy / distance) * push;
    }
}

/** @param {World} world @param {number} slot @returns {void} */
function addRockAvoidance(world, slot) {
    const { herdRadius, herdWalkSpeed } = world.config;
    for (let rock = 0; rock < world.obsRadius.length; rock++) {
        const dx = world.herdX[slot] - world.obsX[rock];
        const dy = world.herdY[slot] - world.obsY[rock];
        const distance = Math.sqrt(dx * dx + dy * dy);
        const gap = distance - herdRadius - world.obsRadius[rock];
        if (distance <= EPSILON || gap >= HERD_AVOID) {
            continue;
        }
        const push = (1 - gap / HERD_AVOID) * herdWalkSpeed;
        world.herdDesired[0] += (dx / distance) * push;
        world.herdDesired[1] += (dy / distance) * push;
    }
}

/** @param {World} world @param {number} slot @returns {boolean} */
function isCrossing(world, slot) {
    const targetX = world.herdDesired[2];
    const middle = world.config.worldWidth / 2;
    return (targetX > middle && world.herdX[slot] < middle) || (targetX < middle && world.herdX[slot] > middle);
}

/** @param {World} world @param {number} slot @param {number} start @param {number} end @returns {boolean} */
function hasCloserAnimal(world, slot, start, end) {
    const { worldWidth, herdRadius } = world.config;
    const distance = Math.abs(world.herdX[slot] - worldWidth / 2);
    for (let other = start; other < end; other++) {
        if (other === slot || world.herdAlive[other] !== 1) {
            continue;
        }
        const otherDistance = Math.abs(world.herdX[other] - worldWidth / 2);
        const dx = world.herdX[slot] - world.herdX[other];
        const dy = world.herdY[slot] - world.herdY[other];
        if (otherDistance < distance && dx * dx + dy * dy < 4 * herdRadius * herdRadius) {
            return true;
        }
    }
    return false;
}

/** @param {World} world @param {number} slot @param {number} start @param {number} end @returns {boolean} */
function blockedAtGap(world, slot, start, end) {
    const { worldWidth, herdRadius } = world.config;
    return (
        world.wallGapY.length > 0 &&
        isCrossing(world, slot) &&
        Math.abs(world.herdX[slot] - worldWidth / 2) < 3 * herdRadius &&
        hasCloserAnimal(world, slot, start, end)
    );
}

/** @param {World} world @param {number} slot @returns {void} */
function addWallAvoidance(world, slot) {
    const { herdRadius, herdWalkSpeed, wallGapWidth, worldWidth } = world.config;
    const left = world.herdX[slot] < worldWidth / 2;
    const wallGap = left
        ? worldWidth / 2 - world.herdX[slot] - herdRadius
        : world.herdX[slot] - worldWidth / 2 - herdRadius;
    let nearPassage = false;
    for (let gap = 0; gap < world.wallGapY.length; gap++) {
        const delta = Math.abs(world.wallGapY[gap] - world.herdY[slot]);
        if (delta < wallGapWidth / 2 - herdRadius) {
            nearPassage = true;
            world.herdDesired[1] += Math.sign(world.wallGapY[gap] - world.herdY[slot]) * herdWalkSpeed * 0.5;
            break;
        }
    }
    if (wallGap < HERD_AVOID && !nearPassage) {
        const push = (1 - wallGap / HERD_AVOID) * herdWalkSpeed;
        world.herdDesired[0] += left ? -push : push;
    }
}

/** @param {World} world @param {number} slot @returns {void} */
function moveAnimal(world, slot) {
    let vx = world.herdVx[slot] + (world.herdDesired[0] - world.herdVx[slot]) * HERD_TURN;
    let vy = world.herdVy[slot] + (world.herdDesired[1] - world.herdVy[slot]) * HERD_TURN;
    const speed = Math.sqrt(vx * vx + vy * vy);
    const maxSpeed =
        world.groupAlarm[world.herdGroup[slot]] > 0 ? world.config.herdRunSpeed : world.config.herdWalkSpeed;
    if (speed > maxSpeed) {
        vx *= maxSpeed / speed;
        vy *= maxSpeed / speed;
    }
    world.herdVx[slot] = vx;
    world.herdVy[slot] = vy;
    world.herdX[slot] += vx;
    world.herdY[slot] += vy;
}

/** @param {World} world @param {number} slot @param {number} safeX @param {number} safeY @returns {void} */
function resolveBody(world, slot, safeX, safeY) {
    const radius = world.config.herdRadius;
    world.herdX[slot] = Math.max(radius, Math.min(world.config.worldWidth - radius, world.herdX[slot]));
    world.herdY[slot] = Math.max(radius, Math.min(world.config.worldHeight - radius, world.herdY[slot]));
    // Resolving a later rock can push the body back into an earlier one, so sweep the obstacles more than once.
    // The starting point is known clear; if dense rock clusters still block the projection, stay there safely.
    for (let pass = 0; pass < 4; pass++) {
        let overlap = false;
        for (let rock = 0; rock < world.obsRadius.length; rock++) {
            overlap = projectOutsideRock(world, slot, rock) || overlap;
        }
        if (!overlap) {
            return;
        }
    }
    for (let rock = 0; rock < world.obsRadius.length; rock++) {
        const dx = world.herdX[slot] - world.obsX[rock];
        const dy = world.herdY[slot] - world.obsY[rock];
        const reach = radius + world.obsRadius[rock];
        if (dx * dx + dy * dy < reach * reach) {
            world.herdX[slot] = safeX;
            world.herdY[slot] = safeY;
            world.herdVx[slot] = 0;
            world.herdVy[slot] = 0;
            return;
        }
    }
}

/** @param {World} world @param {number} slot @param {number} rock @returns {boolean} whether projection occurred */
function projectOutsideRock(world, slot, rock) {
    let dx = world.herdX[slot] - world.obsX[rock];
    let dy = world.herdY[slot] - world.obsY[rock];
    const reach = world.config.herdRadius + world.obsRadius[rock];
    const sq = dx * dx + dy * dy;
    if (sq >= reach * reach) {
        return false;
    }
    const distance = sq > EPSILON ? Math.sqrt(sq) : reach;
    if (sq <= EPSILON) {
        dx = world.herdX[slot] < world.config.worldWidth / 2 ? -1 : 1;
        dy = 0;
    } else {
        dx /= distance;
        dy /= distance;
    }
    world.herdX[slot] = world.obsX[rock] + dx * reach;
    world.herdY[slot] = world.obsY[rock] + dy * reach;
    const normal = world.herdVx[slot] * dx + world.herdVy[slot] * dy;
    if (normal < 0) {
        world.herdVx[slot] -= normal * dx;
        world.herdVy[slot] -= normal * dy;
    }
    return true;
}

/** @param {World} world @param {number} group @param {number} targetX @param {number} targetY @returns {void} */
export function steerGroup(world, group, targetX, targetY) {
    const start = group * world.config.herdSize;
    const end = start + world.config.herdSize;
    world.herdDesired[2] = targetX;
    world.herdDesired[3] = targetY;
    for (let slot = start; slot < end; slot++) {
        if (world.herdAlive[slot] !== 1) {
            continue;
        }
        setDesiredVelocity(world, group, slot);
        addSeparation(world, start, end, slot);
        addRockAvoidance(world, slot);
        addWallAvoidance(world, slot);
        if (blockedAtGap(world, slot, start, end)) {
            world.herdDesired[0] = 0;
            world.herdDesired[1] = 0;
        }
        const safeX = world.herdX[slot];
        const safeY = world.herdY[slot];
        moveAnimal(world, slot);
        resolveBody(world, slot, safeX, safeY);
    }
}
