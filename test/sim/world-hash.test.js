import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';
import { createRng, fork, nextFloat } from '../../js/sim/rng.js';
import { allocateWorld } from '../../js/sim/world.js';
import { hashWorld } from '../../js/sim/world-hash.js';

const SMALL = {
    maxAgents: 4,
    rayCount: 2,
    brainHidden: 2,
    initialAgents: 0,
    minAgents: 0,
    initialFood: 0,
    obstacleCount: 2,
};

const STREAMS = ['obstacles', 'spawn', 'brain-init', 'mutation', 'food', 'lifecycle'];

/** Arrays whose every element the hash must cover; `hidden` is limited to its agent rows. */
const COVERED = [
    'alive',
    'spec',
    'x',
    'y',
    'vx',
    'vy',
    'angle',
    'turnRate',
    'size',
    'energy',
    'foodEnergy',
    'biteEnergy',
    'ageTicks',
    'cooldown',
    'pregnancy',
    'ateTimer',
    'bittenTimer',
    'lastLoss',
    'temperature',
    'genomeId',
    'lineageId',
    'parentA',
    'parentB',
    'lastBiter',
    'weights',
    'fatherWeights',
    'fatherId',
    'fatherLineage',
    'lastBiteTick',
    'prevBiter',
    'prevBiteTick',
    'alarmTimer',
    'huntTimer',
    'smokeTimer',
    'heard',
    'hidden',
    'foodAlive',
    'foodX',
    'foodY',
    'foodRadius',
    'foodValue',
    'foodAge',
    'obsX',
    'obsY',
    'obsVx',
    'obsVy',
    'obsRadius',
    'zoneAlive',
    'zoneX',
    'zoneY',
    'zoneFertility',
    'zoneInitial',
    'danger',
    'attack',
    'hunt',
    'cloudX',
    'cloudY',
    'cloudTtl',
    'ledger',
];

/**
 * Builds a small world with all six RNG streams attached, as `createWorld` would.
 * @returns {ReturnType<typeof allocateWorld>}
 */
function makeWorld() {
    const world = allocateWorld(createConfig(SMALL));
    const root = createRng(1);
    world.rng = Object.fromEntries(STREAMS.map((name) => [name, fork(root, name)]));
    return world;
}

/**
 * The elements the hash covers for a named array: `hidden` without its scratch row.
 * @param {ReturnType<typeof allocateWorld>} world
 * @param {string} name
 * @returns {Float32Array | Uint8Array | Uint32Array | Float64Array}
 */
function covered(world, name) {
    if (name === 'hidden') {
        return world.hidden.subarray(0, world.config.maxAgents * world.layout.hidden);
    }
    return world[name];
}

describe('hashWorld', () => {
    it('returns 16 lowercase hex characters', () => {
        expect(hashWorld(makeWorld())).toMatch(/^[0-9a-f]{16}$/);
    });

    it('gives the same hash for the same world twice', () => {
        const world = makeWorld();
        expect(hashWorld(world)).toBe(hashWorld(world));
    });

    it('gives the same hash for two identically built worlds', () => {
        expect(hashWorld(makeWorld())).toBe(hashWorld(makeWorld()));
    });

    it.each(COVERED)('changes when an element of %s changes', (name) => {
        const world = makeWorld();
        const before = hashWorld(world);
        const arr = covered(world, name);
        arr[arr.length - 1] = 1;
        expect(hashWorld(world)).not.toBe(before);
    });

    it.each(['tick', 'nextId', 'population', 'foodCount', 'cloudCount'])(
        'changes when the scalar %s changes',
        (name) => {
            const world = makeWorld();
            const before = hashWorld(world);
            world[name] += 1;
            expect(hashWorld(world)).not.toBe(before);
        },
    );

    it.each(['inputs', 'outputs'])('ignores %s, which are recomputed every tick', (name) => {
        const world = makeWorld();
        const before = hashWorld(world);
        world[name].fill(0.5);
        expect(hashWorld(world)).toBe(before);
    });

    it('ignores the hidden scratch row', () => {
        const world = makeWorld();
        const before = hashWorld(world);
        const scratchStart = world.config.maxAgents * world.layout.hidden;
        world.hidden.fill(0.5, scratchStart);
        expect(hashWorld(world)).toBe(before);
    });

    it.each(STREAMS)('changes when the %s RNG stream advances', (name) => {
        const world = makeWorld();
        const before = hashWorld(world);
        nextFloat(world.rng[name]);
        expect(hashWorld(world)).not.toBe(before);
    });

    it('throws when world.rng is null', () => {
        const world = allocateWorld(createConfig(SMALL));
        expect(() => hashWorld(world)).toThrow(/hashWorld needs the RNG streams/);
    });

    it('throws naming the stream when one is missing', () => {
        const world = makeWorld();
        delete world.rng.food;
        expect(() => hashWorld(world)).toThrow(/world\.rng\.food is missing/);
    });

    it('throws when world.rng is undefined', () => {
        const world = makeWorld();
        world.rng = undefined;
        expect(() => hashWorld(world)).toThrow(
            'hashWorld needs the RNG streams: world.rng is null; call createWorld first',
        );
    });

    it('throws naming a stream that is null', () => {
        const world = makeWorld();
        world.rng.spawn = null;
        expect(() => hashWorld(world)).toThrow(/world\.rng\.spawn is missing/);
    });

    it('throws naming a stream whose state is not a Uint32Array', () => {
        const world = makeWorld();
        world.rng.mutation = { s: [1, 2, 3, 4] };
        expect(() => hashWorld(world)).toThrow(/world\.rng\.mutation is missing/);
    });

    it.each(['x', 'zoneX'])('throws naming %s when it is not a typed array', (name) => {
        const world = makeWorld();
        world[name] = null;
        expect(() => hashWorld(world)).toThrow(`hashWorld: world.${name} is missing or is not a typed array`);
    });
});
