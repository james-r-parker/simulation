import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compareMutation, listSurvivors, raiseMutation, scoreScopes } from '../scripts/lib/mutation-score.mjs';
import { compareScopes, main, measureScopes, raiseBaseline } from '../scripts/quality-ratchet.mjs';

/**
 * @param {number} covered covered count
 * @param {number} total total count
 * @returns {{covered: number, total: number}} counts
 */
const counts = (covered, total) => ({ covered, total });
/**
 * @param {{covered: number, total: number}} lines counts used for every metric
 * @param {{covered: number, total: number}} [branches] branch counts
 * @returns {Record<string, {covered: number, total: number}>} a coverage-summary entry
 */
const file = (lines, branches = lines) => ({
    lines,
    branches,
    functions: lines,
    statements: lines,
});

describe('compareScopes', () => {
    const baseline = { coverage: { 'js/sim': { lines: 90 } } };

    it('fails a drop past the tolerance, naming scope, metric, baseline and measured', () => {
        const [message] = compareScopes({ 'js/sim': { lines: 89.8 } }, baseline);
        expect(message).toContain('js/sim');
        expect(message).toContain('lines');
        expect(message).toContain('baseline');
        expect(message).toContain('90.00');
        expect(message).toContain('89.80');
    });

    it('passes a drop within the tolerance', () => {
        expect(compareScopes({ 'js/sim': { lines: 89.95 } }, baseline)).toEqual([]);
    });

    it('passes a rise', () => {
        expect(compareScopes({ 'js/sim': { lines: 95 } }, baseline)).toEqual([]);
    });

    it('fails a floor only when the scope has code', () => {
        const floors = { floors: { 'js/evo': { lines: 90 } } };
        expect(compareScopes({}, floors)).toEqual([]);
        expect(compareScopes({ 'js/evo': { lines: 50 } }, floors)).toHaveLength(1);
    });
});

describe('measureScopes', () => {
    it('sums covered and total across files rather than averaging percentages', () => {
        const summary = {
            total: file(counts(0, 0)),
            '/repo/js/sim/a.js': file(counts(1, 1)),
            '/repo/js/sim/b.js': file(counts(1, 9)),
            '/repo/test/x.js': file(counts(0, 100)),
        };
        expect(measureScopes(summary, '/repo')['js/sim'].lines).toBeCloseTo(20);
        expect(measureScopes(summary, '/repo')['js/evo']).toBeUndefined();
    });
});

describe('raiseBaseline', () => {
    it('raises a baseline, never lowers one, and keeps the other keys in order', () => {
        const baseline = { coverage: { 'js/sim': { lines: 80, branches: 70 } }, floors: { a: 1 }, mutation: {} };
        const raised = raiseBaseline({ 'js/sim': { lines: 85, branches: 60 } }, baseline);
        expect(raised.coverage['js/sim']).toEqual({ lines: 85, branches: 70 });
        expect(Object.keys(raised)).toEqual(['coverage', 'floors', 'mutation']);
        expect(baseline.coverage['js/sim'].lines).toBe(80);
    });
});

describe('main --check', () => {
    it('fails naming the path of a missing summary', () => {
        const root = mkdtempSync(join(tmpdir(), 'ratchet-'));
        mkdirSync(join(root, 'scripts'));
        writeFileSync(join(root, 'scripts/quality-baseline.json'), '{}');
        /** @type {string[]} */
        const errors = [];
        const original = console.error;
        console.error = (message) => errors.push(message);
        try {
            expect(main(['--check'], root)).toBe(1);
        } finally {
            console.error = original;
        }
        expect(errors.join('\n')).toContain(join(root, 'coverage/coverage-summary.json'));
    });
});

