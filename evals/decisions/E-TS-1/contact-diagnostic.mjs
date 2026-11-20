// E-TS-1 record 1, T34: the contact diagnostic that tells theory 1 (the gate reads `hunt`, not contact) from theory 2
// (contact is not found reliably). Run from the repo root:
//   node evals/decisions/E-TS-1/contact-diagnostic.mjs <archive.json> [<archive.json> ...] > out.json
// Per archive: the best predator elite of each style band and the `memoryless` reference, each on 64 `prey-ahead` trials
// against (a) the drill's scripted fleer and (b) an inert prey (zero outputs). Reads the outputs of the subject after each
// step: the SPRINT and THRUST share over the ticks the prey is within the subject's view. A detector, never fitness.
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { eliteSubjects } from '../../../scripts/lib/drill-subjects.mjs';
import { decodeTrainerArchive } from '../../../scripts/lib/archive-source.mjs';
import { DRILLS } from '../../../js/evo/drill-scenarios.js';
import { playTrial, viewOf } from '../../../js/evo/memory-probe-run.js';
import { referenceSubject } from '../../../js/evo/memory-probe-references.js';
import { PREDATOR_SPEC } from '../../../js/evo/memory-probe-scenarios.js';
import { OUTPUT_INDEX } from '../../../js/sim/brain-layout.js';
import { createConfig } from '../../../js/sim/config.js';
import { createRng, fork } from '../../../js/sim/rng.js';

const TRIALS = 64;
const SEED = 1000000;
const DRILL = DRILLS.find((d) => d.name === 'prey-ahead');
const INERT = { role: 'prey', subject: { spec: null, weights: null, act: (world) => world.outputs.fill(0) } };

/** One subject on one prey kind: wins, the in-view output shares and the closest approach (summed radii). */
function play(subject, { inert }) {
    const config = createConfig({});
    const view = viewOf({ spec: PREDATOR_SPEC, weights: null }, config);
    const tally = { ticks: 0, sprint: 0, thrust: 0, thrustSum: 0, wins: 0, closest: [] };
    for (let t = 0; t < TRIALS; t++) {
        const seed = SEED + t;
        const plan = DRILL.plan(fork(createRng(seed), 'diag'), view);
        const done = plan.done;
        let closest = Infinity;
        plan.done = (world, control) => {
            const dx = world.x[1] - world.x[0];
            const dy = world.y[1] - world.y[0];
            const d = Math.hypot(dx, dy);
            if (world.alive[0] === 1 && world.alive[1] === 1) {
                closest = Math.min(closest, d / (world.size[0] + world.size[1]));
                if (d <= view) {
                    const o = world.outputs;
                    tally.ticks += 1;
                    tally.sprint += o[OUTPUT_INDEX.SPRINT] > 0 ? 1 : 0;
                    tally.thrust += o[OUTPUT_INDEX.THRUST] > 0.5 ? 1 : 0;
                    tally.thrustSum += o[OUTPUT_INDEX.THRUST];
                }
            }
            return done(world, control);
        };
        const won = playTrial({
            plan,
            subject,
            controlSpec: { name: 'intact' },
            seed,
            config: {},
            opponent: inert ? INERT : undefined,
        });
        tally.wins += won ? 1 : 0;
        tally.closest.push(closest);
    }
    tally.closest.sort((a, b) => a - b);
    return {
        wins: tally.wins,
        inViewTicks: tally.ticks,
        sprintShare: tally.ticks === 0 ? null : +(tally.sprint / tally.ticks).toFixed(3),
        thrustAbove05Share: tally.ticks === 0 ? null : +(tally.thrust / tally.ticks).toFixed(3),
        meanThrust: tally.ticks === 0 ? null : +(tally.thrustSum / tally.ticks).toFixed(3),
        medianClosest: +tally.closest[TRIALS >> 1].toFixed(2),
    };
}

const config = createConfig({});
const out = {};
for (const file of process.argv.slice(2)) {
    const archive = decodeTrainerArchive(JSON.parse(readFileSync(file, 'utf8')), config);
    const subjects = [
        ...eliteSubjects(archive).filter((s) => s.spec === PREDATOR_SPEC),
        referenceSubject('memoryless'),
    ];
    out[file] = subjects.map((s) => ({
        subject: s.name,
        fleer: play(s, { inert: false }),
        inert: play(s, { inert: true }),
    }));
}
process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
