// Motor checks (docs/designs/senses-and-motor.md, Phase 1, T2): what THRUST, TURN and the action outputs do to the body.
// Terminal speed, the velocity inputs, the turn rate, reverse thrust, each multiplier of `thrustOf`, and where each
// action output starts to act (above 0 for the bite, sprint and mate; above a config threshold for the three calls).
import { describe, expect, it } from 'vitest';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { createConfig } from '../../js/sim/config.js';
import { signalAll } from '../../js/sim/calls.js';
import { applyCosts } from '../../js/sim/energy.js';
import { feed } from '../../js/sim/feeding.js';
import { readyToMate } from '../../js/sim/mate-eligibility.js';
import { actAll, integrate } from '../../js/sim/physics.js';
import { thrustEfficiency } from '../../js/sim/temperature.js';
import { addFood, rebuild } from './helpers/sense-world.js';
import { FORAGER, PREDATOR, addSubject, bodyInput, brainRow, stageSubject } from './helpers/interface-stage.js';

const { THRUST, TURN, SPRINT, MATE, BITE, ALARM, SMOKE, HUNT } = OUTPUT_INDEX;

/**
 * @param {Record<string, any>} [over] config overrides
 * @param {number} [spec] the subject's specialisation
 * @returns {{w: any, me: number, set: (o: Record<number, number>) => void}} an open-field world and its one subject
 */
function field(over = {}, spec = FORAGER) {
    const w = stageSubject({ worldWidth: 20000, worldHeight: 20000, ...over });
    const me = addSubject(w, { spec });
    const set = (/** @type {Record<number, number>} */ o) => {
        for (const [k, v] of Object.entries(o)) {
            w.outputs[me * OUTPUT_COUNT + Number(k)] = v;
        }
    };
    return { w, me, set };
}

/**
 * @param {any} w the world
 * @param {number} ticks how many ticks of act and integrate
 * @returns {void}
 */
function run(w, ticks) {
    for (let t = 0; t < ticks; t++) {
        actAll(w);
        integrate(w);
    }
}

const speedOf = (/** @type {any} */ w, /** @type {number} */ me) => Math.hypot(w.vx[me], w.vy[me]);

describe('speed', () => {
    it('THRUST 1 for 200 ticks reaches maxVelocity, and the uncapped terminal speed is above it', () => {
        const { w, me, set } = field();
        set({ [THRUST]: 1 });
        run(w, 200);
        expect(speedOf(w, me)).toBeCloseTo(w.config.maxVelocity, 4);
        const { maxThrust, damping } = w.config;
        const uncapped = (damping * maxThrust * thrustEfficiency(w.config, w.temperature[me])) / (1 - damping);
        expect(uncapped).toBeGreaterThan(w.config.maxVelocity);
    });

    it('the forward-velocity input reads the speed as a share of maxVelocity', () => {
        const { w, me, set } = field();
        set({ [THRUST]: 1 });
        run(w, 200);
        expect(bodyInput(brainRow(w, me), 1)).toBeCloseTo(1, 4);
        expect(Math.abs(bodyInput(brainRow(w, me), 2))).toBeLessThan(1e-4);
    });

    it.each([
        ['forager', FORAGER, 1.5],
        ['predator', PREDATOR, 1.8],
    ])(
        'a sprinting %s reaches maxVelocity x (1 + sprintMultiplier x sprintBoost), and the input reads above 1',
        (_n, spec, factor) => {
            const { w, me, set } = field({}, spec);
            set({ [THRUST]: 1, [SPRINT]: 1 });
            run(w, 200);
            expect(speedOf(w, me)).toBeCloseTo(w.config.maxVelocity * factor, 4);
            expect(bodyInput(brainRow(w, me), 1)).toBeCloseTo(factor, 4);
        },
    );

    it('THRUST -1 pushes backwards as hard as +1 pushes forwards', () => {
        const forward = field();
        forward.set({ [THRUST]: 1 });
        run(forward.w, 30);
        const back = field();
        back.set({ [THRUST]: -1 });
        run(back.w, 30);
        expect(back.w.vx[back.me]).toBeCloseTo(-forward.w.vx[forward.me], 5);
        expect(bodyInput(brainRow(back.w, back.me), 1)).toBeLessThan(0);
    });
});

