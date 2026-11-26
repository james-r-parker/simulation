import { describe, expect, it } from 'vitest';
import { arenaConfig } from '../../js/evo/chase-arena.js';
import { playPack } from '../../js/evo/role-scenes-pack.js';

// The numbers adopted as the defaults by status-effects T18 (`step5-e.json`), named so a change of the default is seen here.
const LIVE = arenaConfig({ rallyThrust: 0.1, rallyBurn: 4 });
const NEUTRAL = arenaConfig({ rallyThrust: 0, rallyBurn: 0 });

describe('playPack with a hunt call', () => {
    const scene = playPack(LIVE, { call: true });

    it('fires one hunt call and gives the hearer one rallied stack and the caller none', () => {
        expect(scene.ticks.call).toBe(4);
        expect(scene.rallied).toEqual({ caller: 0, hearer: 1 });
    });

    it('raises the hearer sprintBoost by rallyThrust and its standing cost by rallyBurn, at nerve 1', () => {
        expect(scene.lanes.sprintBoost).toBeCloseTo(1.1, 9);
        expect(scene.lanes.passiveLoss).toBeCloseTo(5, 9);
    });

    it('has the caller at the lone sprint cap and the hearer above it', () => {
        expect(scene.peak.caller).toBeCloseTo(14.4, 1);
        expect(scene.peak.hearer).toBeGreaterThan(15);
        expect(scene.peak.hearer).toBeLessThan(15.4);
    });

    it('pays the caller one answered stack when the rallied hearer kills the forager that the caller bit', () => {
        expect(scene.outcome).toEqual({ answered: 1, killer: 1, shared: true });
    });

    it('replays bit for bit', () => {
        expect(playPack(LIVE, { call: true })).toEqual(scene);
    });
});

describe('playPack without a call', () => {
    it('gives no stack, no lane change and no answered stack', () => {
        const scene = playPack(LIVE, { call: false });
        expect(scene.ticks.call).toBeNull();
        expect(scene.rallied).toEqual({ caller: 0, hearer: 0 });
        expect(scene.lanes).toEqual({ sprintBoost: 1, passiveLoss: 1 });
        expect(scene.outcome.answered).toBe(0);
        expect(scene.ticks.kill).not.toBeNull();
    });
});

describe('playPack at the neutral numbers', () => {
    it('fires the call but raises no stack, since a rally with no strength is not kept', () => {
        const scene = playPack(NEUTRAL, { call: true });
        expect(scene.ticks.call).toBe(4);
        expect(scene.rallied).toEqual({ caller: 0, hearer: 0 });
        expect(scene.lanes).toEqual({ sprintBoost: 1, passiveLoss: 1 });
        expect(scene.outcome.answered).toBe(0);
    });
});

describe('playPack with a weak rally', () => {
    it('lets the caller make the kill, so the hearer shares nothing and the caller is paid no answered stack', () => {
        const scene = playPack(arenaConfig({ rallyThrust: 0.05, rallyBurn: 4 }), { call: true });
        expect(scene.rallied.hearer).toBe(1);
        expect(scene.outcome).toEqual({ answered: 0, killer: 0, shared: false });
    });
});
