import { describe, expect, it } from 'vitest';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { signalAll } from '../../js/sim/calls.js';
import { ENERGY_SOURCE, addEnergy } from '../../js/sim/energy.js';
import { EVENT_STRIDE, EVENT_TYPE } from '../../js/sim/events.js';
import { HEARD_STRIDE } from '../../js/sim/world.js';
import { addAgent, rebuild, senseWorld } from './helpers/sense-world.js';

const FORAGER = 0;
const PREDATOR = 1;
const OVER = { callRadius: 300, callTicks: 10, alarmCost: 4, huntCallCost: 6, smokeCost: 20, smokeCooldown: 50 };

/**
 * @param {Record<string, any>} [over] config overrides
 * @returns {ReturnType<typeof senseWorld>}
 */
function build(over = {}) {
    return senseWorld({ ...OVER, ...over });
}

/**
 * Adds an agent with energy and an optional specialisation.
 * @param {ReturnType<typeof senseWorld>} w the world
 * @param {{x?: number, y?: number, spec?: number, energy?: number}} [a] where, what and how much energy
 * @returns {number} the slot
 */
function agent(w, { x = 500, y = 500, spec = FORAGER, energy = 100 } = {}) {
    const slot = addAgent(w, x, y, 20);
    w.spec[slot] = spec;
    addEnergy(w, slot, energy, ENERGY_SOURCE.INITIAL);
    return slot;
}

/**
 * @param {ReturnType<typeof senseWorld>} w the world
 * @param {number} slot the agent
 * @param {number} output an `OUTPUT_INDEX` value
 * @param {number} [value] the output value
 * @returns {void}
 */
function setOutput(w, slot, output, value = 1) {
    w.outputs[slot * OUTPUT_COUNT + output] = value;
}

/**
 * @param {ReturnType<typeof senseWorld>} w the world
 * @returns {void}
 */
function run(w) {
    signalAll(w, rebuild(w));
}

/**
 * @param {ReturnType<typeof senseWorld>} w the world
 * @returns {number[][]} the events pushed so far, each as `[type, ...fields]` without the tick
 */
function events(w) {
    return Array.from({ length: w.events.count }, (_v, i) => {
        const o = i * EVENT_STRIDE;
        return [w.events.data[o], ...w.events.data.subarray(o + 2, o + 8)];
    });
}

/**
 * @param {ReturnType<typeof senseWorld>} w the world
 * @param {number} slot the hearer
 * @returns {number[]} its `heard` row
 */
function heard(w, slot) {
    return Array.from(w.heard.subarray(slot * HEARD_STRIDE, (slot + 1) * HEARD_STRIDE));
}

describe('signalAll timers', () => {
    it('takes 1 from each timer above 0 on every tick, and no further than 0', () => {
        const w = build();
        const a = agent(w);
        w.alarmTimer[a] = 3;
        w.huntTimer[a] = 1;
        w.smokeTimer[a] = 0;
        run(w);
        expect([w.alarmTimer[a], w.huntTimer[a], w.smokeTimer[a]]).toEqual([2, 0, 0]);
        run(w);
        expect([w.alarmTimer[a], w.huntTimer[a], w.smokeTimer[a]]).toEqual([1, 0, 0]);
    });

    it('leaves dead slots alone', () => {
        const w = build();
        w.alarmTimer[5] = 4;
        run(w);
        expect(w.alarmTimer[5]).toBe(4);
    });
});

