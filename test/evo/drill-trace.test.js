import { describe, expect, it } from 'vitest';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { DEATH_CAUSE, EVENT_TYPE, createEventRing, pushEvent } from '../../js/sim/events.js';
import { DRILLS } from '../../js/evo/drill-scenarios.js';
import { createPreyTrace, lostReason, noteTick, traceFields } from '../../js/evo/drill-trace.js';
import { drillSubject } from '../../js/evo/drill.js';
import { referenceSubject } from '../../js/evo/memory-probe-references.js';

const preyAhead = /** @type {any} */ (DRILLS.find((d) => d.name === 'prey-ahead'));

/** @param {Partial<import('../../js/evo/drill-trace.js').PreyTrace>} over */
const traceWith = (over) => ({ ...createPreyTrace(), ...over });

describe('lostReason', () => {
    it('gives each reason in order from a hand-built trace', () => {
        expect(lostReason(traceWith({ biteTicks: 0 }))).toBe('never-bit');
        expect(lostReason(traceWith({ biteTicks: 3, biteJawTicks: 0 }))).toBe('never-in-jaws');
        expect(lostReason(traceWith({ biteTicks: 3, biteJawTicks: 1 }))).toBe('bit-prey-lived');
        expect(lostReason(traceWith({ biteTicks: 3, biteJawTicks: 1, subjectDied: true }))).toBe('bit-prey-lived');
        expect(
            lostReason(
                traceWith({
                    biteTicks: 3,
                    biteJawTicks: 1,
                    preyDied: true,
                    subjectDied: true,
                    subjectStarvedOrRecoiled: true,
                }),
            ),
        ).toBe('subject-starved-or-recoiled-first');
        expect(lostReason(traceWith({ biteTicks: 3, biteJawTicks: 1, preyDied: true }))).toBe('prey-died-unkilled');
    });

    it('takes the earlier reason when several hold', () => {
        expect(lostReason(traceWith({ biteTicks: 0, subjectDied: true }))).toBe('never-bit');
    });
});

describe('traceFields', () => {
    it('has no reason for a won trial and a null closest approach when the two never stood together', () => {
        const fields = traceFields(createPreyTrace(), true);
        expect(fields).toMatchObject({ closest: null, reason: null, preyDied: false });
        expect(traceFields(traceWith({ closest: 2.5 }), false)).toMatchObject({ closest: 2.5, reason: 'never-bit' });
    });
});

describe('noteTick', () => {
    it('keeps the closest approach in summed radii and counts bite ticks out of the jaws', () => {
        const world = {
            alive: [1, 1],
            x: [0, 30],
            y: [0, 0],
            size: [5, 5],
            outputs: new Float32Array(OUTPUT_COUNT),
        };
        world.outputs[OUTPUT_INDEX.BITE] = 1;
        const trace = createPreyTrace();
        noteTick(trace, world);
        expect(trace.closest).toBe(3);
        expect(trace).toMatchObject({ biteTicks: 1, biteJawTicks: 0, jawTicks: 0 });
        expect(world.size).toEqual([5, 5]);
        world.alive[1] = 0;
        noteTick(trace, world);
        expect(trace.preyDied).toBe(true);
        expect(trace.closest).toBe(3);
    });

    it('records starvation and recoil on the subject death tick, and handles a missing event ring', () => {
        const deadWorld = { alive: [0, 1], events: undefined };
        const missing = createPreyTrace();
        noteTick(missing, deadWorld);
        expect(missing.subjectDied).toBe(true);

        const events = createEventRing(3);
        let o = pushEvent(events, EVENT_TYPE.AGENT_DIED, 1);
        events.data[o + 2] = 0;
        events.data[o + 4] = DEATH_CAUSE.STARVED;
        o = pushEvent(events, EVENT_TYPE.HUNTER_RECOIL_LIFE, 1);
        events.data[o + 2] = 0;
        pushEvent(events, EVENT_TYPE.POPULATION_FLOOR, 1);
        expect(events.count).toBe(3);
        const trace = createPreyTrace();
        noteTick(trace, { ...deadWorld, events });
        expect(trace.subjectStarvedOrRecoiled).toBe(true);
    });
});

describe('prey-ahead trace in the drill log', () => {
    /**
     * @param {import('../../js/evo/memory-probe-run.js').Subject} subject a subject
     * @returns {Record<string, any>[]} the DrillTrial records of 3 trials
     */
    function trials(subject) {
        return trialsOf(subject, 3);
    }

    /**
     * @param {import('../../js/evo/memory-probe-run.js').Subject} subject a subject
     * @param {number} count trials
     * @returns {Record<string, any>[]} the DrillTrial records
     */
    function trialsOf(subject, count) {
        /** @type {Record<string, any>[]} */
        const records = [];
        const log = {
            level: /** @type {const} */ ('debug'),
            log: (/** @type {any} */ _l, /** @type {any} */ _e, /** @type {any} */ f) => records.push(f),
        };
        drillSubject(preyAhead, subject, { trials: count, log: /** @type {any} */ (log) });
        return records;
    }

    it('names never-bit for a scripted subject that never bites', () => {
        const idle = {
            name: 'idle',
            id: 1,
            spec: null,
            weights: null,
            act: (/** @type {Record<string, any>} */ world) => world.outputs.fill(0),
        };
        for (const record of trials(idle)) {
            expect(record).toMatchObject({ won: false, reason: 'never-bit', biteTicks: 0 });
            expect(record.closest).toBeGreaterThan(0);
        }
    });

    it('counts ticks with the prey in the jaws, and bites there, for the chasing reference', () => {
        const records = trialsOf(referenceSubject('memoryless'), 12);
        expect(records.some((r) => r.jawTicks > 0 && r.biteJawTicks > 0)).toBe(true);
        expect(records.every((r) => r.biteJawTicks <= r.jawTicks && r.biteJawTicks <= r.biteTicks)).toBe(true);
    });

    it('gives the chasing reference a reason only on the trials it lost, and counts its bites', () => {
        for (const record of trials(referenceSubject('memoryless'))) {
            expect(record.reason === null).toBe(record.won);
            expect(record.biteTicks).toBeGreaterThan(0);
        }
    });
});
