import { describe, expect, it } from 'vitest';
import { checkCount, sleep, waitForChecks } from '../scripts/lib/ship-wait.mjs';

const ok = (stdout = '') => ({ status: 0, stdout, stderr: '' });
const noChecks = () => ({ status: 1, stdout: '', stderr: "no checks reported on the 'feat/x' branch" });
const two = ok(JSON.stringify([{ name: 'static' }, { name: 'check' }]));

/**
 * @param {any[]} answers what each `gh pr checks` call returns, in order; the last one repeats
 * @returns {{sh: any, calls: string[]}} a fake sh and its call log
 */
function scripted(answers) {
    /** @type {string[]} */
    const calls = [];
    const sh = (/** @type {string} */ cmd, /** @type {string[]} */ args) => {
        calls.push(`${cmd} ${args.join(' ')}`);
        return answers[Math.min(calls.length - 1, answers.length - 1)];
    };
    return { sh, calls };
}

describe('checkCount', () => {
    it('counts the checks gh lists for the pull request', () => {
        const { sh, calls } = scripted([two]);
        expect(checkCount(sh, 9)).toBe(2);
        expect(calls).toEqual(['gh pr checks 9 --json state']);
    });

    it('reads "no checks reported", an empty list or unreadable output as none', () => {
        expect(checkCount(scripted([noChecks()]).sh, 9)).toBe(0);
        expect(checkCount(scripted([ok('[]')]).sh, 9)).toBe(0);
        expect(checkCount(scripted([ok('not json')]).sh, 9)).toBe(0);
        expect(checkCount(scripted([ok('{"name":"x"}')]).sh, 9)).toBe(0);
    });
});

describe('waitForChecks', () => {
    it('returns at once, without pausing, when checks are already registered', () => {
        /** @type {number[]} */
        const pauses = [];
        expect(waitForChecks(scripted([two]).sh, 9, { pause: (s) => pauses.push(s) })).toBe(true);
        expect(pauses).toEqual([]);
    });

    it('keeps looking while GitHub has not registered the checks yet, as right after gh pr create', () => {
        /** @type {number[]} */
        const pauses = [];
        const { sh, calls } = scripted([noChecks(), ok('[]'), two]);
        expect(waitForChecks(sh, 9, { graceS: 60, pollS: 5, pause: (s) => pauses.push(s) })).toBe(true);
        expect(calls).toHaveLength(3);
        expect(pauses).toEqual([5, 5]);
    });

    it('gives up after the grace period, since an empty check list is not a pass', () => {
        /** @type {number[]} */
        const pauses = [];
        const { sh, calls } = scripted([noChecks()]);
        expect(waitForChecks(sh, 9, { graceS: 20, pollS: 5, pause: (s) => pauses.push(s) })).toBe(false);
        expect(pauses).toEqual([5, 5, 5, 5]);
        expect(calls).toHaveLength(5);
    });
});

describe('sleep', () => {
    it('blocks for about the given time', () => {
        const start = Date.now();
        sleep(0.02);
        expect(Date.now() - start).toBeGreaterThanOrEqual(15);
    });
});
