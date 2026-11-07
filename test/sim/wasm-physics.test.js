// The WASM physics kernels against the recorded reference of the JS loops they replaced (docs/designs/wasm-kernels.md,
// Phase 4): seeded stepped worlds digest for digest right after every physics phase, and a scrambled crowd through
// integrate, a hash build and the contact pass. `test/sim/golden.json` keeps guarding `worldHash`.
import { describe, expect, it } from 'vitest';
import { integrate, resolveContacts } from '../../js/sim/physics.js';
import { buildHash, createSpatialHash } from '../../js/sim/spatial-hash.js';
import { PHYSICS_FIELDS } from '../../js/sim/wasm-physics.js';
import { scaleTimeout } from '../../scripts/lib/test-timeout.mjs';
import { PHYSICS_CASES, readPhysicsReference, runPhysicsCase, runPhysicsFuzz } from './helpers/physics-reference.js';
import { smallWorld } from './helpers/small-world.js';

const TIMEOUT_MS = scaleTimeout(60_000);

describe('the WASM physics kernels against the recorded JS reference', () => {
    const reference = readPhysicsReference();
    for (const c of PHYSICS_CASES) {
        it(
            `reproduces the digest after every physics phase (${c.name}, ${c.ticks} ticks)`,
            () => {
                expect(runPhysicsCase(c)).toEqual(reference.stepped[c.name]);
            },
            TIMEOUT_MS,
        );
    }

    it('reproduces every pass of the scrambled crowd', () => {
        expect(runPhysicsFuzz()).toEqual(reference.fuzz);
    });
});

/**
 * @param {Record<string, any>} world the world
 * @param {number} x
 * @param {number} y
 * @param {number} size
 * @returns {number} the slot
 */
function place(world, x, y, size) {
    const slot = world.alive.indexOf(0);
    world.alive[slot] = 1;
    world.x[slot] = x;
    world.y[slot] = y;
    world.size[slot] = size;
    world.energy[slot] = 100;
    return slot;
}

describe('the physics arena', () => {
    it('holds the physics fields', () => {
        const world = smallWorld();
        for (const name of PHYSICS_FIELDS) {
            expect(world[name].buffer).toBe(world.wasm.memory.buffer);
        }
    });

    it('records a contact for an overlapping pair and pushes it apart', () => {
        const world = smallWorld();
        const a = place(world, 500, 500, 10);
        const b = place(world, 505, 500, 10);
        buildHash(world.hash, world);
        resolveContacts(world, world.hash);
        expect(world.contactCount).toBe(1);
        expect([world.contacts[0], world.contacts[1]]).toEqual([a, b]);
        expect(world.x[b] - world.x[a]).toBeCloseTo(20, 4);
    });

    it('refuses a hash that does not read the arena, and throws past maxContacts', () => {
        const world = smallWorld({ maxContacts: 1 });
        for (let i = 0; i < 3; i++) {
            place(world, 500 + i, 500, 10);
        }
        expect(() => resolveContacts(world, createSpatialHash(world.config))).toThrow(/not the world's own/);
        buildHash(world.hash, world);
        expect(() => resolveContacts(world, world.hash)).toThrow(/more than maxContacts \(1\) contacts/);
    });

    it('bounces an agent moving into a rock and charges the damage once', () => {
        const world = smallWorld({ obstacleDamage: 7 });
        expect(world.obsX.length).toBeGreaterThan(0);
        const slot = place(world, world.obsX[0] - world.obsRadius[0] - 4, world.obsY[0], 5);
        world.vx[slot] = 3;
        const before = world.energy[slot];
        integrate(world);
        expect(world.vx[slot]).toBeLessThan(0);
        expect(before - world.energy[slot]).toBe(7);
    });
});
