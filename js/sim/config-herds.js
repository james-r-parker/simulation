// The scripted herd config and constraints, kept separate from the shared validator.

import { int, num, positive, UNIT } from './config-rules.js';
import { MAX_EVENTS_PER_SLOT } from './events.js';

export const HERD_DEFAULTS = {
    herdCount: 4,
    herdSize: 8,
    herdRadius: 80,
    herdWalkSpeed: 1.5,
    herdRunSpeed: 6.5,
    herdStartleRadius: 700,
    herdStampedeTicks: 360,
    herdLifeTicks: 144000,
    herdBirthTicks: 12000,
    herdStoreMax: 3000,
    herdCalfEnergy: 500,
    herdBirthEnergy: 1500,
    herdGrazeTicks: 30,
    herdAssimilation: 0.3,
    herdLeaveShare: 0.4,
    herdCarcassTicks: 6000,
    herdStayTicks: 6000,
    trampleDamage: 400,
};

/** Rules for the numeric config values used by scripted herds. */
export const HERD_RULES = {
    herdCount: int(0, 8),
    herdSize: int(1, 32),
    herdRadius: positive(),
    herdWalkSpeed: num(0),
    herdRunSpeed: num(0),
    herdStartleRadius: positive(),
    herdStampedeTicks: int(1),
    herdLifeTicks: int(1),
    herdBirthTicks: int(1),
    herdStoreMax: positive(),
    herdCalfEnergy: positive(),
    herdBirthEnergy: positive(),
    herdGrazeTicks: int(1),
    herdAssimilation: UNIT,
    herdLeaveShare: UNIT,
    herdCarcassTicks: int(1),
    herdStayTicks: int(1),
    trampleDamage: num(0),
};

/** @param {Record<string, any>} config the merged simulation config @returns {void} */
function checkHerdEnergy(config) {
    if (config.herdCalfEnergy > config.herdBirthEnergy || config.herdBirthEnergy > config.herdStoreMax) {
        throw new Error('config.herdBirthEnergy must be at least herdCalfEnergy and at most herdStoreMax');
    }
}

/** @param {Record<string, any>} config the merged simulation config @returns {void} */
function checkEventCapacity(config) {
    const herdMax = config.herdCount * config.herdSize;
    const events =
        MAX_EVENTS_PER_SLOT * config.maxAgents + 2 * config.floraPatchMax + 4 * herdMax + 2 * config.herdCount;
    if (config.eventCapacity < events) {
        throw new Error(
            `eventCapacity: ${config.eventCapacity} is below ${MAX_EVENTS_PER_SLOT} x maxAgents + 2 x floraPatchMax + 4 x herdMax + 2 x herdCount (${events})`,
        );
    }
}

/** @param {Record<string, any>} config the merged simulation config @returns {void} */
function checkPhysicalFits(config) {
    if (config.herdCount === 0) {
        return;
    }
    if (2 * config.herdRadius + 20 > config.wallGapWidth) {
        throw new Error(
            `config.herdRadius ${config.herdRadius} leaves no room through wallGapWidth ${config.wallGapWidth}`,
        );
    }
    if (config.refugeCount > 0 && config.herdRadius <= config.refugeSizeMax) {
        throw new Error(`config.herdRadius ${config.herdRadius} must exceed refugeSizeMax ${config.refugeSizeMax}`);
    }
    if (config.herdWalkSpeed > config.herdRunSpeed || config.herdRunSpeed > config.maxVelocity) {
        throw new Error('config.herd speeds must satisfy herdWalkSpeed <= herdRunSpeed <= maxVelocity');
    }
    if (config.herdRadius >= config.hashCellSize) {
        throw new Error(`config.hashCellSize ${config.hashCellSize} must exceed herdRadius ${config.herdRadius}`);
    }
}

/**
 * Checks that active herd bodies fit the world and that the tick event ring covers the worst-case burst.
 * @param {Record<string, any>} config the merged simulation config
 * @returns {void}
 */
export function checkHerds(config) {
    checkHerdEnergy(config);
    checkEventCapacity(config);
    checkPhysicalFits(config);
}
