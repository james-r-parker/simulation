#!/usr/bin/env node
// Waits for a PR's checks without hammering the API. Usage: scripts/ci-wait.sh <pr-number> [--interval <s>] [--timeout <s>]
// Polls every 120 s by default (never faster); one call waits at most 510 s. Prints `green`, or the ci-failures summary
// on red (exit 1); exit 124 when the call ran out, saying how to resume. An empty check list is not passing.
import { execFileSync } from 'node:child_process';
import { ciFailures } from './ci-failures.mjs';
import { callBudget, classifyChecks, parseInterval } from './lib/ci-checks.mjs';

/** @param {string[]} args argv @param {string} name a flag @returns {string | undefined} its value */
const flag = (args, name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);

/**
 * @param {string} pr the PR number
 * @returns {object[]} the checks (an empty list when gh finds none)
 */
function checks(pr) {
    try {
        return JSON.parse(
            execFileSync('gh', ['pr', 'checks', pr, '--json', 'name,bucket,state'], { encoding: 'utf8' }),
        );
    } catch (error) {
        // gh exits 8 while checks are pending and 1 with "no checks reported"; stdout holds the JSON when there is any.
        try {
            return JSON.parse(/** @type {any} */ (error).stdout || '[]');
        } catch {
            return [];
        }
    }
}

const args = process.argv.slice(2);
const pr = args.find((a) => /^\d+$/.test(a));
if (!pr) {
    console.error('usage: ci-wait.sh <pr-number> [--interval <s>] [--timeout <s>]');
    process.exit(2);
}
let interval;
try {
    interval = parseInterval(flag(args, '--interval'));
} catch (error) {
    console.error(/** @type {Error} */ (error).message);
    process.exit(2);
}
const timeout = flag(args, '--timeout');
const { budget, capped } = callBudget(timeout === undefined ? undefined : Number(timeout));
const start = Date.now();
for (;;) {
    const state = classifyChecks(checks(pr));
    if (state === 'green') {
        console.log('green');
        process.exit(0);
    }
    if (state === 'red') {
        console.log(ciFailures(pr).join('\n'));
        process.exit(1);
    }
    const waited = Math.round((Date.now() - start) / 1000);
    if (waited + interval > budget) {
        console.log(
            `pending after ${waited} s${capped ? ' (one call waits at most 510 s)' : ''}; run scripts/ci-wait.sh ${pr} again`,
        );
        process.exit(124);
    }
    await new Promise((resolve) => setTimeout(resolve, interval * 1000));
}
