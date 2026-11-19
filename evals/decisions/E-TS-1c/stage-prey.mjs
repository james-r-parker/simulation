// E-TS-1c: do the prey of a stage world sprint? Runs a training-style episode of a stage world seeded from a trainer archive
// and reads, per specialisation, the share of agent-ticks in which `SPRINT` fires and the mean speed, over the first 4000 ticks.
// If the forager's sprint hardly fires, the `sprintBoost` of `hunt-weak` is a lever that moves nothing in the training world.
//   node evals/decisions/E-TS-1c/stage-prey.mjs <archive.json> <stage.json> [ticks] [seed]
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { feedPolicy } from '../../../js/evo/feed-policy.js';
import { createObserver, observerPhases } from '../../../js/evo/observer.js';
import { LIVE_POLICY, getPolicy } from '../../../js/evo/policies/index.js';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../../js/sim/brain-layout.js';
import { createConfig } from '../../../js/sim/config.js';
import { createSimLog } from '../../../js/sim/log.js';
import { createRng, fork } from '../../../js/sim/rng.js';
import { createWorld } from '../../../js/sim/spawn.js';
import { step } from '../../../js/sim/step.js';
import { decodeTrainerArchive } from '../../../scripts/lib/archive-source.mjs';

const [archiveFile, stageFile, ticksArg = '4000', seedArg = '1'] = process.argv.slice(2);
const ticks = Number(ticksArg);
const seed = Number(seedArg);
const stage = JSON.parse(readFileSync(stageFile, 'utf8'));
const config = createConfig({ initialAgents: 100, ...stage, seed });
const archive = decodeTrainerArchive(JSON.parse(readFileSync(archiveFile, 'utf8')), config);
const log = createSimLog(() => {}, { level: 'error' });
const observer = createObserver(config, fork(createRng(seed), 'eval'), { runTicks: ticks, checkpointTicks: 1000 });
const policy = getPolicy(LIVE_POLICY).create({
    config,
    log,
    observer,
    archive,
    onOffer: () => {},
    opponents: undefined,
});
const world = createWorld(config, policy.brain);
const run = { policy, observer };
feedPolicy(run, world);
const phases = observerPhases(observer);
const names = ['forager', 'predator', 'reproducer', 'scout', 'defender'];
const tally = names.map(() => ({ ticks: 0, sprint: 0, speed: 0 }));
const census = (tick) => {
    const counts = names.map(() => 0);
    for (let slot = 0; slot < world.alive.length; slot++) {
        counts[world.spec[slot]] += world.alive[slot];
    }
    process.stderr.write(`tick ${tick}: ${names.map((n, i) => `${n} ${counts[i]}`).join(', ')}\n`);
};
census(0);
for (let t = 0; t < ticks; t++) {
    if ([100, 500, 2000].includes(t)) {
        census(t);
    }
    step(world, policy.brain, phases);
    feedPolicy(run, world);
    for (let slot = 0; slot < world.alive.length; slot++) {
        if (world.alive[slot] === 1) {
            const row = tally[world.spec[slot]];
            row.ticks += 1;
            row.sprint += world.outputs[slot * OUTPUT_COUNT + OUTPUT_INDEX.SPRINT] > 0 ? 1 : 0;
            row.speed += Math.hypot(world.vx[slot], world.vy[slot]);
        }
    }
}
const out = Object.fromEntries(
    names.map((name, i) => [
        name,
        {
            agentTicks: tally[i].ticks,
            sprintShare: tally[i].ticks === 0 ? null : +(tally[i].sprint / tally[i].ticks).toFixed(3),
            meanSpeed: tally[i].ticks === 0 ? null : +(tally[i].speed / tally[i].ticks).toFixed(2),
        },
    ]),
);
process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
