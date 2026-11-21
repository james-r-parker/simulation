import { describe, expect, it } from 'vitest';
import { arenaConfig } from '../../js/evo/chase-arena.js';
import { createBody, stepBody } from '../../js/evo/role-budget-body.js';
import { roleParams } from '../../js/evo/role-budget-params.js';
import { FACING, STILL, released, shouldCut, walkAndStop, walkOut } from '../../js/evo/role-budget-walk.js';

const defender = roleParams(arenaConfig(), 'defender');
const START = { from: { x: 345, y: 150 }, angle: -Math.PI / 2, to: { x: 287, y: 0 } };

describe('walkAndStop', () => {
    it('ends facing the caller and still, which is what the release needs', () => {
        const stop = walkAndStop(defender, START);
        expect(Number.isFinite(stop.ticks)).toBe(true);
        expect(Math.abs(stop.angle)).toBeLessThan(FACING);
    });

    it('takes longer than the walk alone, since the coast down is part of it', () => {
        const stop = walkAndStop(defender, START);
        const b = createBody(defender, { ...START.from, angle: START.angle });
        let cut = false;
        let ticks = 0;
        while (!cut && ticks < 500) {
            const held = walkOut(b, { to: START.to, cut });
            cut = held.cut;
            stepBody(b, held.out);
            ticks += 1;
        }
        expect(stop.ticks).toBeGreaterThan(ticks + 10);
    });

    it('cuts its thrust a coast short of the spot, not on it: at the cut it is still far and fast', () => {
        const b = createBody(defender, { ...START.from, angle: START.angle });
        let cut = false;
        while (!cut) {
            const held = walkOut(b, { to: START.to, cut });
            cut = held.cut;
            if (!cut) {
                stepBody(b, held.out);
            }
        }
        const coast = (defender.cap.sprint * defender.damping) / (1 - defender.damping);
        expect(Math.hypot(START.to.x - b.x, START.to.y - b.y)).toBeGreaterThan(0.5 * coast);
        expect(Math.hypot(b.vx, b.vy)).toBeGreaterThan(STILL);
    });

    it('lands within 40 px of the spot', () => {
        const stop = walkAndStop(defender, START);
        expect(Math.hypot(stop.x - START.to.x, stop.y - START.to.y)).toBeLessThan(40);
    });

    it('a body that cannot thrust never gets there: the ticks are infinite', () => {
        const lame = { ...defender, thrust: { ...defender.thrust, base: 0, sprint: 0 } };
        expect(walkAndStop(lame, START).ticks).toBe(Infinity);
    });
});

describe('the decisions', () => {
    it('shouldCut is true on the spot and false from a standing start far away', () => {
        const on = createBody(defender, { x: 287, y: 0, angle: 0 });
        expect(shouldCut(on, START.to)).toBe(true);
        const far = createBody(defender, { ...START.from, angle: START.angle });
        expect(shouldCut(far, START.to)).toBe(false);
    });

    it('released is true only when the body faces +x and is slower than STILL', () => {
        const b = createBody(defender, { x: 0, y: 0, angle: 0 });
        expect(released(b)).toBe(true);
        expect(released({ ...b, vx: STILL + 0.1 })).toBe(false);
        expect(released({ ...b, angle: 0.01 })).toBe(false);
    });

    it('turns before it thrusts: a body aimed away holds no thrust, an aimed one holds all of it', () => {
        const away = createBody(defender, { x: 0, y: 0, angle: Math.PI });
        expect(walkOut(away, { to: { x: 100, y: 0 }, cut: false }).out.thrust).toBe(0);
        const aimed = createBody(defender, { x: 0, y: 0, angle: 0 });
        expect(walkOut(aimed, { to: { x: 100, y: 0 }, cut: false }).out.thrust).toBe(1);
    });
});
