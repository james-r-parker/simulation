#!/usr/bin/env node
// For shell callers (scripts/check.sh): `test-workers.mjs claim <pid>` prints the Vitest worker cap (nothing on CI) and holds a
// lease for <pid>; `test-workers.mjs release <pid>` drops it. See scripts/lib/test-workers.mjs.
import { claimWorkers, releaseWorkers } from './lib/test-workers.mjs';

const [action, pidText] = process.argv.slice(2);
const pid = Number(pidText);
if (!['claim', 'release'].includes(action) || !Number.isInteger(pid) || pid < 1) {
    console.error('usage: test-workers.mjs claim|release <pid>');
    process.exit(2);
}
if (action === 'claim') {
    const workers = claimWorkers(pid);
    if (workers !== null) {
        console.log(workers);
    }
} else {
    releaseWorkers(pid);
}
