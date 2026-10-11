import { cruise } from 'dependency-cruiser';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtures = path.join(root, 'test/fixtures/deps');
const { forbidden } = require(path.join(root, '.dependency-cruiser.cjs'));

/**
 * Cruises one fixture tree under test/fixtures/deps/ with the repo's rules.
 * @param {string} name fixture directory name
 * @returns {Promise<string[]>} names of the rules violated, in report order
 */
async function violations(name) {
    const baseDir = path.join(fixtures, name);
    const result = await cruise(
        ['js'],
        { baseDir, validate: true, ruleSet: { forbidden } },
        { extensions: ['.js'] },
        undefined,
    );
    // @ts-expect-error cruise returns the result object for the default json output
    return result.output.summary.violations.map((v) => v.rule.name);
}

describe('dependency rules', () => {
    it('accepts sim and evo modules that import only what they may', async () => {
        expect(await violations('clean')).toEqual([]);
    });

    it('rejects a js/sim module importing legacy code', async () => {
        expect(await violations('legacy')).toContain('sim-standalone');
    });

    it('rejects a js/evo module importing the UI', async () => {
        expect(await violations('ui')).toContain('evo-only-sim');
    });

    it('rejects a js/sim module importing an npm package', async () => {
        expect(await violations('three')).toContain('sim-standalone');
    });

    it('rejects a js/sim module importing a devDependencies package', async () => {
        expect(await violations('three')).toContain('no-dev-in-runtime');
    });

    it('rejects an import cycle in js/sim', async () => {
        expect(await violations('cycle')).toContain('no-circular');
    });
});
