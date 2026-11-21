// The straight-chase rows of "Anchors" in docs/designs/role-budget.md, reproduced by the timeline inside "Tolerances"
// (a contact tick within 2 ticks of the sim, a kill within contact + bites - 1 plus 2).

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { arenaConfig } from '../../js/evo/chase-arena.js';
import { MAX_TICKS, chaseTimeline as timeline } from '../../js/evo/role-budget-timeline.js';
import { roleParams } from '../../js/evo/role-budget-params.js';

/** @type {(hunter: any, prey: any, options: any) => any} the timeline with its numbers left untyped for the asserts */
const chaseTimeline = (hunter, prey, options) => timeline(hunter, prey, options);

const overrides = JSON.parse(readFileSync('evals/fair-chase/courser.json', 'utf8'));
const bodies = (extra = {}) => {
    const config = arenaConfig(extra);
    return { hunter: roleParams(config, 'predator'), prey: roleParams(config, 'forager'), config };
};
const courser = bodies(overrides);
const defaults = bodies();

/** Both sprint from tick 0 (`preySprint: always`), the prey straight; contact is the centre gap under 74. */
const straight = (/** @type {any} */ { hunter, prey }, /** @type {any} */ gap, hunterPlay = {}) =>
    chaseTimeline(hunter, prey, { gap, prey: { sprint: 'always', jink: 0 }, hunter: hunterPlay });

describe('the straight chase of the anchors table', () => {
    it.each([
        [60, 1, 1, 1, 1],
        [120, 31, 31, 31, 31],
        [180, 56, 56, 56, 56],
        [240, 79, 80, 81, 82],
        [300, 93, 93, 106, 107],
    ])(
        'gap %i: contact at %i (courser, sim %i), %i (defaults, sim %i) inside 2 ticks',
        (gap, cScalar, cSim, dScalar, dSim) => {
            expect(Math.abs(straight(courser, gap).contactTick - cSim)).toBeLessThanOrEqual(2);
            expect(Math.abs(straight(courser, gap).contactTick - cScalar)).toBeLessThanOrEqual(2);
            expect(Math.abs(straight(defaults, gap).contactTick - dSim)).toBeLessThanOrEqual(2);
            expect(Math.abs(straight(defaults, gap).contactTick - dScalar)).toBeLessThanOrEqual(2);
        },
    );

    it('kills on the tick the last bite lands: one tick earlier the same chase has one bite fewer and no kill', () => {
        for (const gap of [60, 120, 180, 240, 300]) {
            const run = straight(courser, gap);
            // a bite lands on a tick the hunter touches the prey, so the kill is no sooner than one tick a bite
            expect(run.killTick).toBeGreaterThanOrEqual(run.contactTick + run.bites - 1);
            const before = chaseTimeline(courser.hunter, courser.prey, {
                gap,
                prey: { sprint: 'always', jink: 0 },
                maxTicks: run.killTick - 1,
            });
            expect(before.killTick).toBeNull();
            expect(before.bites).toBe(run.bites - 1);
        }
    });

    it('lands five bites, 700 back, a kick of about 22, from a gap of 60 (the sim says 1 and 6)', () => {
        const run = straight(defaults, 60);
        expect(run.contactTick).toBe(1);
        expect(run.bites).toBe(5);
        expect(Math.abs(run.income - 700)).toBeLessThan(1);
        expect(run.kick).toBeCloseTo(22.25, 0);
        expect(run.killTick).toBeLessThanOrEqual(8);
        expect(run.gate).toBe(true);
    });

    it('needs fewer bites of a prey that has burned energy in flight: 4 after 80 ticks, 2 after 149', () => {
        expect(straight(courser, 240).bites).toBe(4);
        expect(straight(defaults, 400).bites).toBe(2);
    });

    it('closes the largest gap in 250 ticks: about 796 on courser, 540 at effort 0.5 and 647 at the defaults', () => {
        const largest = (/** @type {any} */ set, /** @type {any} */ play) => {
            let [lo, hi] = [74, 4000];
            for (let i = 0; i < 30; i++) {
                const mid = (lo + hi) / 2;
                if (straight(set, mid, play).contactTick !== null) {
                    lo = mid;
                } else {
                    hi = mid;
                }
            }
            return lo;
        };
        // The anchors held the size sum at 74 and left out the strike misses; the timeline lets the bodies shrink as they burn
        // and charges the misses, so contact needs a smaller gap: always under the anchor, by 3.8, 3.4 and 6.2 px. The plan's
        // tolerance is 7 px (about 3 ticks at 2.4 px a tick).
        const reads = [
            [largest(courser, {}), 796, 792.2],
            [largest(courser, { effort: 0.5 }), 540, 536.6],
            [largest(defaults, {}), 647, 640.8],
        ];
        for (const [got, anchor, recorded] of reads) {
            expect(anchor - got).toBeGreaterThan(0);
            expect(anchor - got).toBeLessThan(7);
            expect(Math.abs(got - recorded)).toBeLessThan(0.1);
        }
    });

    it('never catches a sprinting forager at effort 0.5 at the defaults (11.2 against 12)', () => {
        expect(straight(defaults, 120, { effort: 0.5 }).contactTick).toBeNull();
    });

    it('reproduces the oracles play on courser: contact at 10, 48, 74, 87, 97 and 100, and never at 401', () => {
        const oracle = (/** @type {any} */ gap) =>
            chaseTimeline(courser.hunter, courser.prey, {
                gap,
                hunter: { sprint: 'view' },
                prey: { sprint: 'rationed', jink: 0 },
            }).contactTick;
        for (const [gap, tick] of [
            [80, 10],
            [160, 48],
            [240, 74],
            [320, 87],
            [380, 97],
            [400, 100],
        ]) {
            expect(Math.abs(oracle(gap) - tick)).toBeLessThanOrEqual(2);
        }
        expect(oracle(401)).toBeNull();
    });
});

