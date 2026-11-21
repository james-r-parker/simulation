import { describe, expect, it } from 'vitest';
import { CH_SMOKE } from '../../js/sim/brain-layout.js';
import { releaseSmoke } from '../../js/sim/smoke.js';
import { step } from '../../js/sim/step.js';
import { ARENA_CENTRE, arenaConfig, stageArena } from '../../js/evo/chase-arena.js';
import { MODEL_DEFAULTS } from '../../js/evo/role-budget-model.js';
import { roleParams } from '../../js/evo/role-budget-params.js';
import { viewReach, viewReachCos } from '../../js/evo/role-budget-senses.js';
import {
    defenderSmokeGeometry,
    hunterXs,
    segmentHitsCloud,
    shadowRun,
    smokeCell,
} from '../../js/evo/role-budget-smoke.js';

const config = arenaConfig();
const [hunter, prey, defender] = ['predator', 'forager', 'defender'].map((s) => roleParams(config, s));
const R = 80;

describe('segmentHitsCloud', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 100, y: 0 };

    it('is true when the segment passes within the radius of the centre, false when it passes beyond it', () => {
        expect(segmentHitsCloud(a, b, { x: 50, y: 10, r: 20 })).toBe(true);
        expect(segmentHitsCloud(a, b, { x: 50, y: 30, r: 20 })).toBe(false);
        expect(segmentHitsCloud(a, b, { x: 50, y: 19.9, r: 20 })).toBe(true);
    });

    it('measures to the nearest point of the segment, so a cloud past either end is missed', () => {
        expect(segmentHitsCloud(a, b, { x: 150, y: 0, r: 20 })).toBe(false);
        expect(segmentHitsCloud(a, b, { x: -50, y: 0, r: 20 })).toBe(false);
        expect(segmentHitsCloud(a, b, { x: 110, y: 0, r: 20 })).toBe(true);
    });

    it('is true for a segment that starts inside the cloud, and handles a point', () => {
        expect(segmentHitsCloud({ x: 40, y: 0 }, { x: 400, y: 300 }, { x: 50, y: 0, r: 20 })).toBe(true);
        expect(segmentHitsCloud(a, a, { x: 5, y: 0, r: 20 })).toBe(true);
        expect(segmentHitsCloud(a, a, { x: 50, y: 0, r: 20 })).toBe(false);
    });
});

describe('viewReachCos and hunterXs', () => {
    it('viewReachCos is viewReach from the cosine of the bearing', () => {
        for (const bearing of [0, 0.7, Math.PI / 2, 2.4, Math.PI]) {
            expect(viewReachCos(defender, Math.cos(bearing))).toBeCloseTo(viewReach(defender, bearing), 9);
            expect(viewReachCos(hunter, Math.cos(bearing))).toBeCloseTo(viewReach(hunter, bearing), 9);
        }
    });

    it('hunterXs is a straight run at the speed law: at the cap it moves the cap each tick', () => {
        const xs = hunterXs(hunter, { speed: hunter.cap.sprint, ticks: 5 });
        expect(xs).toHaveLength(6);
        expect(xs[5]).toBeCloseTo(5 * hunter.cap.sprint, 9);
    });

    it('hunterXs from rest follows min(cap, (v + a) d)', () => {
        const xs = hunterXs(hunter, { speed: 0, sprint: false, ticks: 3 });
        const v1 = hunter.thrust.cruise * hunter.damping;
        const v2 = (v1 + hunter.thrust.cruise) * hunter.damping;
        expect(xs[1]).toBeCloseTo(v1, 9);
        expect(xs[2]).toBeCloseTo(v1 + v2, 9);
    });
});

describe('shadowRun', () => {
    const xs = Array.from({ length: 200 }, (_, t) => 10 * t);

    it('counts the ticks the hunter-to-body line meets the cloud, never past the cloud life', () => {
        const cloud = { x: 150, y: 0, r: R };
        const body = { x: 240, y: 0 };
        const long = shadowRun(hunter, prey, { xs, from: 0, at: body, cloud, life: 500 });
        const short = shadowRun(hunter, prey, { xs, from: 0, at: body, cloud, life: 3 });
        expect(short.hiddenTicks).toBe(3);
        expect(long.hiddenTicks).toBeGreaterThan(3);
    });

    it('the body is out of view for good once it is beyond the reach at its bearing', () => {
        const cloud = { x: 150, y: 0, r: R };
        const { escapeNeed } = shadowRun(hunter, prey, { xs, from: 0, at: { x: 240, y: 0 }, cloud, life: 180 });
        expect(Number.isFinite(escapeNeed)).toBe(true);
        expect(escapeNeed).toBeGreaterThan(0);
    });

    it('a body that cannot leave the view has an infinite escape', () => {
        const still = Array.from({ length: 60 }, () => 0);
        const cloud = { x: 100, y: 0, r: R };
        const slow = { ...prey, thrust: { ...prey.thrust, base: 0 } };
        expect(shadowRun(hunter, slow, { xs: still, from: 0, at: { x: 120, y: 0 }, cloud, life: 180 }).escapeNeed).toBe(
            Infinity,
        );
    });
});

