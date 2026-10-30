import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const cwd = new URL('../../', import.meta.url).pathname;
const eslint = new ESLint({ cwd });
const GUARD = 'Read an input position from inputOffsets(config), not a numeric literal.';
const GUARD_CALL = 'Pass an input position from inputOffsets(config) to fill or set, not a numeric literal.';

/**
 * @param {string} code the source to lint
 * @param {string} filePath the path it pretends to live at
 * @returns {Promise<string[]>} the messages of the no-restricted-syntax errors
 */
async function errorsOf(code, filePath) {
    const [result] = await eslint.lintText(code, { filePath });
    return result.messages.filter((m) => m.ruleId === 'no-restricted-syntax').map((m) => m.message);
}

describe('the probe offset guard', () => {
    it('fails a probe fixture that indexes a row with a numeric offset', async () => {
        const code = 'export function zeroMemory(row) {\n    row[31] = 0;\n}\n';
        expect(await errorsOf(code, 'js/evo/memory-probe-fixture.js')).toEqual([GUARD]);
    });

    it('fails a probe fixture that passes a numeric offset to fill or set', async () => {
        const code = 'export function blind(row) {\n    row.fill(0, 144, 157);\n    row.set([0], 31);\n}\n';
        const errors = await errorsOf(code, 'js/evo/memory-probe-fixture.js');
        expect(errors).toEqual([GUARD_CALL, GUARD_CALL, GUARD_CALL]);
    });

    it('passes a probe fixture whose offsets come from the table', async () => {
        const code = [
            'export function wipe(row, offsets) {',
            '    row.fill(0, offsets.rawBodyStart, offsets.rawBodyStart + 1);',
            '    row[offsets.memoryA] = 0;',
            '}',
            '',
        ].join('\n');
        expect(await errorsOf(code, 'js/evo/memory-probe-fixture.js')).toEqual([]);
    });

    it('passes every probe file in js/evo', async () => {
        const results = await eslint.lintFiles(['js/evo/memory-probe*.js']);
        expect(results.length).toBeGreaterThanOrEqual(6);
        const found = results.flatMap((r) => r.messages.filter((m) => m.ruleId === 'no-restricted-syntax'));
        expect(found).toEqual([]);
    });
});
