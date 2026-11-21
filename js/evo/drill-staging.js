// Staging parts the drills share (`drill-scenarios.js`, `drill-scenarios-social.js`): an offset drawn from the drill's
// stream, the subject at the arena's centre, a stage, the kill test and the one-prey predator drill.

import { nextFloat } from '../sim/rng.js';
import { createPreyTrace, noteTick, traceFields } from './drill-trace.js';
import {
    CENTRE_X,
    CENTRE_Y,
    HUNTER_ENERGY,
    PREY_VIEW_SHARE,
    SUBJECT_ENERGY,
    around,
    heading,
} from './memory-probe-scenarios.js';
import { SPEC } from '../sim/specs.js';

const DEG = 6.283185307179586 / 360;

/**
 * @typedef {object} DrillArm a control arm of a drill, played on the same bearings as the drill's own plan
 * @property {string} name the arm's name (`solo`, `kin-blind`)
 * @property {(rng: import('../sim/rng.js').Rng, view: number) => import('./memory-probe-run.js').Plan} plan one trial's
 *   staging
 * @property {{name: string, kinBlind?: boolean}} controlSpec the control the arm's trials run under
 */

/**
 * @typedef {object} Drill
 * @property {string} name the drill's name
 * @property {string} scene the scene it detects (principles.md)
 * @property {number} spec the specialisation the subject is staged with
 * @property {boolean} needsHunter whether the subject must have a `canHunt` specialisation
 * @property {(rng: import('../sim/rng.js').Rng, view: number) => import('./memory-probe-run.js').Plan} plan one
 *   trial's staging, drawn from the drill's stream; `view` is the subject's ray length
 * @property {Record<string, any>} [arena] config overrides the drill's trials run under (the arena rules)
 * @property {readonly DrillArm[]} [arms] control arms a subject is also played on when the caller asks for them
 *   (`pack-converge`: the lone hunter, and the trio that cannot sense each other)
 */

/**
 * @param {import('../sim/rng.js').Rng} rng the drill's stream
 * @param {number} lowDeg the smallest offset in degrees
 * @param {number} highDeg the largest offset in degrees
 * @returns {number} an offset in radians of either sign
 */
export function offset(rng, lowDeg, highDeg) {
    const size = (lowDeg + nextFloat(rng) * (highDeg - lowDeg)) * DEG;
    return nextFloat(rng) < 0.5 ? -size : size;
}

/**
 * @param {number} spec the subject's specialisation
 * @param {number} angle its heading
 * @returns {Record<string, any>} the subject at the arena's centre
 */
export function subjectAt(spec, angle) {
    const energy = spec === SPEC.PREDATOR ? HUNTER_ENERGY : SUBJECT_ENERGY;
    return { role: 'subject', x: CENTRE_X, y: CENTRE_Y, angle, spec, energy };
}

/**
 * @param {Record<string, any>[]} agents the staged agents
 * @param {{x: number, y: number, hue?: number, toxicity?: number}[]} foods the foods
 * @param {{x: number, y: number, r: number}[]} [rocks] the rocks
 * @returns {import('./memory-probe-run.js').Plan['stage']} the stage
 */
export function stage(agents, foods, rocks = []) {
    return { foods, rocks, agents };
}

/**
 * A fleeing prey can starve (it sprints), so a dead prey is not a kill; the sim's own credit for a deliberate kill is.
 * @param {Record<string, any>} world the world
 * @returns {boolean} whether the subject killed the prey
 */
export function killed(world) {
    return world.alive[1] === 0 && world.deliberateKills[0] > 0;
}

/**
 * @param {string} name the drill's name
 * @param {{energy: number, maxTicks: number, abort: boolean, baseSize?: number, role?: 'prey' | 'adrift',
 *   preyAngle?: (rng: import('../sim/rng.js').Rng, subjectAngle: number) => number}} prey the prey's energy, the length,
 *   whether the drill is won by not biting, the prey's base size (default: the config's), its role (`prey`, the scripted
 *   fleer, by default; `adrift` is inert and does not run) and its starting heading (default: any, drawn after its place)
 * @returns {Drill} a predator drill with one scripted forager, fleeing or adrift
 */
export function preyDrill(
    name,
    { energy, maxTicks, abort, baseSize, role = 'prey', preyAngle = (rng) => heading(rng) },
) {
    return {
        name,
        scene: abort ? 'Abort' : 'A real chase',
        spec: SPEC.PREDATOR,
        needsHunter: true,
        plan(rng, view) {
            const angle = heading(rng);
            const spot = around(angle + offset(rng, 0, 45), PREY_VIEW_SHARE * view);
            const prey = { role, ...spot, angle: preyAngle(rng, angle), spec: SPEC.FORAGER, energy, baseSize };
            let bitten = false;
            const trace = createPreyTrace();
            return {
                stage: stage([subjectAt(SPEC.PREDATOR, angle), prey], []),
                timing: null,
                scent: false,
                maxTicks,
                trace: abort ? undefined : (won) => traceFields(trace, won),
                done: (world) => {
                    bitten ||= world.lastBiter[1] === world.genomeId[0];
                    noteTick(trace, world);
                    return world.alive[0] === 0 || world.alive[1] === 0 || (abort && bitten);
                },
                won: (world) => (abort ? world.alive[0] === 1 && !bitten : killed(world)),
            };
        },
    };
}
