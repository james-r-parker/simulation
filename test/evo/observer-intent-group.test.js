import { describe, expect, it } from 'vitest';
import { sampleGroups } from '../../js/evo/observer-intent-group.js';
import { HEARD_STRIDE } from '../../js/sim/world.js';
import { FORAGER, PREDATOR, intentArena } from './helpers/intent-world.js';
import { addBorn } from './helpers/observer-world.js';
import { createRng, nextFloat } from '../../js/sim/rng.js';

describe('sampleGroups', () => {
    it('pools the kin counts around threatened and unthreatened agents without canHunt', () => {
        const { world, intent } = intentArena({ callRadius: 100 });
        const a = addBorn(world, { spec: FORAGER, lineageId: 5, x: 100, y: 100 });
        addBorn(world, { spec: FORAGER, lineageId: 5, x: 150, y: 100 });
        addBorn(world, { spec: FORAGER, lineageId: 5, x: 100, y: 190 });
        addBorn(world, { spec: FORAGER, lineageId: 5, x: 100, y: 201 });
        addBorn(world, { spec: FORAGER, lineageId: 6, x: 120, y: 100 });
        addBorn(world, { spec: PREDATOR, lineageId: 5, x: 110, y: 100 });
        intent.threatProx[a] = 0.5;
        sampleGroups(intent, world);
        expect([intent.run.groupThreatSum, intent.run.groupThreatN]).toEqual([2, 1]);
        expect([intent.run.groupCalmSum, intent.run.groupCalmN]).toEqual([4, 4]);
    });

    it('leaves the threatened sums at 0 when no agent is threatened, and skips dead slots', () => {
        const { world, intent } = intentArena({ callRadius: 100 });
        addBorn(world, { spec: FORAGER, lineageId: 5, x: 100, y: 100 });
        const b = addBorn(world, { spec: FORAGER, lineageId: 5, x: 110, y: 100 });
        world.alive[b] = 0;
        intent.threatProx[b] = 0.9;
        sampleGroups(intent, world);
        expect([intent.run.groupThreatN, intent.run.groupCalmN, intent.run.groupCalmSum]).toEqual([0, 1, 0]);
    });

    it('matches a count over every pair, across several lineages and a mix of threatened and calm agents', () => {
        const { world, intent } = intentArena({ callRadius: 100, maxAgents: 60 });
        const rng = createRng(11);
        for (let i = 0; i < 50; i++) {
            const spec = nextFloat(rng) < 0.2 ? PREDATOR : FORAGER;
            const lineageId = 1 + Math.floor(nextFloat(rng) * 4);
            const slot = addBorn(world, { spec, lineageId, x: nextFloat(rng) * 300, y: nextFloat(rng) * 300 });
            intent.threatProx[slot] = nextFloat(rng);
            world.alive[slot] = nextFloat(rng) < 0.1 ? 0 : 1;
        }
        const sums = [0, 0, 0, 0];
        const ok = (/** @type {number} */ s) => world.alive[s] === 1 && intent.hunterSpec[world.spec[s]] === 0;
        for (let a = 0; a < 60; a++) {
            if (!ok(a)) {
                continue;
            }
            let kin = 0;
            for (let b = 0; b < 60; b++) {
                const d2 = (world.x[b] - world.x[a]) ** 2 + (world.y[b] - world.y[a]) ** 2;
                kin += b !== a && ok(b) && world.lineageId[b] === world.lineageId[a] && d2 <= 100 * 100 ? 1 : 0;
            }
            const hot = intent.threatProx[a] >= 0.5 ? 0 : 2;
            sums[hot] += kin;
            sums[hot + 1] += 1;
        }
        sampleGroups(intent, world);
        const { run } = intent;
        expect([run.groupThreatSum, run.groupThreatN, run.groupCalmSum, run.groupCalmN]).toEqual(sums);
    });
});

describe('flee samples', () => {
    /**
     * One agent on a sample with the given threat, heard alarm and speed (3-4-5 split of the speed).
     * @param {{prox?: number, loud?: number, speed: number, spec?: number}} f the agent's state
     * @returns {{intent: any, slot: number}} the intent state and the agent's slot
     */
    function sample(f) {
        const { world, intent } = intentArena({ maxVelocity: 10 });
        const slot = addBorn(world, { spec: f.spec ?? FORAGER });
        intent.threatProx[slot] = f.prox ?? 0;
        world.heard[slot * HEARD_STRIDE] = f.loud ?? 0;
        world.vx[slot] = f.speed * 0.6;
        world.vy[slot] = f.speed * 0.8;
        sampleGroups(intent, world);
        return { intent, slot };
    }

    it('counts a threatened sample, and a flee when the speed is above half of maxVelocity', () => {
        const fast = sample({ prox: 0.5, speed: 5.01 });
        expect([fast.intent.threatSamples[fast.slot], fast.intent.fleeSamples[fast.slot]]).toEqual([1, 1]);
        const slow = sample({ prox: 0.9, speed: 5 });
        expect([slow.intent.threatSamples[slow.slot], slow.intent.fleeSamples[slow.slot]]).toEqual([1, 0]);
    });

    it('takes a heard alarm above 0.2 as a threat, and a calm agent as no sample', () => {
        const loud = sample({ loud: 0.21, speed: 9 });
        expect([loud.intent.threatSamples[loud.slot], loud.intent.fleeSamples[loud.slot]]).toEqual([1, 1]);
        const quiet = sample({ loud: 0.19, prox: 0.49, speed: 9 });
        expect([quiet.intent.threatSamples[quiet.slot], quiet.intent.fleeSamples[quiet.slot]]).toEqual([0, 0]);
    });

    it('skips agents that can hunt', () => {
        const hunter = sample({ prox: 0.9, speed: 9, spec: PREDATOR });
        expect(hunter.intent.threatSamples[hunter.slot]).toBe(0);
    });
});
