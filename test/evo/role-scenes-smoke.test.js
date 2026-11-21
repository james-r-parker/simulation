import { describe, expect, it } from 'vitest';
import { arenaConfig } from '../../js/evo/chase-arena.js';
import { playDefenderSmoke, playSmoke } from '../../js/evo/role-scenes-smoke.js';

/** A hunter with a short view: smoke can hide the body for good. */
const BLIND = { maxVelocity: 5, specialisations: { predator: { visionRange: 100 } } };
const STANDING = -Math.PI / 2;
const DEFENDER = { reaction: 2, threshold: 0.1, standing: STANDING };

describe('playSmoke', () => {
    it('drops the cloud size + smokeRadius behind the prey, on the hunter side, and it lives smokeTicks - 1 ticks of sensing', () => {
        const run = playSmoke(arenaConfig(), { gap: 240 });
        expect(run.outcome.cloud.x).toBeCloseTo(240 - (29 + 80), 0);
        expect(run.outcome.cloud.y).toBeCloseTo(0, 0);
        expect(run.ticks.releaseTick).toBe(0);
        expect(run.ticks.cloudLife).toBe(179);
    });

    it('the hunter is blind for as long as the cloud lies on its line to the prey, and the prey is seen again at the defaults', () => {
        const run = playSmoke(arenaConfig(), { gap: 240 });
        expect(run.ticks.hiddenTicks).toBe(15);
        expect(run.outcome.escaped).toBe(false);
    });

    it('a hunter with a short view loses a prey that runs sideways behind the cloud', () => {
        expect(playSmoke(arenaConfig(BLIND), { gap: 240 }).outcome.escaped).toBe(true);
    });

    it('replays bit for bit', () => {
        const config = arenaConfig(BLIND);
        expect(playSmoke(config, { gap: 240 })).toEqual(playSmoke(config, { gap: 240 }));
    });
});

describe('playDefenderSmoke', () => {
    it('the defender hears, turns its back to the hunter and releases once it faces the caller; the cloud lies between', () => {
        const run = playDefenderSmoke(arenaConfig(), DEFENDER);
        expect(run.ticks.heardTick).toBe(3);
        expect(run.ticks.startTick).toBe(5);
        expect(run.ticks.releaseTick).toBe(16);
        expect(run.outcome.between).toBe(true);
        expect(run.outcome.cloud.x).toBeCloseTo(178, 0);
    });

    it('a defender that faces the hunter drops the cloud behind it, on the caller side: it is not between', () => {
        const run = playDefenderSmoke(arenaConfig(), { ...DEFENDER, facing: 'hunter' });
        expect(run.outcome.between).toBe(false);
        expect(run.outcome.cloud.x).toBeCloseTo(345 - (29 + 29) + (29 + 80), 0);
    });

    it('the hunter with a short view loses the caller that runs sideways behind the cloud', () => {
        expect(playDefenderSmoke(arenaConfig(BLIND), DEFENDER).outcome.escaped).toBe(true);
        expect(playDefenderSmoke(arenaConfig(), DEFENDER).outcome.escaped).toBe(false);
    });

    it('replays bit for bit', () => {
        const config = arenaConfig(BLIND);
        expect(playDefenderSmoke(config, DEFENDER)).toEqual(playDefenderSmoke(config, DEFENDER));
    });
});