describe('turn', () => {
    it.each([
        ['forager', FORAGER, 1],
        ['predator', PREDATOR, 0.7],
    ])(
        'TURN 1 turns a %s maxTurn x turnMultiplier a tick, and the turn input reads the multiplier',
        (_n, spec, multiplier) => {
            const { w, me, set } = field({}, spec);
            set({ [TURN]: 1 });
            actAll(w);
            expect(w.angle[me]).toBeCloseTo(w.config.maxTurn * multiplier, 6);
            expect(bodyInput(brainRow(w, me), 3)).toBeCloseTo(multiplier, 6);
            set({ [TURN]: -1 });
            actAll(w);
            expect(w.angle[me]).toBeCloseTo(0, 6);
        },
    );

    it('the heading wraps into [-PI, PI)', () => {
        const { w, me, set } = field();
        w.angle[me] = Math.PI - 0.05;
        set({ [TURN]: 1 });
        actAll(w);
        expect(w.angle[me]).toBeCloseTo(Math.PI - 0.05 + w.config.maxTurn - 2 * Math.PI, 6);
    });
});

describe('each multiplier of thrustOf', () => {
    /**
     * The velocity one `actAll` adds to a body at rest, heading +x, with THRUST 1.
     * @param {Record<string, any>} over config overrides
     * @param {{spec?: number, out?: Record<number, number>, body?: (w: any, me: number) => void}} [opts] the subject
     * @returns {number} the thrust
     */
    function thrust(over, { spec = FORAGER, out = {}, body = () => {} } = {}) {
        const { w, me, set } = field(over, spec);
        set({ [THRUST]: 1, ...out });
        body(w, me);
        actAll(w);
        return w.vx[me];
    }
    const base = thrust({});

    it('is maxThrust x the temperature efficiency with nothing else on', () => {
        const { w, me } = field();
        expect(base).toBeCloseTo(w.config.maxThrust * thrustEfficiency(w.config, w.temperature[me]), 6);
    });

    it('grazing (BITE above 0) slows a forager to grazeThrust and never a hunter', () => {
        const over = { grazeThrust: 0.5 };
        expect(thrust(over, { out: { [BITE]: 1 } })).toBeCloseTo(0.5 * base, 6);
        expect(thrust(over, { out: { [BITE]: 0 } })).toBeCloseTo(base, 6);
        expect(thrust(over, { spec: PREDATOR, out: { [BITE]: 1 } })).toBeCloseTo(base, 6);
    });

    it('a sprint multiplies the thrust by 1 + sprintMultiplier x sprintBoost', () => {
        expect(thrust({}, { out: { [SPRINT]: 1 } })).toBeCloseTo(1.5 * base, 6);
        expect(thrust({}, { spec: PREDATOR, out: { [SPRINT]: 1 } })).toBeCloseTo(1.8 * base, 6);
    });

    it('a hunter resting after a kill has no thrust and counts the timer down', () => {
        const { w, me, set } = field({ predatorRestTicks: 60 }, PREDATOR);
        set({ [THRUST]: 1 });
        w.restTimer[me] = 3;
        actAll(w);
        expect([w.vx[me], w.restTimer[me]]).toEqual([0, 2]);
    });

    it('handling a meal multiplies the thrust by handlingThrust until handlingTicks have passed', () => {
        const over = { handlingTicks: 10, handlingThrust: 0.2 };
        expect(thrust(over, { body: (w, me) => (w.ateTimer[me] = 3) })).toBeCloseTo(0.2 * base, 6);
        expect(thrust(over, { body: (w, me) => (w.ateTimer[me] = 10) })).toBeCloseTo(base, 6);
    });

    it('sickness multiplies the thrust by sickThrust', () => {
        const sick = thrust({}, { body: (w, me) => (w.dose[me] = w.config.sickDose) });
        expect(sick).toBeCloseTo(base * 0.4, 6);
    });

    it('a full store multiplies thrust and turn by 1 - fatSlowShare', () => {
        const fat = (/** @type {any} */ w, /** @type {number} */ me) => (w.energy[me] = w.maxEnergyBySpec[FORAGER]);
        expect(thrust({ fatSlowShare: 0.4 }, { body: fat })).toBeCloseTo(0.6 * base, 6);
        const { w, me, set } = field({ fatSlowShare: 0.4 });
        fat(w, me);
        set({ [TURN]: 1 });
        actAll(w);
        expect(w.angle[me]).toBeCloseTo(0.6 * w.config.maxTurn, 6);
    });
});

