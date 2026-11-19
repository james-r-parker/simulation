// E-TS-1 record 1, T34: how the `hunt-contact` stage world's kills happen. Runs one training-style episode of the stage
// world (the stage file's config) seeded from a trainer archive, at debug level, and writes the log to a JSONL file for
// `node scripts/hunter-income.mjs <log>`; prints the kills' victims and the closing speeds at the kills.
//   node evals/decisions/E-TS-1/stage-kills.mjs <archive.json> <log.jsonl> [ticks] [seed]
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { URL } from 'node:url';
import { createObserver, observerPhases } from '../../../js/evo/observer.js';
import { LIVE_POLICY, getPolicy } from '../../../js/evo/policies/index.js';
import { feedPolicy } from '../../../js/evo/feed-policy.js';
import { createConfig } from '../../../js/sim/config.js';
import { createSimLog, drainEvents } from '../../../js/sim/log.js';
import { createRng, fork } from '../../../js/sim/rng.js';
import { createWorld } from '../../../js/sim/spawn.js';
import { step } from '../../../js/sim/step.js';
import { createJsonlSink } from '../../../scripts/lib/jsonl-sink.mjs';
import { decodeTrainerArchive } from '../../../scripts/lib/archive-source.mjs';

const [archiveFile, logFile, ticksArg = '20000', seedArg = '1'] = process.argv.slice(2);
const ticks = Number(ticksArg);
const seed = Number(seedArg);
const stage = JSON.parse(readFileSync(new URL('../../stages/hunt-contact.json', import.meta.url), 'utf8'));
const config = createConfig({ initialAgents: 100, ...stage, seed });
const archive = decodeTrainerArchive(JSON.parse(readFileSync(archiveFile, 'utf8')), config);
const sink = createJsonlSink(logFile);
const log = createSimLog(sink.sink, { level: 'debug' });
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
for (let t = 0; t < ticks; t++) {
    step(world, policy.brain, phases);
    feedPolicy(run, world);
    drainEvents(world, log);
}
await sink.close();
