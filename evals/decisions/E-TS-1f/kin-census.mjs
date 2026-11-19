// E-TS-1f, (b): how often does a hunter meet kin in a stage world, and what does wanting to bite kin cost there? One
// training-style episode of a stage world seeded from a trainer archive (and a prey share), counting per hunter-tick: a
// kin within 1.5 body sizes of touching, one in the first 200 units, the BITE output above 0 beside kin, and the recoil
// energy charged (the only cost of a refused bite: `recoilEnergy` once a tick), against the prey's bites. A detector only.
//   node evals/decisions/E-TS-1f/kin-census.mjs <archive.json> <stage.json> [ticks] [seed] [preyShare]
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { feedPolicy } from '../../../js/evo/feed-policy.js';
import { createObserver, observerPhases } from '../../../js/evo/observer.js';
import { LIVE_POLICY, getPolicy } from '../../../js/evo/policies/index.js';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../../js/sim/brain-layout.js';
import { createConfig } from '../../../js/sim/config.js';
import { isKin } from '../../../js/sim/kin.js';
import { createSimLog } from '../../../js/sim/log.js';
import { createRng, fork } from '../../../js/sim/rng.js';
import { createWorld } from '../../../js/sim/spawn.js';
import { step } from '../../../js/sim/step.js';
import { decodeTrainerArchive } from '../../../scripts/lib/archive-source.mjs';

const [archiveFile, stageFile, ticksArg = '4000', seedArg = '1', shareArg] = process.argv.slice(2);
const ticks = Number(ticksArg);
const seed = Number(seedArg);
const config = createConfig({ initialAgents: 100, ...JSON.parse(readFileSync(stageFile, 'utf8')), seed });
const archive = decodeTrainerArchive(JSON.parse(readFileSync(archiveFile, 'utf8')), config);
const observer = createObserver(config, fork(createRng(seed), 'eval'), { runTicks: ticks, checkpointTicks: 1000 });
const policy = getPolicy(LIVE_POLICY).create({
    config,
    log: createSimLog(() => {}, { level: 'error' }),
    observer,
    archive,
    onOffer: () => {},
    ...(shareArg === undefined ? {} : { preyShare: Number(shareArg) }),
});
const world = createWorld(config, policy.brain);
const run = { policy, observer };
feedPolicy(run, world);
const phases = observerPhases(observer);
const PREDATOR = 1;
const stats = {
    hunterTicks: 0,
    kinNear: 0,
    kinClose: 0,
    wantsBiteBesideKin: 0,
    recoil: 0,
    recoilBesideKin: 0,
    bitingElsewhere: 0,
    hunterTicksNoKin: 0,
    births: 0,
    kinPairsMax: 0,
};
const prev = new Float64Array(world.alive.length);
for (let t = 0; t < ticks; t++) {
    step(world, policy.brain, phases);
    feedPolicy(run, world);
    let pairs = 0;
    for (let a = 0; a < world.alive.length; a++) {
        if (world.alive[a] !== 1 || world.spec[a] !== PREDATOR) {
            prev[a] = 0;
            continue;
        }
        stats.hunterTicks += 1;
        const delta = world.recoilEnergyLife[a] - prev[a];
        stats.recoil += delta > 0 ? delta : 0;
        prev[a] = world.recoilEnergyLife[a];
        let near = false;
        let close = false;
        for (let b = 0; b < world.alive.length; b++) {
            if (b === a || world.alive[b] !== 1 || !isKin(world, a, b)) {
                continue;
            }
            pairs += 1;
            const d = Math.hypot(world.x[a] - world.x[b], world.y[a] - world.y[b]);
            near ||= d < 200;
            close ||= d < 1.5 * (world.size[a] + world.size[b]);
        }
        stats.kinNear += near ? 1 : 0;
        stats.kinClose += close ? 1 : 0;
        stats.recoilBesideKin += close && delta > 0 ? delta : 0;
        stats.hunterTicksNoKin += close ? 0 : 1;
        stats.bitingElsewhere += !close && world.outputs[a * OUTPUT_COUNT + OUTPUT_INDEX.BITE] > 0 ? 1 : 0;
        stats.wantsBiteBesideKin += close && world.outputs[a * OUTPUT_COUNT + OUTPUT_INDEX.BITE] > 0 ? 1 : 0;
    }
    stats.kinPairsMax = Math.max(stats.kinPairsMax, pairs);
}
stats.births = observer.births ? Array.from(observer.births).reduce((s, n) => s + n, 0) : null;
const share = (n) => +(n / Math.max(1, stats.hunterTicks)).toFixed(4);
process.stdout.write(
    `${JSON.stringify({ ...stats, kinNearShare: share(stats.kinNear), kinCloseShare: share(stats.kinClose), wantsBiteBesideKinShare: share(stats.wantsBiteBesideKin), bitingElsewhereShare: +(stats.bitingElsewhere / Math.max(1, stats.hunterTicksNoKin)).toFixed(4), wantsBiteBesideKinOfClose: +(stats.wantsBiteBesideKin / Math.max(1, stats.kinClose)).toFixed(4), recoilPerHunterTick: +(stats.recoil / Math.max(1, stats.hunterTicks)).toFixed(3) }, null, 2)}\n`,
);
