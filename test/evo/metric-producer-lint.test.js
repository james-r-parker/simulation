// The producer rule of `eslint.config.js` (docs/designs/metric-trust.md, Every new metric is registered).

import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const cwd = new URL('../../', import.meta.url).pathname;
const eslint = new ESLint({ cwd });

/**
 * @param {string} code the source to lint
 * @param {string} filePath the path it pretends to live at
 * @returns {Promise<string[]>} the messages of the no-restricted-syntax errors
 */
async function errorsOf(code, filePath) {
    const [result] = await eslint.lintText(code, { filePath });
    return result.messages.filter((m) => m.ruleId === 'no-restricted-syntax').map((m) => m.message);
}

describe('the metric producer rule', () => {
    it('fails Object.fromEntries in a metrics module and a scene module', async () => {
        const code = 'export const f = (names) => Object.fromEntries(names.map((n) => [n, 1]));\n';
        expect(await errorsOf(code, 'js/evo/metrics-fixture.js')).toHaveLength(1);
        expect(await errorsOf(code, 'js/evo/scene-fixture.js')).toHaveLength(1);
    });

    it('fails a template-literal key that starts at eval. or at an interpolation, as a property or an index', async () => {
        const code = [
            'export function f(out, p, n) {',
            '    out[`eval.x.${n}`] = 1;',
            '    out[`${p}.${n}`] = 1;',
            '    return { [`eval.y.${n}`]: 1 };',
            '}',
            '',
        ].join('\n');
        expect(await errorsOf(code, 'js/evo/scene-fixture.js')).toHaveLength(3);
    });

    it('passes literal keys, metricName and a template key that is not a metric name', async () => {
        const code = [
            "import { metricName } from './metric-registry/index.js';",
            'export function f(out, log, basin, n) {',
            "    out['eval.x'] = 1;",
            "    out[metricName('eval.x', n)] = 1;",
            '    log[`alive${basin}`][0] = 1;',
            '}',
            '',
        ].join('\n');
        expect(await errorsOf(code, 'js/evo/scene-fixture.js')).toEqual([]);
    });

    it('does not apply outside the producers', async () => {
        const code = 'export const f = (names) => Object.fromEntries(names.map((n) => [n, 1]));\n';
        expect(await errorsOf(code, 'js/evo/archive-fixture.js')).toEqual([]);
    });

    it('passes every metrics and scene module in js/evo', async () => {
        const results = await eslint.lintFiles(['js/evo/metrics*.js', 'js/evo/scene-*.js']);
        expect(results.length).toBeGreaterThanOrEqual(50);
        const found = results.flatMap((r) => r.messages.filter((m) => m.ruleId === 'no-restricted-syntax'));
        expect(found).toEqual([]);
    });
});
