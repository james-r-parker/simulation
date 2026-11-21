// Shared fixtures of the director tests: the canvas, the world, the sim info and layout, two agents and a sustained chase.

export const CANVAS = Object.freeze({ width: 3840, height: 2160 });
export const WORLD = Object.freeze({ width: 14400, height: 8100 });
export const INFO = Object.freeze({
    worldWidth: 14400,
    worldHeight: 8100,
    ticksPerSecond: 60,
    biteArc: Math.PI / 3,
    maxVelocity: 8,
    specs: [
        { index: 0, name: 'forager', canHunt: false },
        { index: 1, name: 'predator', canHunt: true },
    ],
});
export const LAYOUT = Object.freeze({
    flags: { HUNTING: 1 << 16 },
    effectKinds: { BORN: 1, DIED: 2, BITE: 3, ALARM: 4, PACK_CALL: 5, SMOKE: 6, ESCAPED: 7 },
    deathCauses: { EATEN: 1 },
});

export const SAMPLE_AGENTS = Object.freeze([
    { genomeId: 1, lineageId: 10, spec: 0, x: 3000, y: 2000, angle: 0, size: 12, speed: 4, flags: 0 },
    { genomeId: 2, lineageId: 20, spec: 1, x: 7000, y: 4000, angle: 0, size: 18, speed: 5, flags: 0 },
]);

/**
 * Builds a sustained chase pair (hunter 200 units behind its prey, aimed at it, within 2.5 hunter sizes) at `xOffset`.
 * @param {number} [xOffset] horizontal offset for the current snapshot
 * @returns {import('../../../js/app/director/moments.js').AgentRecord[]} hunter-prey pair
 */
export function makeChasePair(xOffset = 0) {
    return [
        {
            genomeId: 10,
            lineageId: 1,
            spec: 1,
            x: 4100 + xOffset,
            y: 3000,
            angle: 0,
            size: 90,
            speed: 9,
            flags: 1 << 16,
        },
        {
            genomeId: 11,
            lineageId: 2,
            spec: 0,
            x: 4300 + xOffset,
            y: 3000,
            angle: 0,
            size: 12,
            speed: 9,
            flags: 0,
        },
    ];
}

export const EARLIER_CHASE = Object.freeze([
    { genomeId: 10, lineageId: 1, spec: 1, x: 4000, y: 3000, angle: 0, size: 90, speed: 9, flags: 1 << 16 },
    { genomeId: 11, lineageId: 2, spec: 0, x: 4300, y: 3000, angle: 0, size: 12, speed: 9, flags: 0 },
]);
