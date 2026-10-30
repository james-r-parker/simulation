import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint({ cwd: new URL('../../', import.meta.url).pathname });

/**
 * @param {string} code the source to lint
 * @param {string} filePath the path it pretends to live at
 * @returns {Promise<string[]>} the messages of the no-restricted-syntax errors
 */
async function errorsOf(code, filePath) {
    const [result] = await eslint.lintText(code, { filePath });
    return result.messages.filter((m) => m.ruleId === 'no-restricted-syntax').map((m) => m.message);
}

describe('the input offset guard', () => {
    it('refuses a numeric literal as an array index in a discrimination or probe module', async () => {
        const code = 'export function f(row) {\n    return row[24];\n}\n';
        for (const file of ['js/evo/pool-discrimination-fixture.js', 'js/evo/memory-probe-fixture.js']) {
            const errors = await errorsOf(code, file);
            expect(errors).toEqual(['Read an input position from inputOffsets(config), not a numeric literal.']);
        }
    });

    it('refuses a numeric literal as a fill or set argument', async () => {
        const code = 'export function f(row) {\n    row.fill(0, 24, 27);\n    row.set([1], 30);\n}\n';
        const errors = await errorsOf(code, 'js/evo/pool-discrimination-fixture.js');
        expect(errors).toHaveLength(3);
        expect(errors.every((m) => m.startsWith('Pass an input position from inputOffsets(config)'))).toBe(true);
    });

    it('allows 0 and 1, and an index read from inputOffsets', async () => {
        const code = [
            'export function f(row, offsets, k) {',
            '    row.fill(0);',
            '    row[0] = row[1] + row[offsets.bodyStart + k];',
            '    row.set([1], offsets.memoryA);',
            '}',
            '',
        ].join('\n');
        expect(await errorsOf(code, 'js/evo/pool-discrimination-fixture.js')).toEqual([]);
    });

    it('does not apply to other evo modules', async () => {
        const code = 'export function f(row) {\n    return row[24];\n}\n';
        expect(await errorsOf(code, 'js/evo/other-fixture.js')).toEqual([]);
    });
});
