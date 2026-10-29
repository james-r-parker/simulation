import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkFiles, checkFlagLedger, configKeys, statusOf } from '../scripts/check-flag-ledger.mjs';

const RULES = { alpha: { type: 'bool' }, mode: { type: 'enum' }, count: { type: 'int' } };
const SPEC_RULES = { canHunt: { type: 'bool' }, reach: { type: 'num' } };
const KEYS = configKeys(RULES, SPEC_RULES);

/**
 * @param {Record<string, any>} over fields to replace
 * @returns {Record<string, any>} a ledger entry for a planned switch
 */
const entry = (over = {}) => ({ key: 'alpha', plan: 'p.md', task: 'T1', reason: 'the control arm', ...over });
const PERMANENT = (/** @type {string} */ key) => ({
    key,
    plan: null,
    task: null,
    reason: 'permanent: a policy choice',
});
const COMPLETE = [entry(), entry({ key: 'mode' }), PERMANENT('specialisations.canHunt')];

/**
 * @param {unknown} ledger the ledger
 * @param {Record<string, string | null | undefined>} [plans] plan path to status text
 * @returns {string[]} the problems
 */
function check(ledger, plans = { 'p.md': 'In progress - phase 1' }) {
    return checkFlagLedger({ keys: KEYS, ledger, statusOfPlan: (plan) => plans[plan] });
}

describe('configKeys', () => {
    it('lists the boolean and enum rules as switches, a specialisation field as specialisations.<field>', () => {
        expect(KEYS.switches).toEqual(['alpha', 'mode', 'specialisations.canHunt']);
        expect([...KEYS.all]).toEqual(['alpha', 'mode', 'count', 'specialisations.canHunt', 'specialisations.reach']);
    });

    it('reads the real config rules: every switch of today is a boolean or an enum', () => {
        const real = configKeys();
        expect(real.switches).toContain('capBirthsEnabled');
        expect(real.switches).toContain('specialisations.canHunt');
        expect(real.switches).not.toContain('maxAgents');
    });
});

describe('statusOf', () => {
    it('reads the first status line', () => {
        expect(statusOf('# Plan\n\n**Status:** Built - all phases\nbody\n**Status:** Proposed')).toBe(
            'Built - all phases',
        );
    });

    it('is null without a status line', () => {
        expect(statusOf('# Plan\nno status')).toBeNull();
    });
});

describe('checkFlagLedger', () => {
    it('accepts a ledger with every switch, a planned entry and a permanent one', () => {
        expect(check(COMPLETE)).toEqual([]);
    });

    it('fails a boolean or enum rule that is missing', () => {
        expect(check([entry(), PERMANENT('specialisations.canHunt')])).toEqual([
            'mode: a boolean or enum rule with no ledger entry - add { key, plan, task, reason }',
        ]);
    });

    it('does not ask for a numeric rule', () => {
        expect(check(COMPLETE).join()).not.toContain('count');
    });

    it('fails an entry that names a key that no longer exists', () => {
        expect(check([...COMPLETE, entry({ key: 'gone' })])).toEqual([
            'gone: no such config key any more - remove the entry',
        ]);
    });

    it('accepts a numeric knob in the ledger while it exists', () => {
        expect(check([...COMPLETE, entry({ key: 'count' })])).toEqual([]);
    });

    it('fails a plan that is built while the key still exists', () => {
        const plans = { 'p.md': 'Built - phase 1 and 2' };
        expect(check(COMPLETE, plans)).toEqual([
            'alpha: plan p.md is built (Built) but the key still exists',
            'mode: plan p.md is built (Built) but the key still exists',
        ]);
    });

    it('treats an Implemented plan as built, and Proposed, In progress and a missing status as open', () => {
        expect(check(COMPLETE, { 'p.md': 'Implemented - done' })).toHaveLength(2);
        for (const status of ['Proposed', 'In progress - half', null]) {
            expect(check(COMPLETE, { 'p.md': status })).toEqual([]);
        }
    });

    it('fails a plan file that is not there', () => {
        expect(check(COMPLETE, {})).toEqual(['alpha: plan p.md does not exist', 'mode: plan p.md does not exist']);
    });

    it('does not read the plan of a permanent entry', () => {
        expect(check([...COMPLETE.slice(0, 2), PERMANENT('specialisations.canHunt')])).toEqual([]);
    });

    it.each([
        [{ reason: '' }, 'alpha: reason is empty - say why the switch stays, or why it is permanent'],
        [
            { task: null },
            'alpha: plan and task are both set (the task that deletes the losing path) or both null (permanent)',
        ],
        [
            { plan: null },
            'alpha: plan and task are both set (the task that deletes the losing path) or both null (permanent)',
        ],
        [{ key: '' }, 'entry 0 has no key'],
    ])('fails a malformed entry %j', (over, message) => {
        expect(check([entry(over)])[0]).toBe(message);
    });

    it('fails an entry that is not an object, a duplicate key and a ledger that is not an array', () => {
        expect(check(['alpha'])[0]).toBe('entry 0 is not an object');
        expect(check([...COMPLETE, entry()])).toEqual(['alpha: listed twice']);
        expect(check({ alpha: 1 })).toEqual(['the ledger is not an array of { key, plan, task, reason }']);
    });
});

describe('checkFiles', () => {
    it('holds for the committed ledger: every switch listed, no key gone, no built plan', () => {
        expect(checkFiles()).toEqual([]);
    });

    it('reads the plans from the root and the ledger from the path', () => {
        const dir = mkdtempSync(join(tmpdir(), 'flag-ledger-'));
        try {
            mkdirSync(join(dir, 'docs'));
            writeFileSync(join(dir, 'docs/plan.md'), '# P\n\n**Status:** Built - done\n');
            const path = join(dir, 'ledger.json');
            writeFileSync(
                path,
                JSON.stringify([{ key: 'capBirthsEnabled', plan: 'docs/plan.md', task: 'T1', reason: 'r' }]),
            );
            const problems = checkFiles(path, pathToFileURL(`${dir}/`));
            expect(problems).toContain('capBirthsEnabled: plan docs/plan.md is built (Built) but the key still exists');
            expect(problems.some((line) => line.startsWith('floorRescueAtZero: a boolean or enum rule'))).toBe(true);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('names an unreadable or invalid ledger', () => {
        const dir = mkdtempSync(join(tmpdir(), 'flag-ledger-'));
        try {
            const path = join(dir, 'ledger.json');
            writeFileSync(path, '{ nope');
            expect(checkFiles(path)[0]).toContain(path);
            expect(checkFiles(join(dir, 'missing.json'))[0]).toContain('missing.json');
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});

describe('the command line', () => {
    it('prints one flag-ledger line per problem and exits 1, and exits 0 on the committed ledger', () => {
        const dir = mkdtempSync(join(tmpdir(), 'flag-ledger-'));
        try {
            const path = join(dir, 'ledger.json');
            writeFileSync(path, '[]');
            const bad = spawnSync('node', ['scripts/check-flag-ledger.mjs', path], { encoding: 'utf8' });
            expect(bad.status).toBe(1);
            expect(bad.stdout).toContain('flag-ledger: capBirthsEnabled: a boolean or enum rule with no ledger entry');
            const good = spawnSync('node', ['scripts/check-flag-ledger.mjs'], { encoding: 'utf8' });
            expect([good.status, good.stdout]).toEqual([0, '']);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});