describe('alarm call', () => {
    it('pays alarmCost, starts the timer, deposits danger at the caller and pushes AlarmCalled', () => {
        const w = build();
        const a = agent(w, { x: 250, y: 340 });
        setOutput(w, a, OUTPUT_INDEX.ALARM);
        w.tick = 7;
        run(w);
        expect(w.energy[a]).toBe(96);
        expect(w.alarmTimer[a]).toBe(10);
        expect(w.danger[3 * 10 + 2]).toBe(1);
        expect(events(w)).toEqual([[EVENT_TYPE.ALARM_CALLED, a, w.genomeId[a], FORAGER, 250, 340, 0]]);
        expect(w.events.data[1]).toBe(7);
        expect(w.lastLoss[a]).toBe(1);
        expect(w.ledger[1]).toBe(4);
    });

    it('needs the output above 0', () => {
        const w = build();
        const a = agent(w);
        setOutput(w, a, OUTPUT_INDEX.ALARM, 0);
        run(w);
        expect([w.energy[a], w.events.count]).toEqual([100, 0]);
    });

    it('is not available to a specialisation that can hunt', () => {
        const w = build();
        const a = agent(w, { spec: PREDATOR });
        setOutput(w, a, OUTPUT_INDEX.ALARM);
        run(w);
        expect([w.energy[a], w.alarmTimer[a], w.events.count]).toEqual([100, 0, 0]);
    });

    it('is refused unless the energy exceeds the cost', () => {
        const w = build();
        const a = agent(w, { energy: 4 });
        const b = agent(w, { energy: 4.5, x: 900, y: 900 });
        setOutput(w, a, OUTPUT_INDEX.ALARM);
        setOutput(w, b, OUTPUT_INDEX.ALARM);
        run(w);
        expect([w.energy[a], w.alarmTimer[a]]).toEqual([4, 0]);
        expect([w.energy[b], w.alarmTimer[b]]).toEqual([0.5, 10]);
    });

    it('fires at most once per callTicks', () => {
        const w = build();
        const a = agent(w);
        setOutput(w, a, OUTPUT_INDEX.ALARM);
        let fired = 0;
        for (let tick = 0; tick < 25; tick++) {
            w.events.count = 0;
            run(w);
            fired += w.events.count;
        }
        expect(fired).toBe(3);
        expect(w.energy[a]).toBe(100 - 3 * 4);
    });

    it('fires again on the tick the timer reaches 0', () => {
        const w = build();
        const a = agent(w);
        setOutput(w, a, OUTPUT_INDEX.ALARM);
        const ticks = [];
        for (let tick = 0; tick < 12; tick++) {
            w.events.count = 0;
            run(w);
            if (w.events.count > 0) {
                ticks.push(tick);
            }
        }
        expect(ticks).toEqual([0, 10]);
    });
});

describe('hunt call', () => {
    it('pays huntCallCost, starts the timer, deposits on the hunt grid and pushes PackCalled', () => {
        const w = build();
        const a = agent(w, { spec: PREDATOR, x: 250, y: 340 });
        setOutput(w, a, OUTPUT_INDEX.HUNT);
        run(w);
        expect(w.energy[a]).toBe(94);
        expect(w.huntTimer[a]).toBe(10);
        expect([w.hunt[3 * 10 + 2], w.danger[3 * 10 + 2]]).toEqual([1, 0]);
        expect(events(w)).toEqual([[EVENT_TYPE.PACK_CALLED, a, w.genomeId[a], PREDATOR, 250, 340, 0]]);
    });

    it('is not available to a specialisation that cannot hunt', () => {
        const w = build();
        const a = agent(w, { spec: FORAGER });
        setOutput(w, a, OUTPUT_INDEX.HUNT);
        run(w);
        expect([w.energy[a], w.huntTimer[a], w.events.count]).toEqual([100, 0, 0]);
    });

    it('is refused at or below the cost and while the timer runs', () => {
        const w = build();
        const a = agent(w, { spec: PREDATOR, energy: 6 });
        setOutput(w, a, OUTPUT_INDEX.HUNT);
        run(w);
        expect(w.events.count).toBe(0);
        const b = agent(w, { spec: PREDATOR, x: 900, y: 900 });
        setOutput(w, b, OUTPUT_INDEX.HUNT);
        run(w);
        run(w);
        expect([w.events.count, w.energy[b]]).toEqual([1, 94]);
    });
});

