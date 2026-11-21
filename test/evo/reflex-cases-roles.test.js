import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';
import { createRng, fork } from '../../js/sim/rng.js';
import { ALARM_BAR, ROLE_BARS, ROLE_CASES } from '../../js/evo/reflex-cases-roles.js';
import { DEG, SEQUENCE_TICKS } from '../../js/evo/reflex-stage.js';

const VIEW = 350;
const SPACING = 360 / createConfig().rayCount;
const byName = (/** @type {string} */ name) => {
    const found = ROLE_CASES.find((c) => c.name === name);
    if (found === undefined) {
        throw new Error(`no case ${name}`);
    }
    return found;
};
const plan = (/** @type {string} */ name, seed = 1) => byName(name).plan(fork(createRng(seed), `reflex:${name}`), VIEW);
const out = (/** @type {Record<string, number>} */ o) => ({ thrust: 0, turn: 0, sprint: 0, bite: 0, alarm: 0, ...o });
const staging = (/** @type {string} */ kind, bearing = 0) => /** @type {any} */ ({ kind, bearing });

/**
 * @param {any} tick a staged tick
 * @returns {{bearing: number, distance: number}} the second agent's bearing in the first's frame and its distance
 */
function otherFrame(tick) {
    const [subject, other] = tick.agents;
    const raw = Math.atan2(other.y - subject.y, other.x - subject.x) - subject.angle;
    return {
        bearing: Math.atan2(Math.sin(raw), Math.cos(raw)),
        distance: Math.hypot(other.x - subject.x, other.y - subject.y),
    };
}

describe('ROLE_CASES', () => {
    it('are the six role cases, each for its role, frozen', () => {
        expect(ROLE_CASES.map((c) => [c.name, c.spec])).toEqual([
            ['sprint-on-prey', 1],
            ['hold-the-bite', 1],
            ['call-on-threat', 3],
            ['turn-to-alarm', 4],
            ['flee-on-alarm', 0],
            ['clear-the-herd', 0],
        ]);
        expect(Object.isFrozen(ROLE_CASES)).toBe(true);
    });

    it('stage every subject as its own specialisation, at the centre, in both orientations', () => {
        for (const c of ROLE_CASES) {
            const stagings = plan(c.name);
            expect(stagings.some((s) => s.mirror === -1)).toBe(true);
            for (const s of stagings) {
                expect(s.ticks[0].agents[0].spec).toBe(c.spec);
            }
        }
    });
});

describe('sprint-on-prey', () => {
    it('stages a prey at three distances, nearer each time, and then none, in both orientations', () => {
        const stagings = plan('sprint-on-prey');
        expect(stagings.map((s) => s.kind)).toEqual(['far', 'mid', 'near', 'none', 'far', 'mid', 'near', 'none']);
        const [far, mid, near, none] = stagings;
        const gap = (/** @type {any} */ s) => otherFrame(s.ticks[0]).distance;
        expect(gap(far)).toBeGreaterThan(gap(mid));
        expect(gap(mid)).toBeGreaterThan(gap(near));
        expect(gap(far)).toBeLessThan(VIEW);
        expect(near.ticks[0].agents[1].spec).toBe(0);
        expect(none.ticks[0].agents).toHaveLength(1);
        expect(Math.abs(otherFrame(far.ticks[0]).bearing)).toBeLessThanOrEqual(3 * DEG + 1e-9);
        expect(stagings[4].bearing).toBeCloseTo(-far.bearing, 12);
    });

    it('asks for a higher sprint effort as the prey nears and none without prey', () => {
        const { check } = byName('sprint-on-prey');
        const { far, mid, near } = ROLE_BARS.sprint;
        expect(far).toBeLessThan(mid);
        expect(mid).toBeLessThan(near);
        expect(check(out({ sprint: far }), staging('far'))).toBe(true);
        expect(check(out({ sprint: far }), staging('mid'))).toBe(false);
        expect(check(out({ sprint: mid }), staging('mid'))).toBe(true);
        expect(check(out({ sprint: mid }), staging('near'))).toBe(false);
        expect(check(out({ sprint: 1 }), staging('near'))).toBe(true);
        expect(check(out({ sprint: 1 }), staging('none'))).toBe(false);
        expect(check(out({ sprint: 0 }), staging('none'))).toBe(true);
        expect(check(out({ sprint: 0 }), staging('far'))).toBe(false);
    });
});

describe('hold-the-bite', () => {
    it('stages a prey in the jaws, one in view and nothing, in both orientations', () => {
        const stagings = plan('hold-the-bite');
        expect(stagings.map((s) => s.kind)).toEqual(['jaws', 'in-view', 'empty', 'jaws', 'in-view', 'empty']);
        const [jaws, inView, empty] = stagings;
        expect(otherFrame(jaws.ticks[0]).distance).toBeLessThan(100);
        expect(otherFrame(inView.ticks[0]).distance).toBeCloseTo(0.5 * VIEW, 6);
        expect(empty.ticks[0].agents).toHaveLength(1);
    });

    it('passes a bite in the jaws only, so neither always nor never biting passes', () => {
        const { check } = byName('hold-the-bite');
        expect(check(out({ bite: 1 }), staging('jaws'))).toBe(true);
        expect(check(out({ bite: 0 }), staging('jaws'))).toBe(false);
        expect(check(out({ bite: -1 }), staging('in-view'))).toBe(true);
        expect(check(out({ bite: 1 }), staging('in-view'))).toBe(false);
        expect(check(out({ bite: 1 }), staging('empty'))).toBe(false);
        expect(check(out({ bite: 0 }), staging('empty'))).toBe(true);
    });
});