describe('mutation score', () => {
    /**
     * @param {string} status mutant status
     * @param {number} [line] source line
     * @returns {{status: string, mutatorName: string, location: {start: {line: number}}}} a mutant
     */
    const mutant = (status, line = 1) => ({
        status,
        mutatorName: 'ConditionalExpression',
        location: { start: { line } },
    });
    const report = {
        files: {
            'js/sim/a.js': {
                mutants: [
                    mutant('Killed'),
                    mutant('Timeout'),
                    mutant('Survived', 7),
                    mutant('NoCoverage', 9),
                    mutant('Ignored'),
                ],
            },
            'js/sim/b.js': { mutants: [mutant('Killed'), mutant('CompileError')] },
            'js/evo/c.js': { mutants: [mutant('Killed')] },
            'js/other.js': { mutants: [mutant('Survived')] },
        },
    };

    it('scores detected over detected plus undetected, summed per scope', () => {
        const scores = scoreScopes(report);
        expect(scores['js/sim']).toBeCloseTo(60);
        expect(scores['js/evo']).toBe(100);
        expect(Object.keys(scores)).toEqual(['js/sim', 'js/evo']);
    });

    it('fails a drop past the tolerance and lists the survivors by file, line and mutator', () => {
        const messages = compareMutation(scoreScopes(report), { mutation: { 'js/sim': 70 } }, listSurvivors(report));
        expect(messages[0]).toContain('js/sim mutation score');
        expect(messages[0]).toContain('70.00');
        expect(messages[0]).toContain('60.00');
        expect(messages).toContain('surviving mutant: js/sim/a.js:7 ConditionalExpression');
    });

    it('lists at most 20 survivors', () => {
        const many = { files: { 'js/sim/a.js': { mutants: Array.from({ length: 30 }, () => mutant('Survived')) } } };
        expect(listSurvivors(many)).toHaveLength(20);
    });

    it('passes a drop within the tolerance and a rise', () => {
        expect(compareMutation({ 'js/sim': 69.95 }, { mutation: { 'js/sim': 70 } }, [])).toEqual([]);
        expect(compareMutation({ 'js/sim': 80 }, { mutation: { 'js/sim': 70 } }, [])).toEqual([]);
    });

    it('raises a baseline, never lowers one, and keeps the other keys', () => {
        const baseline = { coverage: {}, mutation: { 'js/sim': 70, 'js/evo': 50 } };
        const raised = raiseMutation({ 'js/sim': 60, 'js/evo': 55.559 }, baseline);
        expect(raised.mutation).toEqual({ 'js/sim': 70, 'js/evo': 55.55 });
        expect(Object.keys(raised)).toEqual(['coverage', 'mutation']);
    });
});

describe('main --mutation', () => {
    it('rejects an unknown extra argument and names the path of a missing report', () => {
        const root = mkdtempSync(join(tmpdir(), 'ratchet-'));
        mkdirSync(join(root, 'scripts'));
        writeFileSync(join(root, 'scripts/quality-baseline.json'), '{}');
        /** @type {string[]} */
        const errors = [];
        const original = console.error;
        console.error = (message) => errors.push(message);
        try {
            expect(main(['--check', '--bogus'], root)).toBe(2);
            expect(main(['--check', '--mutation'], root)).toBe(1);
        } finally {
            console.error = original;
        }
        expect(errors.join('\n')).toContain(join(root, 'reports/mutation/mutation.json'));
    });
});

