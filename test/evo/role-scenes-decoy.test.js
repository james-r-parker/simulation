import { describe, expect, it } from 'vitest';
import { ARENA_CENTRE, arenaConfig } from '../../js/evo/chase-arena.js';
import { MODEL_DEFAULTS } from '../../js/evo/role-budget-model.js';
import { roleParams } from '../../js/evo/role-budget-params.js';
import { smokeCell } from '../../js/evo/role-budget-smoke.js';
import { viewReachCos } from '../../js/evo/role-budget-senses.js';
import { playSmoke } from '../../js/evo/role-scenes-smoke.js';
import { decoyProfile } from '../../js/evo/role-budget-decoy.js';
import { hunterXs } from '../../js/evo/role-budget-smoke.js';

const GAP = 240;
const HELD = 60;

/**
 * Plays the prey's smoke and reads, from the hunter's start, its x at each tick and whether the prey is in its view.
 * @param {Readonly<Record<string, any>>} config an `arenaConfig`
 * @returns {{x: number[], seen: boolean[]}} the hunter's x after each tick, and whether the prey is in its view
 */
function play(config) {
    const view = roleParams(config, 'predator');
    const x = /** @type {number[]} */ ([]);
    const seen = /** @type {boolean[]} */ ([]);
    playSmoke(config, {
        gap: GAP,
        trace: (w) => {
            x.push(w.x[0] - ARENA_CENTRE.x);
            const dx = w.x[1] - w.x[0];
            const dy = w.y[1] - w.y[0];
            const dist = Math.hypot(dx, dy);
            const cos = (dx * Math.cos(w.angle[0]) + dy * Math.sin(w.angle[0])) / dist;
            seen.push(dist < viewReachCos(view, cos) + w.size[1]);
        },
    });
    return { x, seen };
}

describe('the calculator reads the decoy as the scene plays it', () => {
    const config = arenaConfig();
    const hunter = roleParams(config, 'predator');
    const prey = roleParams(config, 'forager');
    const sim = play(config);

    it('has the hunter where the profile puts it at the end of the decoy, within 2 px', () => {
        const cloud = { x: GAP - (prey.size + prey.smoke.radius), r: prey.smoke.radius };
        const xs = decoyProfile(hunter, {
            xs: hunterXs(hunter, { speed: hunter.cap.sprint }),
            from: 0,
            cloud,
            held: HELD,
            speed: hunter.cap.sprint,
        });
        expect(Math.abs(xs[HELD] - sim.x[HELD - 1])).toBeLessThan(2);
        expect(Math.abs(xs[30] - sim.x[29])).toBeLessThan(2);
    });

    it("has the prey out of the hunter's view for good once the decoy ends, as the cell reads", () => {
        const cell = smokeCell(hunter, prey, { ...MODEL_DEFAULTS });
        const lastSeen = sim.seen.lastIndexOf(true);
        expect(cell.escapeNeed).toBeLessThan(cell.hiddenTicks);
        expect(lastSeen).toBeLessThan(HELD);
    });

    it('with the decoy off, the prey is seen again after the cover and the cell reads no escape', () => {
        const off = arenaConfig({ smokeDecoyTicks: 0 });
        const cell = smokeCell(hunter, roleParams(off, 'forager'), { ...MODEL_DEFAULTS });
        expect(cell.escapeNeed).toBeGreaterThan(cell.hiddenTicks);
        expect(play(off).seen.lastIndexOf(true)).toBeGreaterThan(HELD);
    });
});
