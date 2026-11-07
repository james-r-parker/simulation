// The agent `state` word (renderer-event-effects Phase 2): read-only body state for the renderer. Writing it must not
// touch the world, so the golden runs and worldHash stay as they are (test/sim/golden.test.js).
import { describe, expect, it } from 'vitest';
import { createSnapshotViews, HEADER_WORDS, snapshotLayout, writeSnapshot } from '../../js/sim/snapshot.js';
import { SNAPSHOT_STATE } from '../../js/sim/snapshot-state.js';
import { hashWorld } from '../../js/sim/world-hash.js';
import { smallWorld } from './helpers/small-world.js';

const STATE = HEADER_WORDS + 12;

/**
 * @param {Record<string, any>} [over] config overrides
 * @returns {{world: any, views: ReturnType<typeof createSnapshotViews>}} a world with one alive agent in slot 0
 */
function oneAgent(over = {}) {
    const world = smallWorld(over);
    world.alive[0] = 1;
    return { world, views: createSnapshotViews(new ArrayBuffer(snapshotLayout(world.config).bytes)) };
}

describe('the agent state word', () => {
    it('is zero for an adult, hungry, unhurt body outside cover', () => {
        const { world, views } = oneAgent();
        world.ageTicks[0] = world.config.juvenileTicks;
        world.energy[0] = 0;
        writeSnapshot(world, views);
        expect(views.u32[STATE]).toBe(0);
    });

    it('sets the juvenile, sated, in-cover and resting bits from the body', () => {
        const { world, views } = oneAgent({ predatorRestTicks: 60, satiationShare: 0.8 });
        world.ageTicks[0] = 0;
        world.energy[0] = world.maxEnergyBySpec[world.spec[0]];
        world.coverRing[0] = 2;
        world.restTimer[0] = 5;
        writeSnapshot(world, views);
        const s = views.u32[STATE];
        expect(s & SNAPSHOT_STATE.JUVENILE).not.toBe(0);
        expect(s & SNAPSHOT_STATE.SATED).not.toBe(0);
        expect(s & SNAPSHOT_STATE.IN_COVER).not.toBe(0);
        expect(s & SNAPSHOT_STATE.RESTING).not.toBe(0);
    });

    it('leaves sated off when satiation is off, and resting off when the rest timer does not exist', () => {
        const { world, views } = oneAgent({ predatorRestTicks: 0, satiationShare: 0 });
        world.energy[0] = world.maxEnergyBySpec[world.spec[0]];
        writeSnapshot(world, views);
        expect(views.u32[STATE] & (SNAPSHOT_STATE.SATED | SNAPSHOT_STATE.RESTING)).toBe(0);
    });

    it('packs gestation progress, the dose over the sick dose (clamped) and the strain into bytes', () => {
        const { world, views } = oneAgent();
        world.ageTicks[0] = world.config.juvenileTicks;
        world.pregnancy[0] = world.config.pregnancyTicks / 4;
        world.dose[0] = world.config.sickDose * 3;
        world.infection[0] = 7;
        writeSnapshot(world, views);
        const s = views.u32[STATE];
        const byte = (/** @type {number} */ shift) => (s >>> shift) & SNAPSHOT_STATE.BYTE;
        expect(byte(SNAPSHOT_STATE.GESTATION_SHIFT)).toBe(Math.round(0.75 * 255));
        expect(byte(SNAPSHOT_STATE.DOSE_SHIFT)).toBe(255);
        expect(byte(SNAPSHOT_STATE.STRAIN_SHIFT)).toBe(7);
    });

    it('reads the world without changing it', () => {
        const { world, views } = oneAgent({ predatorRestTicks: 60 });
        world.pregnancy[0] = 10;
        const before = hashWorld(world);
        writeSnapshot(world, views);
        expect(hashWorld(world)).toBe(before);
    });
});