describe('main end to end', () => {
    /**
     * @param {{baseline: object, report?: object}} files what to put in a throwaway repo root
     * @returns {string} the root
     */
    function repo({ baseline, report }) {
        const root = mkdtempSync(join(tmpdir(), 'ratchet-'));
        mkdirSync(join(root, 'scripts'));
        writeFileSync(join(root, 'scripts/quality-baseline.json'), JSON.stringify(baseline));
        if (report) {
            mkdirSync(join(root, 'reports/mutation'), { recursive: true });
            writeFileSync(join(root, 'reports/mutation/mutation.json'), JSON.stringify(report));
        }
        return root;
    }

    /**
     * @param {() => number} run the call to make
     * @returns {{status: number, errors: string[]}} its exit status and what it printed to stderr
     */
    function quietly(run) {
        /** @type {string[]} */
        const errors = [];
        const original = console.error;
        console.error = (message) => errors.push(message);
        try {
            return { status: run(), errors };
        } finally {
            console.error = original;
        }
    }

    const summaryAt = (/** @type {string} */ root, /** @type {number} */ covered) => ({
        total: file(counts(1, 1)),
        [join(root, 'js/sim/a.js')]: file(counts(covered, 10)),
    });

    it('--check passes a coverage at its baseline and prints nothing', () => {
        const root = repo({ baseline: { coverage: { 'js/sim': { lines: 80 } } } });
        mkdirSync(join(root, 'coverage'));
        writeFileSync(join(root, 'coverage/coverage-summary.json'), JSON.stringify(summaryAt(root, 8)));
        expect(quietly(() => main(['--check'], root))).toEqual({ status: 0, errors: [] });
    });

    it('--check fails a coverage below its baseline, printing the message for each metric', () => {
        const root = repo({ baseline: { coverage: { 'js/sim': { lines: 90, branches: 90 } } } });
        mkdirSync(join(root, 'coverage'));
        writeFileSync(join(root, 'coverage/coverage-summary.json'), JSON.stringify(summaryAt(root, 5)));
        const { status, errors } = quietly(() => main(['--check'], root));
        expect(status).toBe(1);
        expect(errors).toHaveLength(2);
        expect(errors[0]).toContain('js/sim lines coverage is below its baseline: baseline 90.00%, measured 50.00%');
    });

    it('--write raises the coverage baseline to the measure and keeps what is higher', () => {
        const root = repo({ baseline: { coverage: { 'js/sim': { lines: 40, branches: 99 } } } });
        mkdirSync(join(root, 'coverage'));
        writeFileSync(join(root, 'coverage/coverage-summary.json'), JSON.stringify(summaryAt(root, 7)));
        expect(quietly(() => main(['--write'], root)).status).toBe(0);
        const written = JSON.parse(readFileSync(join(root, 'scripts/quality-baseline.json'), 'utf8'));
        expect(written.coverage['js/sim']).toMatchObject({ lines: 70, branches: 99 });
    });

    it('rejects a missing mode with the usage line', () => {
        const root = repo({ baseline: {} });
        const { status, errors } = quietly(() => main([], root));
        expect([status, errors]).toEqual([2, ['usage: quality-ratchet.mjs --check | --write [--mutation]']]);
    });

    const survivor = { status: 'Survived', mutatorName: 'ConditionalExpression', location: { start: { line: 4 } } };
    const killed = { ...survivor, status: 'Killed' };

    it('--check --mutation fails a score below its baseline and lists the survivors', () => {
        const report = { files: { 'js/sim/a.js': { mutants: [killed, survivor] } } };
        const root = repo({ baseline: { mutation: { 'js/sim': 80 } }, report });
        const { status, errors } = quietly(() => main(['--check', '--mutation'], root));
        expect(status).toBe(1);
        expect(errors).toEqual([
            'js/sim mutation score is below its baseline: baseline 80.00%, measured 50.00%',
            'surviving mutant: js/sim/a.js:4 ConditionalExpression',
        ]);
    });

    it('--check --mutation passes a score at its baseline', () => {
        const report = { files: { 'js/sim/a.js': { mutants: [killed, survivor] } } };
        const root = repo({ baseline: { mutation: { 'js/sim': 50 } }, report });
        expect(quietly(() => main(['--check', '--mutation'], root))).toEqual({ status: 0, errors: [] });
    });

    it('--write --mutation raises the mutation baseline to the score', () => {
        const report = { files: { 'js/sim/a.js': { mutants: [killed, killed, killed, survivor] } } };
        const root = repo({ baseline: { mutation: { 'js/sim': 10 } }, report });
        expect(quietly(() => main(['--write', '--mutation'], root)).status).toBe(0);
        const written = JSON.parse(readFileSync(join(root, 'scripts/quality-baseline.json'), 'utf8'));
        expect(written.mutation).toEqual({ 'js/sim': 75 });
    });
});
