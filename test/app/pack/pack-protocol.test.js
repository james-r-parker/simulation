import { describe, expect, it } from 'vitest';
import { PACK_MESSAGES, validatePackMessage } from '../../../js/app/pack/pack-protocol.js';

/** @returns {Record<string, any>} a valid `packInit` */
function init() {
    return {
        type: PACK_MESSAGES.INIT,
        epoch: 2,
        info: { maxAgents: 8, specs: [] },
        layout: { flags: {}, stateBits: {} },
        ring: new SharedArrayBuffer(8),
        slotBytes: 64,
        slots: new SharedArrayBuffer(8),
        stores: new SharedArrayBuffer(8),
        causeNames: ['STARVED'],
    };
}

describe('validatePackMessage', () => {
    it('accepts a packInit going to the worker and packReady and packError coming back', () => {
        expect(validatePackMessage(init(), { direction: 'toWorker' }).epoch).toBe(2);
        expect(validatePackMessage({ type: PACK_MESSAGES.READY, epoch: 1 }, { direction: 'fromWorker' }).type).toBe(
            'packReady',
        );
        const error = { type: PACK_MESSAGES.ERROR, epoch: 1, message: 'boom', stack: '' };
        expect(validatePackMessage(error, { direction: 'fromWorker' })).toBe(error);
        expect(validatePackMessage(init())).toBeTruthy();
    });

    it.each([
        ['info', { info: { maxAgents: 0, specs: [] } }],
        ['info', { info: null }],
        ['info', { info: { maxAgents: 8, specs: 'x' } }],
        ['layout', { layout: { flags: {} } }],
        ['ring', { ring: new ArrayBuffer(8) }],
        ['slotBytes', { slotBytes: 0 }],
        ['slots', { slots: {} }],
        ['stores', { stores: null }],
        ['causeNames', { causeNames: [1] }],
        ['causeNames', { causeNames: 'STARVED' }],
        ['epoch', { epoch: -1 }],
    ])('refuses a packInit with a bad %s', (name, patch) => {
        expect(() => validatePackMessage({ ...init(), ...patch })).toThrow(new RegExp(`packInit.${name}`));
    });

    it('refuses what is not a message, an unknown type and a message travelling the wrong way', () => {
        expect(() => validatePackMessage(null)).toThrow(/must be an object/);
        expect(() => validatePackMessage([])).toThrow(/must be an object, got an array/);
        expect(() => validatePackMessage({ type: 'toString' })).toThrow(/unknown message type/);
        expect(() => validatePackMessage({ type: 'nope' })).toThrow(/unknown message type/);
        expect(() => validatePackMessage(init(), { direction: 'fromWorker' })).toThrow(/travels toWorker/);
        expect(() => validatePackMessage({ type: PACK_MESSAGES.READY, epoch: 1 }, { direction: 'toWorker' })).toThrow(
            /travels fromWorker/,
        );
    });

    it('refuses a packError without its message and stack', () => {
        expect(() => validatePackMessage({ type: PACK_MESSAGES.ERROR, epoch: 1, message: 1, stack: '' })).toThrow(
            /packError.message/,
        );
        expect(() => validatePackMessage({ type: PACK_MESSAGES.ERROR, epoch: 1, message: '' })).toThrow(
            /packError.stack/,
        );
    });
});