describe('smoke release', () => {
    it('pays smokeCost, starts the cooldown, releases a cloud and pushes SmokeReleased', () => {
        const w = build({ smokeRadius: 80 });
        const a = agent(w, { x: 500, y: 400 });
        w.angle[a] = 0;
        setOutput(w, a, OUTPUT_INDEX.SMOKE, 0.9);
        run(w);
        expect([w.energy[a], w.smokeTimer[a], w.cloudCount]).toEqual([80, 50, 1]);
        expect(w.cloudX[0]).toBeCloseTo(500 - (w.size[a] + 80), 4);
        expect(w.cloudY[0]).toBeCloseTo(400, 4);
        expect(events(w)).toEqual([[EVENT_TYPE.SMOKE_RELEASED, a, w.genomeId[a], FORAGER, 500, 400, 0]]);
    });

    it('records the cloud index', () => {
        const w = build();
        const a = agent(w);
        const b = agent(w, { x: 800, y: 800 });
        setOutput(w, a, OUTPUT_INDEX.SMOKE, 0.9);
        setOutput(w, b, OUTPUT_INDEX.SMOKE, 0.9);
        run(w);
        expect(events(w).map((e) => [e[1], e[6]])).toEqual([
            [a, 0],
            [b, 1],
        ]);
    });

    it('needs the output above smokeThreshold', () => {
        const w = build();
        const a = agent(w);
        setOutput(w, a, OUTPUT_INDEX.SMOKE, 0.79);
        run(w);
        expect([w.cloudCount, w.energy[a], w.smokeTimer[a]]).toEqual([0, 100, 0]);
        setOutput(w, a, OUTPUT_INDEX.SMOKE, 0.81);
        run(w);
        expect(w.cloudCount).toBe(1);
    });

    it('is open to a specialisation that can hunt', () => {
        const w = build();
        const a = agent(w, { spec: PREDATOR });
        setOutput(w, a, OUTPUT_INDEX.SMOKE, 1);
        run(w);
        expect(w.cloudCount).toBe(1);
    });

    it('is refused unless the energy exceeds the cost, and during the cooldown', () => {
        const w = build();
        const poor = agent(w, { energy: 20 });
        setOutput(w, poor, OUTPUT_INDEX.SMOKE, 1);
        run(w);
        expect(w.cloudCount).toBe(0);
        const a = agent(w, { x: 800, y: 800 });
        setOutput(w, a, OUTPUT_INDEX.SMOKE, 1);
        run(w);
        run(w);
        expect([w.cloudCount, w.energy[a]]).toEqual([1, 80]);
    });

    it('pays nothing and pushes SmokeRefused when the pool is full, but still starts the cooldown', () => {
        const w = build({ maxClouds: 1 });
        const a = agent(w);
        const b = agent(w, { x: 800, y: 800 });
        setOutput(w, a, OUTPUT_INDEX.SMOKE, 1);
        setOutput(w, b, OUTPUT_INDEX.SMOKE, 1);
        run(w);
        expect(w.cloudCount).toBe(1);
        expect([w.energy[b], w.smokeTimer[b]]).toEqual([100, 50]);
        expect(events(w)).toEqual([
            [EVENT_TYPE.SMOKE_RELEASED, a, w.genomeId[a], FORAGER, 500, 500, 0],
            [EVENT_TYPE.SMOKE_REFUSED, b, w.genomeId[b], 0, 0, 0, 0],
        ]);
    });
});

