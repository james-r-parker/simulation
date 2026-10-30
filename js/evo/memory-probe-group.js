// The group-hunt probe (brain-capacity-and-memory.md, Group-hunt probe): three clones that sense each other against
// three that cannot, and a trio against a solo hunter, on a prey too big to kill in one bite.

import { createRng, fork } from '../sim/rng.js';
import {
    CENTRE_X,
    CENTRE_Y,
    FORAGER_SPEC,
    HUNTER_ENERGY,
    PREDATOR_SPEC,
    PREY_VIEW_SHARE,
    around,
    heading,
} from './memory-probe-scenarios.js';
import { playTrial } from './memory-probe-run.js';

/** Ticks in a hunt. */
export const HUNT_TICKS = 600;
/** Hunters in the trio. */
export const TRIO = 3;
/** The shared parent id that makes the staged clones siblings (any nonzero id). */
const SHARED_PARENT = 7777;
const HUNTER_SPACING = 60;
/** The prey's energy: the world's cap, so one bite (a few hundred) cannot kill it. */
const PREY_ENERGY = 2000;

/** The group probe's controls: the senses intact, the allies hidden, and a lone hunter. */
export const GROUP_CONTROL = Object.freeze({ SENSES: 'senses', BLIND: 'kin-blind', SOLO: 'solo' });

/**
 * @param {import('../sim/rng.js').Rng} rng the probe's stream
 * @param {number} view the hunters' ray length
 * @param {number} hunters how many hunters (3, or 1 for the solo control)
 * @returns {import('./memory-probe-run.js').Plan} a hunt: the hunters side by side, the prey ahead of them
 */
function huntPlan(rng, view, hunters) {
    const theta = heading(rng);
    const prey = around(theta, PREY_VIEW_SHARE * view);
    const agents = Array.from({ length: hunters }, (_, i) => ({
        role: 'subject',
        x: CENTRE_X,
        y: CENTRE_Y + (i - (hunters - 1) / 2) * HUNTER_SPACING,
        angle: theta,
        spec: PREDATOR_SPEC,
        energy: HUNTER_ENERGY,
        parents: [SHARED_PARENT, 0],
    }));
    agents.push({ role: 'prey', ...prey, angle: theta, spec: FORAGER_SPEC, energy: PREY_ENERGY, parents: [0, 0] });
    return {
        stage: { foods: [], rocks: [], agents },
        timing: null,
        scent: false,
        maxTicks: HUNT_TICKS,
        done: (world) => world.alive[hunters] === 0,
        won: (world) => world.alive[hunters] === 0,
    };
}

/**
 * Runs the hunt trials of one control.
 * @param {string} control a `GROUP_CONTROL` value
 * @param {import('./memory-probe-run.js').Subject} subject the genome, run as every hunter
 * @param {{config: Record<string, any>, view: number, seed: number, trials: number,
 *   onTrial?: (trial: number, won: boolean) => void}} run the probe's config overrides, the hunters' ray length, the
 *   base seed, the trial count and a per-trial hook (the log)
 * @returns {number} the share of trials in which the prey died
 */
export function huntScore(control, subject, { config, view, seed, trials, onTrial }) {
    const hunters = control === GROUP_CONTROL.SOLO ? 1 : TRIO;
    let kills = 0;
    for (let trial = 0; trial < trials; trial++) {
        const rng = fork(fork(createRng(seed + trial), 'probe'), 'group-hunt');
        const won = playTrial({
            plan: huntPlan(rng, view, hunters),
            subject,
            controlSpec: { name: control, kinBlind: control === GROUP_CONTROL.BLIND },
            seed: seed + trial,
            config,
        });
        kills += won ? 1 : 0;
        onTrial?.(trial, won);
    }
    return kills / trials;
}