describe('call-on-threat', () => {
    it('stages a hunter at the edge of the view on a forward ray, then the same ray empty', () => {
        const stagings = plan('call-on-threat');
        expect(stagings.map((s) => s.kind)).toEqual(['threat', 'empty', 'threat', 'empty']);
        const [threat, empty] = stagings;
        const f = otherFrame(threat.ticks[0]);
        expect(f.distance).toBeCloseTo(0.9 * VIEW, 6);
        const off = Math.abs(f.bearing) / DEG;
        const nearestRay = Math.round(off / SPACING) * SPACING;
        expect(Math.abs(off - nearestRay)).toBeLessThanOrEqual(3 + 1e-9);
        expect(nearestRay).toBeGreaterThanOrEqual(SPACING);
        expect(threat.ticks[0].agents[1].spec).toBe(1);
        expect(empty.ticks[0].agents).toHaveLength(1);
        expect(empty.bearing).toBe(threat.bearing);
    });

    it('passes an alarm above the sim threshold on the threat and not on the empty ray', () => {
        const { check } = byName('call-on-threat');
        expect(ALARM_BAR).toBe(createConfig().alarmThreshold);
        expect(check(out({ alarm: 1 }), staging('threat'))).toBe(true);
        expect(check(out({ alarm: ALARM_BAR }), staging('threat'))).toBe(false);
        expect(check(out({ alarm: 1 }), staging('empty'))).toBe(false);
        expect(check(out({ alarm: ALARM_BAR }), staging('empty'))).toBe(true);
    });
});

describe('the heard-call cases', () => {
    for (const name of ['turn-to-alarm', 'flee-on-alarm']) {
        it(`${name}: stage a loud alarm from 20 to 140 degrees, nothing else in view, mirrored`, () => {
            const stagings = plan(name);
            expect(stagings.map((s) => s.mirror)).toEqual([1, -1]);
            for (const s of stagings) {
                const [tick] = s.ticks;
                expect(tick.agents).toHaveLength(1);
                expect(tick.heard?.loudness).toBe(1);
                const { angle } = tick.agents[0];
                const heardBearing = Math.atan2(tick.heard?.uy ?? 0, tick.heard?.ux ?? 0) - angle;
                expect(Math.sin(heardBearing)).toBeCloseTo(Math.sin(s.bearing), 6);
                expect(Math.abs(s.bearing)).toBeGreaterThanOrEqual(20 * DEG - 1e-9);
                expect(Math.abs(s.bearing)).toBeLessThanOrEqual(140 * DEG + 1e-9);
            }
            expect(stagings[1].bearing).toBeCloseTo(-stagings[0].bearing, 12);
        });
    }

    it('turn-to-alarm passes a turn towards the call with thrust, not the wrong way or standing', () => {
        const { check } = byName('turn-to-alarm');
        const s = staging('alarm', 60 * DEG);
        expect(check(out({ turn: 1, thrust: 1 }), s)).toBe(true);
        expect(check(out({ turn: -1, thrust: 1 }), s)).toBe(false);
        expect(check(out({ turn: 1, thrust: 0 }), s)).toBe(false);
        expect(check(out({ turn: 0, thrust: 1 }), s)).toBe(false);
        expect(check(out({ turn: -1, thrust: 1 }), staging('alarm', -60 * DEG))).toBe(true);
        expect(check(out({ turn: 1, thrust: 1 }), staging('alarm', -60 * DEG))).toBe(false);
    });

    it('flee-on-alarm passes a turn away from the call with thrust, not towards it or standing', () => {
        const { check } = byName('flee-on-alarm');
        const s = staging('alarm', 60 * DEG);
        expect(check(out({ turn: -1, thrust: 1 }), s)).toBe(true);
        expect(check(out({ turn: 1, thrust: 1 }), s)).toBe(false);
        expect(check(out({ turn: -1, thrust: 0 }), s)).toBe(false);
        expect(check(out({ turn: 0, thrust: 1 }), s)).toBe(false);
        expect(check(out({ turn: 1, thrust: 1 }), staging('alarm', -60 * DEG))).toBe(true);
    });
});

describe('clear-the-herd', () => {
    it('stages one herd animal on a forward ray, closing over the sequence, mirrored', () => {
        const stagings = plan('clear-the-herd');
        expect(stagings.map((s) => s.mirror)).toEqual([1, -1]);
        for (const s of stagings) {
            expect(s.ticks).toHaveLength(SEQUENCE_TICKS);
            const gaps = s.ticks.map((tick) => {
                const [subject] = tick.agents;
                return Math.hypot((tick.herd?.x ?? 0) - subject.x, (tick.herd?.y ?? 0) - subject.y);
            });
            expect(gaps[0]).toBeCloseTo(0.7 * VIEW, 6);
            expect(gaps[SEQUENCE_TICKS - 1]).toBeCloseTo(0.4 * VIEW, 6);
            expect([...gaps].sort((a, b) => b - a)).toEqual(gaps);
            expect(s.ticks[0].agents).toHaveLength(1);
        }
        expect(stagings[1].bearing).toBeCloseTo(-stagings[0].bearing, 12);
    });

    it('passes a turn off the herd line with thrust, not towards the herd or standing', () => {
        const { check } = byName('clear-the-herd');
        const s = staging('herd', 25 * DEG);
        expect(check(out({ turn: -1, thrust: 1 }), s)).toBe(true);
        expect(check(out({ turn: 1, thrust: 1 }), s)).toBe(false);
        expect(check(out({ turn: -1, thrust: 0 }), s)).toBe(false);
        expect(check(out({ turn: 0, thrust: 1 }), s)).toBe(false);
    });
});
