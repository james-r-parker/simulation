// reads: js/sim/*.js
// body-genes Phase 5 T45: no file of js/sim reads a body key off the config where the sim reads the body's lane. A read
// that stays is listed here with the reason, so a new one fails this test until someone says why it is right.

import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LANES } from '../../js/sim/body-lanes.js';

const SIM_DIR = new URL('../../js/sim/', import.meta.url);

/** The reads that stay, as `file key`, each with its reason. */
const ALLOWED = {
    // Waiting on a kernel change.
    'world.js antennaAngle': 'the scent kernel reads one antenna cone for the world (`antennaCos`, `antennaSin`)',
    'ray-march.js smokeTicks':
        'a cloud is a decoy by its age, smokeTicks less its ttl; the cloud does not hold its releaser, so the life is the config value as in snapshot.js (smoke-decoy.md)',
    'snapshot.js smokeTicks': 'waits on a per-slot cloud radius and life in the sense kernel (T42, Phase 7)',
    'wasm-sense.js smokeRadius': 'the sense kernel takes one `D_SMOKE_RADIUS` for the world (T42, Phase 7)',
    'wasm-brain.js hebbianRate': 'a scalar of the WASM brain kernel; waits on a kernel change',
    'world-hash.js hebbianRate': 'hashes the brain kernel scalar the kernel reads; waits on the same change',
    // By design: a world-level normaliser, which a gene must not rescale.
    'body-inputs.js maxTurn': 'normalises a brain input: the scale of an input is the same for every body',
    'body-inputs.js maxVelocity': 'normalises a brain input: the scale of an input is the same for every body',
    'body-inputs.js baseSize': 'normalises the size input against the base body',
    'body-inputs.js energyToSize': 'normalises the size input against the base body',
    'body-sense.js maxVelocity': 'the speed sense spans a world-level speed, so its scale is the same for every body',
    'merit-state.js maxTurn': 'a detector threshold on the turn rate, a world-level scale',
    'merit-state.js maxVelocity': 'detector thresholds on the speed (closing, fleeing), a world-level scale',
    'merit-state.js biteArc': 'the world-level table of rays inside the base bite arc (`arcRays`)',
    'trample.js maxVelocity': 'the closing speed as a share of the world-level top speed',
    'world.js maxEnergy': 'the `maxEnergyBySpec` table: the base store the detectors normalise by',
    'world.js splitMinEnergy': 'the `splitMinBySpec` table: the base threshold the detectors read',
    'energy.js passiveLoss':
        'the vision term takes the base `passiveLoss`; the lane holds the spec multiplier and trait',
    // Validation and ranges, which run before any lane exists.
    'config-herds.js maxVelocity': 'validates the herd speeds against the top speed',
    'config-validate.js maxEnergy': 'validates the store range of the specs',
    'config-validate.js baseSize': 'validates the size range of the specs',
    'config-validate.js energyToSize': 'validates the size range of the specs',
};

/** The keys with no lane reader at all yet, so no `config.<key>` read is listed for them: each waits on a change. */
const WAITING_WITH_NO_READ = {
    rearVisionShare: 'a spec field read through `specParams` by the ray kernel (T42, Phase 7)',
    nerve: 'no reader until the effects of status-effects.md read it',
};

const KEYS = LANES.filter((lane) => lane.key !== null).map((lane) => /** @type {string} */ (lane.key));
const CONFIG = String.raw`(?:world\.|this\.)?config`;

/** @returns {string[]} the `file key` of every direct read of a body key off a config in js/sim */
function directReads() {
    const found = [];
    for (const file of readdirSync(SIM_DIR).filter((name) => name.endsWith('.js'))) {
        const source = readFileSync(new URL(file, SIM_DIR), 'utf8');
        for (const key of KEYS) {
            const dot = new RegExp(String.raw`\b${CONFIG}\.${key}\b|\b${CONFIG}\[['"]${key}['"]\]`);
            const destructured = new RegExp(String.raw`const \{[^}]*\b${key}\b[^}]*\} = ${CONFIG};`);
            if (dot.test(source) || destructured.test(source)) {
                found.push(`${file} ${key}`);
            }
        }
    }
    return found;
}

describe('body key reads in js/sim', () => {
    it('are only the listed ones: the sim reads each body from its lanes', () => {
        const unlisted = directReads().filter((read) => !(read in ALLOWED));
        expect(unlisted, 'read the lane, or list the read with its reason').toEqual([]);
    });

    it('lists no read that is gone, so the list shrinks as the readers move', () => {
        const reads = new Set(directReads());
        expect(Object.keys(ALLOWED).filter((read) => !reads.has(read))).toEqual([]);
    });

    it('gives a reason for every entry, and names the keys that wait without a read', () => {
        for (const reason of [...Object.values(ALLOWED), ...Object.values(WAITING_WITH_NO_READ)]) {
            expect(reason.length).toBeGreaterThan(10);
        }
        expect(Object.keys(WAITING_WITH_NO_READ)).toEqual(['rearVisionShare', 'nerve']);
    });
});
