import { describe, expect, it } from 'vitest';
import { DIRECTION, MESSAGE_TYPES, TICKS_PER_SECOND_CHOICES, validateMessage } from '../../js/worker/protocol.js';

/** One good message of every type. */
const GOOD = {
    init: { type: 'init', seed: 7, config: {} },
    reset: { type: 'reset', seed: 8, config: { maxAgents: 10 } },
    setSpeed: { type: 'setSpeed', ticksPerSecond: 240 },
    pause: { type: 'pause' },
    resume: { type: 'resume' },
    step: { type: 'step', ticks: 10 },
    returnBuffer: { type: 'returnBuffer', pool: 'snapshot', buffer: new ArrayBuffer(8) },
    select: { type: 'select', genomeId: 0 },
    setLenses: { type: 'setLenses', rays: true },
    exportArchive: { type: 'exportArchive' },
    flush: { type: 'flush' },
    ready: {
        type: 'ready',
        epoch: 1,
        configHash: 'a',
        rulesHash: 'b',
        layout: {},
        info: {},
        labels: {},
        policy: 'p',
        seed: 3,
    },
    snapshot: { type: 'snapshot', epoch: 1, buffer: new ArrayBuffer(8), tick: 5 },
    stats: { type: 'stats', epoch: 1, stats: { tick: 5, ticksPerSecond: 60 } },
    field: { type: 'field', epoch: 1, tick: 5, buffer: new ArrayBuffer(8) },
    ticker: { type: 'ticker', items: [{ tick: 1, kind: 'elite', text: 'x' }] },
    selection: { type: 'selection', genomeId: 4, state: 'gone' },
    archive: { type: 'archive', json: '{}' },
    log: { type: 'log', record: { level: 'info', event: 'x' } },
    error: { type: 'error', message: 'm', stack: 's', seed: 1, tick: 2, configHash: 'h' },
};

describe('validateMessage', () => {
    it('knows every message type in MESSAGE_TYPES and no other', () => {
        expect(Object.values(MESSAGE_TYPES).sort()).toEqual(Object.keys(GOOD).sort());
    });

    it.each(Object.entries(GOOD))('accepts a well-formed %s message and returns it', (_type, message) => {
        expect(validateMessage(message)).toBe(message);
    });

    it.each(Object.entries(GOOD))(
        'rejects %s when each required field is missing, naming type and field',
        (type, message) => {
            for (const field of Object.keys(message).filter((key) => key !== 'type')) {
                const rest = /** @type {Record<string, any>} */ ({ ...message });
                delete rest[field];
                expect(() => validateMessage(rest)).toThrow(`protocol: ${type}.${field} must be`);
            }
        },
    );

    it('rejects a field of the wrong type with the value it got', () => {
        expect(() => validateMessage({ ...GOOD.select, genomeId: '4' })).toThrow(
            'select.genomeId must be an unsigned integer, got string 4',
        );
        expect(() => validateMessage({ ...GOOD.snapshot, buffer: new Uint8Array(4) })).toThrow(
            'snapshot.buffer must be an ArrayBuffer',
        );
        expect(() => validateMessage({ ...GOOD.setLenses, rays: 1 })).toThrow('setLenses.rays must be a boolean');
        expect(() => validateMessage({ ...GOOD.init, config: null })).toThrow(
            'init.config must be an object, got null',
        );
        expect(() => validateMessage({ ...GOOD.select, genomeId: -1 })).toThrow('select.genomeId');
        expect(() => validateMessage({ ...GOOD.select, genomeId: 1.5 })).toThrow('select.genomeId');
    });

    it('accepts exactly the seven speeds', () => {
        expect(TICKS_PER_SECOND_CHOICES).toEqual([15, 30, 60, 120, 240, 480, 960]);
        for (const ticksPerSecond of TICKS_PER_SECOND_CHOICES) {
            expect(() => validateMessage({ type: 'setSpeed', ticksPerSecond })).not.toThrow();
        }
        expect(() => validateMessage({ type: 'setSpeed', ticksPerSecond: 61 })).toThrow('setSpeed.ticksPerSecond');
    });

    it('rejects a pool, a selection state and ticker items outside their shapes', () => {
        expect(() => validateMessage({ ...GOOD.returnBuffer, pool: 'other' })).toThrow('returnBuffer.pool');
        expect(() => validateMessage({ ...GOOD.selection, state: 'lost' })).toThrow('selection.state');
        expect(() => validateMessage({ type: 'ticker', items: [{ tick: 1, kind: 'x' }] })).toThrow('ticker.items');
        expect(() => validateMessage({ type: 'ticker', items: 'x' })).toThrow('ticker.items');
        expect(() => validateMessage({ ...GOOD.stats, stats: { tick: 1 } })).toThrow('stats.stats');
    });

    it('accepts step only while paused when the receiver says it is running', () => {
        expect(() => validateMessage(GOOD.step, { paused: false })).toThrow('step is accepted only while paused');
        expect(() => validateMessage(GOOD.step, { paused: true })).not.toThrow();
        expect(() => validateMessage(GOOD.step)).not.toThrow();
        expect(() => validateMessage({ type: 'step', ticks: 0 })).toThrow('step.ticks');
        expect(() => validateMessage(GOOD.pause, { paused: false })).not.toThrow();
    });

    it('rejects a message that travels the wrong way', () => {
        expect(() => validateMessage(GOOD.snapshot, { direction: DIRECTION.TO_WORKER })).toThrow(
            'snapshot is a toMain message',
        );
        expect(() => validateMessage(GOOD.pause, { direction: DIRECTION.TO_MAIN })).toThrow(
            'pause is a toWorker message',
        );
        expect(() => validateMessage(GOOD.pause, { direction: DIRECTION.TO_WORKER })).not.toThrow();
    });

    it('rejects a non-object, an unknown type and a missing type', () => {
        expect(() => validateMessage(null)).toThrow('must be an object, got null');
        expect(() => validateMessage([])).toThrow('must be an object, got an array');
        expect(() => validateMessage('pause')).toThrow('got string pause');
        expect(() => validateMessage({ type: 'nope' })).toThrow('unknown message type string nope');
        expect(() => validateMessage({})).toThrow('unknown message type missing');
        expect(() => validateMessage({ type: 'toString' })).toThrow('unknown message type');
    });
});
