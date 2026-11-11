// Replays one seed of the E155 reference and reads the low-density edge from inside the world (low-density-edge.md, Phase 2,
// T10): the edge scene's checkpoint rows (prey, hunters and the running birth and death totals every 1000 ticks) and, at each
// edge checkpoint, the mating funnel of the prey females (`scripts/lib/edge-funnel.mjs`). A reader, never fitness:
// `node scripts/edge-probe.mjs --seed 313056 [--ticks 200000] [--out <file.json>]`; the config is the eval default.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BURN_IN_TICKS } from '../js/evo/burn-in.js';
import { checkpoint, createObserver, observerPhases } from '../js/evo/observer.js';
import { LIVE_POLICY, getPolicy } from '../js/evo/policies/index.js';
import { createConfig } from '../js/sim/config.js';
import { createSimLog } from '../js/sim/log.js';
import { createRng, fork } from '../js/sim/rng.js';
import { createWorld } from '../js/sim/spawn.js';
import { step } from '../js/sim/step.js';
import { createFunnel, sampleFunnel } from './lib/edge-funnel.mjs';
import { feedPolicy } from './lib/feed-policy.mjs';

const CHECKPOINT = 1000;
const EDGE_PREY = 100;
const BAND_PREY = 400;

/**
 * @param {{seed: number, ticks: number}} options the seed and the ticks to run
 * @returns {{seed: number, ticks: number, rows: Record<string, number[]>, funnel: import('./lib/edge-funnel.mjs').Funnel, bandFunnel: import('./lib/edge-funnel.mjs').Funnel}} the
 *   edge scene's rows (one entry per checkpoint after burn-in) and the funnels pooled over the edge checkpoints and over those at 100 to 400 prey
 */
export function probeSeed({ seed, ticks }) {
    const config = createConfig({ seed });
    const observer = createObserver(config, fork(createRng(seed), 'eval'), {
        runTicks: ticks,
        checkpointTicks: CHECKPOINT,
    });
    const log = createSimLog(() => {}, { level: 'error' });
    const policy = getPolicy(LIVE_POLICY).create({ config, log, observer });
    const world = createWorld(config, policy.brain);
    feedPolicy({ policy, observer }, world);
    const phases = observerPhases(observer);
    const funnel = createFunnel();
    const scratch = new Int32Array(BAND_PREY);
    const bandFunnel = createFunnel();
    const edge = observer.scenes.edge;
    for (let t = 0; t < ticks; t++) {
        step(world, policy.brain, phases);
        feedPolicy({ policy, observer }, world);
        if (world.tick % CHECKPOINT === 0 && world.tick >= CHECKPOINT) {
            checkpoint(observer, world);
        }
        if (world.tick >= BURN_IN_TICKS && world.tick % CHECKPOINT === 0) {
            const prey = edge.log.prey[edge.rows - 1];
            if (prey > 0 && prey < EDGE_PREY) {
                sampleFunnel(funnel, world, scratch);
            } else if (prey >= EDGE_PREY && prey <= BAND_PREY) {
                sampleFunnel(bandFunnel, world, scratch);
            }
        }
    }
    const rows = Object.fromEntries(
        Object.keys(edge.log)
            .filter((k) => ArrayBuffer.isView(edge.log[k]))
            .map((k) => [k, Array.from(edge.log[k].subarray(0, edge.rows))]),
    );
    return { seed, ticks, rows, funnel, bandFunnel };
}

/* v8 ignore start -- thin CLI; probeSeed is tested */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const args = process.argv.slice(2);
    const flag = (/** @type {string} */ name, /** @type {string} */ fallback) => {
        const at = args.indexOf(`--${name}`);
        return at >= 0 ? args[at + 1] : fallback;
    };
    const result = probeSeed({ seed: Number(flag('seed', '')), ticks: Number(flag('ticks', '200000')) });
    const text = JSON.stringify(result);
    const out = flag('out', '');
    if (out) {
        writeFileSync(out, text);
    } else {
        console.log(text);
    }
}
/* v8 ignore stop */
