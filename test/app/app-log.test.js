import { describe, expect, it } from 'vitest';
import { appLog } from '../../js/app/app-log.js';

describe('appLog', () => {
    it('writes one record with the level, the event and the fields to the matching console method', () => {
        /** @type {any[]} */
        const calls = [];
        const sink = {
            debug: (/** @type {any} */ r) => calls.push(['debug', r]),
            info: (/** @type {any} */ r) => calls.push(['info', r]),
            warn: (/** @type {any} */ r) => calls.push(['warn', r]),
            error: (/** @type {any} */ r) => calls.push(['error', r]),
        };
        appLog('warn', 'WorkerRestarted', { reason: 'heartbeat', restarts: 2 }, sink);
        appLog('info', 'AudioState', { state: 'on' }, sink);
        appLog('error', 'X', undefined, sink);
        expect(calls).toEqual([
            ['warn', { level: 'warn', event: 'WorkerRestarted', reason: 'heartbeat', restarts: 2 }],
            ['info', { level: 'info', event: 'AudioState', state: 'on' }],
            ['error', { level: 'error', event: 'X' }],
        ]);
    });

    it('rejects an unknown level naming the choices', () => {
        expect(() => appLog(/** @type {any} */ ('fatal'), 'X', {}, {})).toThrow('unknown level "fatal"');
    });

    it('keeps a field named level or event from replacing the record own', () => {
        /** @type {any[]} */
        const calls = [];
        appLog('info', 'E', {}, { info: (/** @type {any} */ r) => calls.push(r) });
        expect(calls[0]).toEqual({ level: 'info', event: 'E' });
    });
});