describe('smokeCell', () => {
    it('puts the cloud size + smokeRadius behind the prey, on the hunter side, and reads hidden - escape - reaction', () => {
        const r = smokeCell(hunter, prey, MODEL_DEFAULTS);
        expect(r.cloud).toEqual({ x: 240 - (prey.size + R), y: 0, r: R });
        expect(r.energy).toEqual({ cost: 20, held: 1000 });
        const margin = r.hiddenTicks - r.escapeNeed - MODEL_DEFAULTS.reactionTicks;
        expect(r.cell.margin).toBe(margin >= 0 ? margin : null);
    });

    it('is n/a while the cooldown has not elapsed, and impossible when the prey cannot pay', () => {
        expect(smokeCell(hunter, prey, { ...MODEL_DEFAULTS, sinceRelease: 100 }).cell.status).toBe('n/a');
        expect(smokeCell(hunter, prey, { ...MODEL_DEFAULTS, sinceRelease: 600 }).cell.status).not.toBe('n/a');
        const poor = { ...prey, energy: 10 };
        expect(smokeCell(hunter, poor, MODEL_DEFAULTS).cell.status).toBe('impossible');
    });

    it('a slower hunter leaves the prey hidden for longer than a fast one', () => {
        const slow = { ...hunter, cap: { ...hunter.cap, sprint: 4 }, thrust: { ...hunter.thrust, sprint: 4 } };
        const fast = smokeCell(hunter, prey, MODEL_DEFAULTS);
        const calm = smokeCell(slow, prey, MODEL_DEFAULTS);
        expect(calm.hiddenTicks).toBeGreaterThanOrEqual(fast.hiddenTicks);
    });
});

describe('defenderSmokeGeometry', () => {
    const bodies = [hunter, prey, defender];
    const length = viewReach(prey, Math.PI) + hunter.size;

    it('a defender already standing on the spot releases facing the caller: the cloud lies between, on the line', () => {
        const g = defenderSmokeGeometry(bodies, { ...MODEL_DEFAULTS, standing: -Math.PI / 2 });
        expect(g.releasePoint).toBeCloseTo(length - (prey.size + defender.size), 9);
        expect(g.cloud.x).toBeCloseTo(g.releasePoint - (defender.size + R), 9);
        expect(g.cloud.y).toBe(0);
        expect(g.refused).toBe(false);
    });

    it('a standing defender turns the short way round: a quarter turn either side takes as long', () => {
        const left = defenderSmokeGeometry(bodies, { ...MODEL_DEFAULTS, standing: Math.PI / 2 });
        const right = defenderSmokeGeometry(bodies, { ...MODEL_DEFAULTS, standing: -Math.PI / 2 });
        expect(left.facingTicks).toBe(right.facingTicks);
    });

    it('a walking defender stops where its coast leaves it, and the cloud lies behind that point, not behind the spot', () => {
        const g = defenderSmokeGeometry(bodies, MODEL_DEFAULTS);
        const spot = length - (prey.size + defender.size);
        expect(g.releasePoint).not.toBeCloseTo(spot, 0);
        expect(g.cloud.x).toBeCloseTo(g.releasePoint - (defender.size + R), 9);
        expect(g.cloud.y).toBeCloseTo(g.offLine, 9);
        expect(g.coast).toBeGreaterThan(200);
        expect(g.refused).toBe(false);
    });

    it('latestRelease is the last tick the near edge is ahead of the hunter after its reaction ticks of travel', () => {
        const g = defenderSmokeGeometry(bodies, MODEL_DEFAULTS);
        const xs = hunterXs(hunter, { speed: hunter.cap.cruise });
        const near = g.cloud.x - R;
        const reach = (/** @type {number} */ t) => xs[t] + (xs[t] - xs[t - 1]) * MODEL_DEFAULTS.reactionTicks;
        expect(reach(g.latestRelease)).toBeLessThanOrEqual(near);
        expect(reach(g.latestRelease + 1)).toBeGreaterThan(near);
    });

    it('the release waits for the walk, the turn and the stop, after the 2 x reactionTicks + 1 of hearing', () => {
        const g = defenderSmokeGeometry(bodies, MODEL_DEFAULTS);
        expect(g.releaseTick).toBe(2 * MODEL_DEFAULTS.reactionTicks + 1 + g.runTicks);
        expect(g.facingTicks).toBe(0);
        const stood = defenderSmokeGeometry(bodies, { ...MODEL_DEFAULTS, standing: -Math.PI / 2 });
        expect(stood.releaseTick).toBe(2 * MODEL_DEFAULTS.reactionTicks + 1 + stood.facingTicks);
        expect(stood.facingTicks).toBeGreaterThan(0);
        const near = defenderSmokeGeometry(bodies, { ...MODEL_DEFAULTS, escortGap: 30 });
        expect(near.runTicks).toBeLessThan(g.runTicks);
    });

    it('refuses a defender that faces the hunter: the cloud would land behind it, on the caller side', () => {
        const g = defenderSmokeGeometry(bodies, { ...MODEL_DEFAULTS, facing: 'hunter' });
        expect(g.refused).toBe(true);
        expect(g.cell.status).toBe('impossible');
    });

    it('is n/a inside the cooldown, and takes the smaller of the defender and the caller slack', () => {
        expect(defenderSmokeGeometry(bodies, { ...MODEL_DEFAULTS, sinceRelease: 5 }).cell.status).toBe('n/a');
        const g = defenderSmokeGeometry(bodies, MODEL_DEFAULTS);
        const both = [g.slackDefender, g.slackCaller];
        if (!both.includes(null) && Math.min(.../** @type {number[]} */ (both)) >= 0) {
            expect(g.cell.margin).toBe(Math.min(.../** @type {number[]} */ (both)));
        } else {
            expect(g.cell.status).toBe('impossible');
        }
    });
});

