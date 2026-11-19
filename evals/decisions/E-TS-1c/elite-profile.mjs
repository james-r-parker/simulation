// E-TS-1c, why `hunt-weak` stalls on three offsets and not on offset 0, and why kin biting survives the closed birth bias:
// per predator elite of each archive, its cell, style band and BITE output bias, its wins on `prey-weak`, `prey-adrift` and
// `kin-spared` (64 trials, seed 1), and on `prey-weak` the SPRINT and THRUST share and median closest approach while the prey is
// in view. A detector, never fitness.
//   node evals/decisions/E-TS-1c/elite-profile.mjs <archive.json> [...] > elite-profile.json
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { drillSubject } from '../../../js/evo/drill.js';
import { DRILLS } from '../../../js/evo/drill-scenarios.js';
import { playTrial, viewOf } from '../../../js/evo/memory-probe-run.js';
import { PREDATOR_SPEC } from '../../../js/evo/memory-probe-scenarios.js';
import {
    GENE_OUTPUTS,
    OUTPUT_INDEX,
    POOLED_CHANNELS,
    POOLED_STRIDE,
    brainLayout,
} from '../../../js/sim/brain-layout.js';
import { createConfig } from '../../../js/sim/config.js';
import { createRng, fork } from '../../../js/sim/rng.js';
import { decodeTrainerArchive } from '../../../scripts/lib/archive-source.mjs';
import { eliteSubjects } from '../../../scripts/lib/drill-subjects.mjs';

const TRIALS = 64;
const byName = (name) => DRILLS.find((d) => d.name === name);

/** The prey-weak trials with the in-view output shares. */
function inView(drill, subject) {
    const config = { ...drill.arena };
    const view = viewOf({ spec: PREDATOR_SPEC, weights: subject.weights }, createConfig(config));
    const t = { ticks: 0, sprint: 0, thrust: 0, closest: [] };
    for (let k = 0; k < TRIALS; k++) {
        const seed = 1 + k;
        const plan = drill.plan(fork(createRng(seed), 'profile'), view);
        const done = plan.done;
        let closest = Infinity;
        plan.done = (world, control) => {
            if (world.alive[0] === 1 && world.alive[1] === 1) {
                const d = Math.hypot(world.x[1] - world.x[0], world.y[1] - world.y[0]);
                closest = Math.min(closest, d / (world.size[0] + world.size[1]));
                if (d <= view) {
                    t.ticks += 1;
                    t.sprint += world.outputs[OUTPUT_INDEX.SPRINT] > 0 ? 1 : 0;
                    t.thrust += world.outputs[OUTPUT_INDEX.THRUST] > 0.5 ? 1 : 0;
                }
            }
            return done(world, control);
        };
        playTrial({ plan, subject, controlSpec: { name: 'intact' }, seed, config });
        t.closest.push(closest);
    }
    t.closest.sort((a, b) => a - b);
    const share = (n) => (t.ticks === 0 ? null : +(n / t.ticks).toFixed(3));
    return { sprint: share(t.sprint), thrust: share(t.thrust), medianClosest: +t.closest[TRIALS >> 1].toFixed(2) };
}

/** The skip weight of a channel's strongest-hit strength into BITE (positive: the channel opens the jaws). */
function skipToBite(weights, layout, channel) {
    const input = POOLED_CHANNELS.indexOf(channel) * POOLED_STRIDE;
    return +weights[layout.wSkip + input * layout.geneOutputs + GENE_OUTPUTS.indexOf(OUTPUT_INDEX.BITE)].toFixed(2);
}

const config = createConfig({});
const layout = brainLayout(config);
const out = {};
for (const file of process.argv.slice(2)) {
    const archive = decodeTrainerArchive(JSON.parse(readFileSync(file, 'utf8')), config);
    out[file] = eliteSubjects(archive)
        .filter((s) => s.spec === PREDATOR_SPEC)
        .map((s) => ({
            elite: s.name,
            style: s.style,
            biteBias: +s.weights[layout.bOut + GENE_OUTPUTS.indexOf(OUTPUT_INDEX.BITE)].toFixed(2),
            skipToBite: Object.fromEntries(['prey', 'kin', 'other'].map((c) => [c, skipToBite(s.weights, layout, c)])),
            wins: Object.fromEntries(
                ['prey-weak', 'prey-adrift', 'kin-spared'].map((n) => [
                    n,
                    drillSubject(byName(n), s, { seed: 1, trials: TRIALS }).wins,
                ]),
            ),
            preyWeakInView: inView(byName('prey-weak'), s),
        }));
}
process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
