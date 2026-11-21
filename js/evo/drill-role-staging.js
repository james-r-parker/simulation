// Staging parts the role drills share (`drill-role-defend.js`, `drill-role-warn.js`): a drill puts a genome in the performer's
// seat of a scene of docs/designs/role-budget.md and scripts the other bodies with the oracle brains of `chase-oracles.js`.
// The scene is the one `playDefence` and `playWarning` (`role-scenes-*.js`) play, turned to a heading drawn from the drill's
// stream and mirrored to either side, so a genome meets it from every bearing. A detector: never fitness, merit, mate rank or
// archive rank.

import { detCos, detSin } from '../sim/det-math.js';
import { createConfig } from '../sim/config.js';
import { ARENA_CENTRE, ARENA_HEIGHT, ARENA_WIDTH } from './chase-arena.js';
import { roleParams } from './role-budget-params.js';

/** The slots of both scenes: the hunter first, the body it is after second, the performer (the subject) third. */
export const SLOT = Object.freeze({ HUNTER: 0, OTHER: 1, SUBJECT: 2 });

/** The role of the scripted hunter, and of the scripted body it is after (the caller of the defence, the herd of the warning). */
export const ROLE = Object.freeze({ HUNTER: 'stalker', OTHER: 'herd' });

/** The keys the stage world's staging knobs change that the scenes read at their defaults: the arena puts them back. */
const RESTORED = Object.freeze([
    'grazeThrust',
    'fatSlowShare',
    'strikeMissCost',
    'specMutationRate',
    'capBirthsEnabled',
]);

/**
 * The arena of a role drill: the world of the chase arena, big enough that no scene of `MAX_TICKS` reaches a wall, and the rules
 * the stage world switches off put back to the defaults, so the scene plays as `playDefence` and `playWarning` play it.
 */
/** @type {Readonly<Record<string, any>>} */
export const ROLE_ARENA = Object.freeze({
    worldWidth: ARENA_WIDTH,
    worldHeight: ARENA_HEIGHT,
    ...Object.fromEntries(RESTORED.map((key) => [key, /** @type {Record<string, any>} */ (createConfig())[key]])),
});

/** The validated config of the role arena: what a drill's plan runs under when it is given none. */
export const ROLE_CONFIG = createConfig(ROLE_ARENA);

/**
 * @param {number} angle the heading the scene is turned to
 * @param {{x: number, y: number}} offset a point in the scene's own frame (the hunter at the origin, heading +x)
 * @returns {{x: number, y: number}} the point in the arena
 */
export function turned(angle, { x, y }) {
    const c = detCos(angle);
    const s = detSin(angle);
    return { x: ARENA_CENTRE.x + x * c - y * s, y: ARENA_CENTRE.y + x * s + y * c };
}

/**
 * @param {Readonly<Record<string, any>>} config the validated config
 * @param {string[]} names specialisation names
 * @returns {import('./role-budget-params.js').RoleParams[]} their body numbers under the config
 */
export function paramsOf(config, ...names) {
    return names.map((name) => roleParams(config, name));
}

/**
 * Wraps the scripted hunter's brain so that, on the first tick, the hunter is already creeping at its cruise speed along its
 * heading (the scenes stage it that way: it was creeping when the scene began).
 * @param {(world: Record<string, any>) => void} brain the hunter's brain
 * @param {{cruise: number, angle: number}} start its cruise speed and heading
 * @returns {(world: Record<string, any>) => void} the brain
 */
export function creeping(brain, { cruise, angle }) {
    return (world) => {
        if (world.tick === 0) {
            world.vx[SLOT.HUNTER] = cruise * detCos(angle);
            world.vy[SLOT.HUNTER] = cruise * detSin(angle);
        }
        brain(world);
    };
}

/**
 * A reference's brain is stateful (an oracle remembers the tick it heard), and one subject plays every trial: this builds a
 * fresh brain whenever the world is a new one.
 * @param {(world: Record<string, any>) => (world: Record<string, any>) => void} build builds the brain from a world
 * @returns {(world: Record<string, any>) => void} a controller that rebuilds on a new world
 */
export function perWorld(build) {
    /** @type {Record<string, any> | null} */
    let seen = null;
    /** @type {((world: Record<string, any>) => void) | null} */
    let brain = null;
    return (world) => {
        if (brain === null || world !== seen) {
            seen = world;
            brain = build(world);
        }
        brain(world);
    };
}