describe('hearing', () => {
    it('gives a hearer the loudness (1 - d / callRadius) x timer / callTicks and the unit vector to the caller', () => {
        const w = build();
        const caller = agent(w, { x: 500, y: 500 });
        const hearer = agent(w, { x: 500, y: 350 });
        setOutput(w, caller, OUTPUT_INDEX.ALARM);
        run(w);
        expect(heard(w, hearer)).toEqual([0.5, 0, 1, 0, 0, 0].map(Math.fround));
        expect(heard(w, caller)).toEqual([0, 0, 0, 0, 0, 0]);
    });

    it('scales a call by the time left on the caller timer', () => {
        const w = build();
        const caller = agent(w, { x: 500, y: 500 });
        const hearer = agent(w, { x: 350, y: 500 });
        w.alarmTimer[caller] = 6;
        run(w);
        expect(heard(w, hearer)[0]).toBeCloseTo(0.5 * (5 / 10), 6);
        expect(heard(w, hearer).slice(1, 3)).toEqual([1, 0]);
    });

    it('hears nothing from an agent at or beyond callRadius', () => {
        const w = build();
        const caller = agent(w, { x: 100, y: 500 });
        const far = agent(w, { x: 400, y: 500 });
        const near = agent(w, { x: 399, y: 500 });
        setOutput(w, caller, OUTPUT_INDEX.ALARM);
        run(w);
        expect(heard(w, far)).toEqual([0, 0, 0, 0, 0, 0]);
        expect(heard(w, near)[0]).toBeGreaterThan(0);
    });

    it('stores the loudest of several callers, and the lower slot on a tie', () => {
        const w = build();
        const far = agent(w, { x: 500, y: 200 });
        const near = agent(w, { x: 500, y: 400 });
        const hearer = agent(w, { x: 500, y: 500 });
        w.alarmTimer[far] = 10;
        w.alarmTimer[near] = 10;
        run(w);
        expect(heard(w, hearer).slice(0, 3)).toEqual([(1 - 100 / 300) * (9 / 10), 0, -1].map(Math.fround));
        const tied = build();
        const left = agent(tied, { x: 400, y: 500 });
        const right = agent(tied, { x: 600, y: 500 });
        const middle = agent(tied, { x: 500, y: 500 });
        tied.alarmTimer[left] = 10;
        tied.alarmTimer[right] = 10;
        run(tied);
        expect(heard(tied, middle).slice(1, 3)).toEqual([-1, 0]);
        expect([left, right, middle]).toEqual([0, 1, 2]);
    });

    it('takes a caller at distance 0 as unit vector (0, 0)', () => {
        const w = build();
        const caller = agent(w);
        const hearer = agent(w);
        w.huntTimer[caller] = 10;
        run(w);
        expect(heard(w, hearer)).toEqual([0, 0, 0, Math.fround(0.9), 0, 0]);
    });

    it('keeps alarm and hunt calls in their own halves of the row', () => {
        const w = build();
        const alarmer = agent(w, { x: 500, y: 400 });
        const hunter = agent(w, { x: 400, y: 500, spec: PREDATOR });
        const hearer = agent(w, { x: 500, y: 500 });
        w.alarmTimer[alarmer] = 10;
        w.huntTimer[hunter] = 10;
        run(w);
        const row = heard(w, hearer);
        expect(row[0]).toBeGreaterThan(0);
        expect(row.slice(1, 3)).toEqual([0, -1]);
        expect(row[3]).toBeGreaterThan(0);
        expect(row.slice(4, 6)).toEqual([-1, 0]);
    });

    it('rebuilds heard every tick', () => {
        const w = build();
        const caller = agent(w, { x: 500, y: 500 });
        const hearer = agent(w, { x: 500, y: 400 });
        w.alarmTimer[caller] = 1;
        run(w);
        expect(heard(w, hearer)[0]).toBe(0);
        w.heard[hearer * HEARD_STRIDE] = 0.7;
        run(w);
        expect(heard(w, hearer)[0]).toBe(0);
    });

    it('hears a call from the tick it is made, at full loudness', () => {
        const w = build();
        const caller = agent(w, { x: 500, y: 500 });
        const hearer = agent(w, { x: 500, y: 500 - 150 });
        setOutput(w, caller, OUTPUT_INDEX.ALARM);
        run(w);
        expect(heard(w, hearer)[0]).toBe(0.5);
    });

    it('does not let an agent outside the hash hear, as a newborn is not hashed until the next tick', () => {
        const w = build();
        const caller = agent(w, { x: 500, y: 500 });
        w.alarmTimer[caller] = 10;
        const hash = rebuild(w);
        const newborn = agent(w, { x: 500, y: 450 });
        signalAll(w, hash);
        expect(heard(w, newborn)).toEqual([0, 0, 0, 0, 0, 0]);
        run(w);
        expect(heard(w, newborn)[0]).toBeGreaterThan(0);
    });

    it('finds hearers across hash cells', () => {
        const w = build({ hashCellSize: 128 });
        const caller = agent(w, { x: 127, y: 127 });
        const hearer = agent(w, { x: 129, y: 400 });
        w.alarmTimer[caller] = 10;
        run(w);
        expect(heard(w, hearer)[0]).toBeGreaterThan(0);
    });
});