describe('chaseTimeline', () => {
    it('returns no contact and no kill when the prey is out of reach, with the run still counted', () => {
        const run = chaseTimeline(defaults.hunter, defaults.prey, { gap: 3000, prey: { sprint: 'always', jink: 0 } });
        expect(run.contactTick).toBeNull();
        expect(run.killTick).toBeNull();
        expect(run.ticks).toBe(MAX_TICKS);
        expect(run.bites).toBe(0);
        expect(run.hunterSpent).toBeGreaterThan(0);
    });

    it('refuses the bite when the size gate fails and reports it', () => {
        const small = roleParams(arenaConfig({ huntSizeRatio: 3 }), 'predator');
        const run = chaseTimeline(small, defaults.prey, { gap: 60, prey: { sprint: 'always', jink: 0 } });
        expect(run.contactTick).toBe(1);
        expect(run.gate).toBe(false);
        expect(run.killTick).toBeNull();
        expect(run.bites).toBe(0);
    });

    it('reads the size gate on each bite, as couldBite does: a gate refused at the first contact holds once the prey has shrunk', () => {
        const base = JSON.parse(readFileSync('evals/fair-chase/courser.json', 'utf8'));
        const play = { gap: 240, prey: { sprint: 'always', jink: 0 } };
        const at = (/** @type {number} */ ratio, /** @type {any} */ extra = {}) => {
            const set = bodies({ ...base, huntSizeRatio: ratio });
            return chaseTimeline(set.hunter, set.prey, { ...play, ...extra });
        };
        let found = null;
        for (let ratio = 1.5; ratio <= 1.6 && found === null; ratio += 0.002) {
            const full = at(ratio);
            if (full.contactTick !== null && !at(ratio, { maxTicks: full.contactTick }).gate && full.gate) {
                found = full;
            }
        }
        expect(found).not.toBeNull();
        expect(found.bites).toBeGreaterThan(0);
        expect(found.killTick).not.toBeNull();
    });

    it('charges strikeMissCost each tick the hunter holds BITE with no body in its jaws, as the feed phase of the sim does', () => {
        const off = bodies({ ...overrides, strikeMissCost: 0 });
        const on = bodies({ ...overrides, strikeMissCost: 2 });
        const far = (/** @type {any} */ set) =>
            chaseTimeline(set.hunter, set.prey, { gap: 3000, maxTicks: 20, prey: { sprint: 'never', jink: 0 } });
        expect(far(on).hunterSpent - far(off).hunterSpent).toBeCloseTo(40, 0);
        // a tick with the prey in the jaws is not charged: contact from tick 1, five bites in a row
        const near = (/** @type {any} */ set) =>
            chaseTimeline(set.hunter, set.prey, { gap: 60, prey: { sprint: 'always', jink: 0 } });
        expect(near(on).hunterSpent - near(off).hunterSpent).toBeLessThan(2 * near(on).killTick);
    });

    it('does not kill a breaking prey a fresh hunter reaches at the defaults, and does kill a spent one on courser', () => {
        const run = (/** @type {any} */ set, /** @type {any} */ gap) =>
            chaseTimeline(set.hunter, set.prey, { gap, hunter: { sprint: 'view' } });
        expect(run(defaults, 240).killTick).toBeNull();
        expect(run(courser, 240).killTick).not.toBeNull();
    });

    it('starts the hunter at its cruise speed when it was creeping, so it arrives sooner than from rest', () => {
        const from = (/** @type {any} */ start) =>
            chaseTimeline(defaults.hunter, defaults.prey, {
                gap: 200,
                hunterStart: start,
                prey: { sprint: 'always', jink: 0 },
            }).contactTick;
        expect(from('cruise')).toBeLessThan(from('rest'));
    });

    it('is later by the delay: a hunter that waits, runs late, or is held at the turn speed arrives after the perfect one', () => {
        const perfect = straight(courser, 200).contactTick;
        expect(straight(courser, 200, { wait: 10 }).contactTick).toBeGreaterThan(perfect);
        expect(straight(courser, 200, { runAt: 10 }).contactTick).toBeGreaterThan(perfect);
        expect(straight(courser, 200, { slowTicks: 10 }).contactTick).toBeGreaterThan(perfect);
    });

    it('is deterministic: the same call twice gives the same run', () => {
        expect(straight(courser, 220)).toEqual(straight(courser, 220));
    });

    it('gains heat in proportion to the speed it moves at', () => {
        const run = straight(defaults, 300);
        expect(run.heat).toBeGreaterThan(0);
        expect(run.heat).toBeLessThanOrEqual(run.ticks * defaults.hunter.heat.gainMove);
    });
});