describe('the action outputs', () => {
    it('a forager eats an item it overlaps only while BITE is above 0', () => {
        const eaten = (/** @type {number} */ bite) => {
            const { w, me, set } = field();
            set({ [BITE]: bite });
            const food = addFood(w, w.x[me], w.y[me], 5);
            w.foodValue[food] = 10;
            feed(w, rebuild(w));
            return w.foodAlive[food] === 0;
        };
        expect([eaten(-1e-6), eaten(0), eaten(1e-6)]).toEqual([false, false, true]);
    });

    it('SPRINT above 0 costs sprintCost a tick and nothing at 0', () => {
        const cost = (/** @type {number} */ sprint) => {
            const { w, me, set } = field();
            set({ [SPRINT]: sprint });
            const before = w.energy[me];
            applyCosts(w);
            return before - w.energy[me];
        };
        const extra = cost(1e-6) - cost(0);
        expect(extra).toBeCloseTo(stageSubject().config.sprintCost, 6);
        expect(cost(-1e-6)).toBe(cost(0));
    });

    it('MATE above 0 makes an eligible agent ready to mate, and nothing makes a younger one ready', () => {
        const ready = (/** @type {number} */ mate, /** @type {number} */ age) => {
            const { w, me, set } = field({ maturityTicks: 100, mateMinEnergy: 10 });
            set({ [MATE]: mate });
            w.ageTicks[me] = age;
            w.energy[me] = 500;
            return readyToMate(w, me);
        };
        expect([ready(0, 100), ready(1e-6, 100), ready(1, 99)]).toEqual([false, true, false]);
    });

    it.each([
        ['alarm', ALARM, FORAGER, 'alarmThreshold', 'alarmCost', 'alarmTimer'],
        ['hunt call', HUNT, PREDATOR, 'huntCallThreshold', 'huntCallCost', 'huntTimer'],
        ['smoke', SMOKE, FORAGER, 'smokeThreshold', 'smokeCost', 'smokeTimer'],
    ])(
        'the %s fires above its config threshold, not above 0, and costs its cost key',
        (_n, output, spec, thresholdKey, costKey, timer) => {
            const defaults = Object.fromEntries(
                ['alarmThreshold', 'huntCallThreshold'].map((k) => [k, createConfig()[k]]),
            );
            const threshold = createConfig()[thresholdKey];
            expect(threshold).toBeGreaterThan(0.1);
            const fires = (/** @type {number} */ value) => {
                const { w, me, set } = field(defaults, spec);
                set({ [output]: value });
                const before = w.energy[me];
                signalAll(w, rebuild(w));
                return { fired: w[timer][me] > 0, paid: before - w.energy[me], cost: w.config[costKey] };
            };
            expect(fires(0.01).fired).toBe(false); // above 0 is not enough
            expect(fires(threshold - 0.01).fired).toBe(false);
            const above = fires(threshold + 0.01);
            expect(above.fired).toBe(true);
            expect(above.paid).toBeCloseTo(above.cost, 6);
        },
    );

    it('SPLIT has no gene and reads 0 after the brain runs', async () => {
        const { forwardAll } = await import('../../js/sim/brain.js');
        const { w, me } = field();
        w.weights.subarray(0, w.layout.weightCount).fill(0.3);
        brainRow(w, me);
        forwardAll(w);
        expect(w.outputs[me * OUTPUT_COUNT + OUTPUT_INDEX.SPLIT]).toBe(0);
    });
});
