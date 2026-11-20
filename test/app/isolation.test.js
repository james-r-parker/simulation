import { describe, expect, it } from 'vitest';
import { ISOLATION_MISSING_TEXT, isolationVerdict, requireIsolation } from '../../js/app/isolation.js';

describe('isolationVerdict', () => {
    it('passes an isolated scope with SharedArrayBuffer', () => {
        expect(isolationVerdict({ crossOriginIsolated: true, SharedArrayBuffer })).toEqual({
            ok: true,
            reason: null,
            crossOriginIsolated: true,
            sharedArrayBuffer: true,
        });
    });

    it('fails a scope that is not isolated, even when SharedArrayBuffer exists', () => {
        const verdict = isolationVerdict({ crossOriginIsolated: false, SharedArrayBuffer });
        expect(verdict).toMatchObject({ ok: false, reason: 'not-isolated', crossOriginIsolated: false });
        expect(verdict.sharedArrayBuffer).toBe(true);
    });

    it('fails a scope that does not say it is isolated', () => {
        expect(isolationVerdict({}).reason).toBe('not-isolated');
    });

    it('fails an isolated scope with no SharedArrayBuffer', () => {
        expect(isolationVerdict({ crossOriginIsolated: true })).toEqual({
            ok: false,
            reason: 'no-shared-array-buffer',
            crossOriginIsolated: true,
            sharedArrayBuffer: false,
        });
    });

    it('reads the real scope the tests run in', () => {
        expect(isolationVerdict(globalThis).sharedArrayBuffer).toBe(true);
    });

    it('has a message that names the missing isolation', () => {
        expect(ISOLATION_MISSING_TEXT).toMatch(/cross-origin isolated/);
    });
});

describe('requireIsolation', () => {
    /**
     * @param {{crossOriginIsolated?: boolean, SharedArrayBuffer?: unknown}} scope the scope to check
     * @returns {{ok: boolean, log: any[], shown: any[]}} the result and what was logged and shown
     */
    function run(scope) {
        const log = /** @type {any[]} */ ([]);
        const shown = /** @type {any[]} */ ([]);
        const ok = requireIsolation({
            scope,
            container: 'box',
            log: (...args) => log.push(args),
            show: (...args) => shown.push(args),
        });
        return { ok, log, shown };
    }

    it('starts quietly when isolated', () => {
        expect(run({ crossOriginIsolated: true, SharedArrayBuffer })).toEqual({ ok: true, log: [], shown: [] });
    });

    it('logs IsolationMissing and shows the card naming isolation when it is missing', () => {
        const { ok, log, shown } = run({ crossOriginIsolated: false });
        expect(ok).toBe(false);
        expect(log).toEqual([
            [
                'error',
                'IsolationMissing',
                { reason: 'not-isolated', crossOriginIsolated: false, sharedArrayBuffer: false },
            ],
        ]);
        expect(shown).toEqual([['box', ISOLATION_MISSING_TEXT]]);
    });
});