describe('a defender that cannot get there, and a caller that cannot get away', () => {
    it('a defender that never reaches the line has no release: the tick is infinite and the cell impossible', () => {
        const lame = { ...defender, thrust: { ...defender.thrust, base: 0 } };
        const g = defenderSmokeGeometry([hunter, prey, lame], MODEL_DEFAULTS);
        expect(g.releaseTick).toBe(Infinity);
        expect(g.slackDefender).toBeNull();
        expect(g.cell.status).toBe('impossible');
    });

    it('a caller that cannot run never leaves the hunter view: its slack is missing and the cell impossible', () => {
        const stuck = { ...prey, thrust: { ...prey.thrust, base: 0 } };
        const still = { ...hunter, cap: { cruise: 0, sprint: 0 }, thrust: { ...hunter.thrust, sprint: 0 } };
        const g = defenderSmokeGeometry([still, stuck, defender], MODEL_DEFAULTS);
        expect(g.escapeNeed).toBe(Infinity);
        expect(g.slackCaller).toBeNull();
        expect(g.cell.status).toBe('impossible');
        expect(defenderSmokeGeometry([hunter, prey, defender], MODEL_DEFAULTS).slackCaller).not.toBeNull();
    });

    it('a body that cannot pay for the cloud reads impossible whatever the geometry', () => {
        const broke = defenderSmokeGeometry([hunter, prey, { ...defender, energy: 10 }], MODEL_DEFAULTS);
        expect(broke.cell.status).toBe('impossible');
        expect(smokeCell(hunter, { ...prey, energy: 10 }, MODEL_DEFAULTS).cell.margin).toBeNull();
    });
});

describe('a ray that meets a cloud returns a smoke hit', () => {
    it('the hunter behind a defender-released cloud senses smoke on its ray ahead, in the real sim', () => {
        const { x, y } = ARENA_CENTRE;
        const cfg = arenaConfig();
        const specs = /** @type {Record<string, any>} */ (cfg.specialisations);
        const bodies = [
            { spec: specs.predator.index, x, y, angle: 0 },
            { spec: specs.defender.index, x: x + 200, y, angle: 0 },
        ];
        const clear = stageArena(cfg, bodies);
        step(clear.world, clear.policy, { brain: () => {} });
        expect(clear.world.inputs[CH_SMOKE]).toBe(0);
        const { world, policy } = stageArena(cfg, bodies);
        releaseSmoke(world, 1);
        expect(world.cloudCount).toBe(1);
        step(world, policy, { brain: () => {} });
        // slot 0, ray 0 (dead ahead)
        const at = CH_SMOKE;
        expect(world.inputs[at]).toBe(1);
    });
});
