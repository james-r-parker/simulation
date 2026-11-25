// A Vitest reporter that records the tests that took over half their own limit, explicit `scaleTimeout` ones included:
// the JSON reporter hides a test's timeout, `TestCase.options.timeout` has it. `npm run test:report` adds it with
// `--reporter=<this file>` and reads the file `TEST_LIMIT_OUT` names (docs/commands.md, "Run the tests and read only the
// failures"). The decision is `nearLimit`, pure.
import { writeFileSync } from 'node:fs';

/** A test is near its limit when it used more than this share of it. */
export const LIMIT_SHARE = 0.5;

/**
 * @typedef {object} CaseTime
 * @property {string} file the test file, relative to the root
 * @property {string} name the full test name
 * @property {number} ms how long it took
 * @property {number} limitMs its limit (explicit, else the default)
 */

/**
 * @param {CaseTime[]} cases passing tests with their limit
 * @param {number} [share] the share of the limit that counts as near it
 * @returns {CaseTime[]} the ones over that share, slowest share of its limit first
 */
export function nearLimit(cases, share = LIMIT_SHARE) {
    return cases
        .filter((c) => c.limitMs > 0 && c.ms > c.limitMs * share)
        .sort((a, b) => b.ms / b.limitMs - a.ms / a.limitMs);
}

/**
 * @param {any} testCase a Vitest `TestCase`
 * @param {string} root the repo root
 * @returns {CaseTime | null} the passing test's time and limit, null for any other result
 */
function timeOf(testCase, root) {
    const duration = testCase.diagnostic()?.duration;
    const limitMs = testCase.options?.timeout;
    if (testCase.result().state !== 'passed' || typeof duration !== 'number' || typeof limitMs !== 'number') {
        return null;
    }
    const file = String(testCase.module.moduleId).replace(`${root}/`, '');
    return { file, name: testCase.fullName, ms: duration, limitMs };
}

export default class LimitReporter {
    /** @param {any} ctx Vitest's context, ignored */
    onInit(ctx) {
        this.root = ctx.config.root;
    }

    /** @param {ReadonlyArray<any>} modules the finished test modules */
    onTestRunEnd(modules) {
        const out = process.env.TEST_LIMIT_OUT;
        if (!out) {
            return;
        }
        const cases = [];
        for (const mod of modules) {
            for (const t of mod.children.allTests()) {
                const c = timeOf(t, this.root);
                if (c) {
                    cases.push(c);
                }
            }
        }
        writeFileSync(out, JSON.stringify(nearLimit(cases)));
    }
}
