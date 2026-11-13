/* global console, process */
// Does a mate-ready male steer toward the receptive-mate scent? Runs one seed of a scent world on the
// feat/receptive-mate-scent tree with the live policy and, per 20000-tick bin, takes each agent's mean turn output when
// its left antenna smells more scent minus its mean turn when the right one does (positive steers toward it), for
// mate-ready males, for everyone else, and for ready males against a placebo field no brain can sense.
// Usage: node scent-follow.mjs <feat/receptive-mate-scent tree> <seed> <ticks> <mateScentDeposit>
const [tree, seedArg, ticksArg, depositArg] = process.argv.slice(2);
const imp = (p) => import(`${tree}/${p}`);
const { createObserver, observerPhases } = await imp('js/evo/observer.js');
const { getPolicy } = await imp('js/evo/policies/index.js');
const { feedPolicy } = await imp('js/evo/feed-policy.js');
const { createConfig } = await imp('js/sim/config.js');
const { createSimLog } = await imp('js/sim/log.js');
const { createRng, fork } = await imp('js/sim/rng.js');
const { createWorld } = await imp('js/sim/spawn.js');
const { step } = await imp('js/sim/step.js');
const { BODY_INPUT, RAY_CHANNELS, OUTPUT_COUNT, OUTPUT_INDEX } = await imp('js/sim/brain-layout.js');
const { isReadyToMate } = await imp('js/sim/mate-eligibility.js');
const { SEX } = await imp('js/sim/sex.js');

const seed = Number(seedArg);
const ticks = Number(ticksArg);
const BIN = 20000;
const config = createConfig({ mateScentDeposit: Number(depositArg), seed });
const observer = createObserver(config, fork(createRng(seed), 'eval'), { runTicks: ticks, checkpointTicks: 1000 });
const log = createSimLog(() => {}, { level: 'error' });
const policy = getPolicy('map-elites-v6').create({ config, log, observer });
const world = createWorld(config, policy.brain);
feedPolicy({ policy, observer }, world);
const phases = observerPhases(observer);

// Per bin: for mate-ready males (group 0) and everyone else (group 1), each agent's mean turn when the left antenna
// smells more minus its mean turn when the right one does (positive = steers toward the scent), averaged over agents
// with at least MIN_EACH samples on both sides. Also the share of samples with any scent.
const bins = Math.ceil(ticks / BIN);
const MIN_SUM = 1e-3;
const MIN_REL = 0.05;
const MIN_EACH = 5;
const n = world.alive.length;
const acc = [0, 1, 2].map(() => ({
    id: new Uint32Array(n),
    sL: new Float64Array(n),
    nL: new Uint32Array(n),
    sR: new Float64Array(n),
    nR: new Uint32Array(n),
}));
const out = [0, 1, 2].map(() =>
    Array.from({ length: bins }, () => ({ samples: 0, scent: 0, agents: 0, diffSum: 0, diffSq: 0 })),
);

function flush(bin) {
    for (let g = 0; g < 3; g++) {
        const a = acc[g];
        const o = out[g][bin];
        for (let i = 0; i < n; i++) {
            if (a.nL[i] >= MIN_EACH && a.nR[i] >= MIN_EACH) {
                const d = a.sL[i] / a.nL[i] - a.sR[i] / a.nR[i];
                o.agents++;
                o.diffSum += d;
                o.diffSq += d * d;
            }
            a.sL[i] = 0;
            a.nL[i] = 0;
            a.sR[i] = 0;
            a.nR[i] = 0;
        }
    }
}

// The placebo: a smooth field no brain can sense, sampled at the antenna points the sense phase used.
const WAVES = [
    [0.0031, 0.0017, 1.1],
    [-0.0012, 0.0029, 2.3],
    [0.0021, -0.0024, 0.4],
];
const field = (px, py) => 3 + WAVES.reduce((t, [kx, ky, ph]) => t + Math.sin(kx * px + ky * py + ph), 0);
const px0 = new Float64Array(n);
const py0 = new Float64Array(n);
const ang0 = new Float64Array(n);
function snapshot() {
    px0.set(world.x);
    py0.set(world.y);
    ang0.set(world.angle);
}
const cA = Math.cos(config.antennaAngle);
const sA = Math.sin(config.antennaAngle);

function note(g, i, l, r, turn) {
    const a = acc[g];
    if (a.id[i] !== world.genomeId[i]) {
        a.id[i] = world.genomeId[i];
        a.sL[i] = 0;
        a.nL[i] = 0;
        a.sR[i] = 0;
        a.nR[i] = 0;
    }
    if (Math.abs(l - r) < MIN_REL * (l + r)) return;
    if (l > r) {
        a.sL[i] += turn;
        a.nL[i]++;
    } else {
        a.sR[i] += turn;
        a.nR[i]++;
    }
}

function sample() {
    const { alive, inputs, outputs, sex } = world;
    const stride = world.layout.rawInputCount;
    const base = config.rayCount * RAY_CHANNELS + BODY_INPUT.MATE_SCENT;
    const bin = Math.min(bins - 1, Math.floor((world.tick - 1) / BIN));
    for (let i = 0; i < n; i++) {
        if (alive[i] !== 1) continue;
        const male = sex[i] === SEX.MALE && isReadyToMate(world, i);
        const g = male ? 0 : 1;
        const o = out[g][bin];
        o.samples++;
        const turn = outputs[i * OUTPUT_COUNT + OUTPUT_INDEX.TURN];
        const l = inputs[i * stride + base];
        const r = inputs[i * stride + base + 1];
        if (l + r >= MIN_SUM) {
            o.scent++;
            note(g, i, l, r, turn);
        }
        if (male) {
            out[2][bin].samples++;
            const cH = Math.cos(ang0[i]);
            const sH = Math.sin(ang0[i]);
            const reach = config.antennaReach;
            const fl = field(px0[i] + reach * (cH * cA - sH * sA), py0[i] + reach * (sH * cA + cH * sA));
            const fr = field(px0[i] + reach * (cH * cA + sH * sA), py0[i] + reach * (sH * cA - cH * sA));
            note(2, i, fl, fr, turn);
        }
    }
}

for (let t = 0; t < ticks; t++) {
    if ((world.tick + 1) % 5 === 0) snapshot();
    step(world, policy.brain, phases);
    feedPolicy({ policy, observer }, world);
    if (world.tick % 5 === 0) sample();
    if (world.tick % BIN === 0) flush(world.tick / BIN - 1);
}
if (ticks % BIN !== 0) flush(bins - 1);
console.log(JSON.stringify({ seed, deposit: Number(depositArg), bin: BIN, out }));
