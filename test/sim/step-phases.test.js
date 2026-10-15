import { describe, expect, it, vi } from 'vitest';
import { step } from '../../js/sim/step.js';

/** @type {any[][]} */
const calls = vi.hoisted(() => []);

/**
 * @param {string} name the function name to record
 * @returns {(...args: any[]) => void} a recorder
 */
const rec = vi.hoisted(() => (/** @type {string} */ name) => (/** @type {any[]} */ ...args) => {
    calls.push([name, ...args]);
});

vi.mock('../../js/sim/energy.js', () => ({ applyCosts: rec('applyCosts') }));
vi.mock('../../js/sim/events.js', () => ({ clearEvents: rec('clearEvents') }));
vi.mock('../../js/sim/environment.js', () => ({
    decayFertileZones: rec('decayFertileZones'),
    moveObstacles: rec('moveObstacles'),
    updateSeason: rec('updateSeason'),
}));
vi.mock('../../js/sim/feeding.js', () => ({ feed: rec('feed') }));
vi.mock('../../js/sim/food.js', () => ({ ageFood: rec('ageFood'), spawnFood: rec('spawnFood') }));
vi.mock('../../js/sim/invariants.js', () => ({ assertInvariants: rec('assertInvariants') }));
vi.mock('../../js/sim/brain.js', () => ({ forwardAll: rec('forwardAll') }));
vi.mock('../../js/sim/physics.js', () => ({
    actAll: rec('actAll'),
    integrate: rec('integrate'),
    resolveContacts: rec('resolveContacts'),
}));
vi.mock('../../js/sim/population.js', () => ({ fillFloor: rec('fillFloor'), reap: rec('reap') }));
vi.mock('../../js/sim/pheromones.js', () => ({ updatePheromones: rec('updatePheromones') }));
vi.mock('../../js/sim/reproduction.js', () => ({
    advancePregnancies: rec('advancePregnancies'),
    mate: rec('mate'),
    splitAll: rec('splitAll'),
}));
vi.mock('../../js/sim/sensors.js', () => ({ senseAll: rec('senseAll') }));
vi.mock('../../js/sim/spatial-hash.js', () => ({ buildHash: rec('buildHash') }));

/**
 * @param {boolean} checkInvariants whether the config asks for the invariants phase
 * @returns {{world: any, policy: any, hash: any}} sentinel objects the phases are called with
 */
function sentinels(checkInvariants) {
    const hash = { tag: 'hash' };
    const policy = { tag: 'policy' };
    const world = { tick: 3, hash, events: { tag: 'events' }, config: { checkInvariants } };
    return { world, policy, hash };
}

describe('step phase bodies', () => {
    it('calls every phase function in order with the documented arguments', () => {
        calls.length = 0;
        const { world, policy, hash } = sentinels(true);
        step(world, policy);
        expect(calls).toEqual([
            ['clearEvents', world.events],
            ['updateSeason', world],
            ['moveObstacles', world],
            ['buildHash', hash, world],
            ['senseAll', world, hash],
            ['forwardAll', world],
            ['actAll', world],
            ['integrate', world],
            ['buildHash', hash, world],
            ['resolveContacts', world, hash],
            ['feed', world, hash],
            ['mate', world, policy],
            ['applyCosts', world],
            ['advancePregnancies', world, policy],
            ['splitAll', world, policy],
            ['reap', world, policy],
            ['fillFloor', world, policy],
            ['spawnFood', world],
            ['ageFood', world],
            ['decayFertileZones', world],
            ['updatePheromones', world],
            ['assertInvariants', world],
        ]);
        expect(world.tick).toBe(4);
    });

    it('skips the invariant check when the config does not ask for it', () => {
        calls.length = 0;
        const { world, policy } = sentinels(false);
        step(world, policy);
        expect(calls.some((c) => c[0] === 'assertInvariants')).toBe(false);
    });
});
