import { CENTRE, FORAGER, PREDATOR, playCredit } from './credit-stage.js';

/**
 * @param {number} x centre x
 * @param {number} y centre y
 * @param {Record<string, any>} [extra] fields over the defaults (angle 0, 800 energy)
 * @returns {import('../../../js/evo/pool-discrimination-stage.js').StagedAgent} a forager
 */
export const forager = (x, y, extra = {}) => ({ x, y, angle: 0, spec: FORAGER, energy: 800, ...extra });

/**
 * @param {number} x centre x
 * @param {number} y centre y
 * @param {Record<string, any>} [extra] fields over the defaults (angle 0, 800 energy)
 * @returns {import('../../../js/evo/pool-discrimination-stage.js').StagedAgent} a predator
 */
export const predator = (x, y, extra = {}) => ({ x, y, angle: 0, spec: PREDATOR, energy: 800, ...extra });

/**
 * @param {number} count food items
 * @param {number} gap px between neighbours
 * @param {{x: number, y?: number}} from the first item
 * @returns {{x: number, y: number}[]} a row heading east from `from`
 */
export function foodRow(count, gap, { x, y = CENTRE.y }) {
    return Array.from({ length: count }, (_, i) => ({ x: x + i * gap, y }));
}

/**
 * A dense patch: `count` items scattered over a box round the centre by a fixed generator, so every controller meets
 * the same food.
 * @param {number} count food items
 * @param {{seed: number, width?: number, height?: number}} patch the generator seed and the box
 * @returns {{x: number, y: number}[]} the items
 */
export function foodPatch(count, { seed, width = 1400, height = 1200 }) {
    let state = seed * 7919 + 1;
    const next = () => {
        state = (state * 1103515245 + 12345) % 2147483648;
        return state / 2147483648;
    };
    return Array.from({ length: count }, () => ({
        x: CENTRE.x - width / 2 + next() * width,
        y: CENTRE.y - height / 2 + next() * height,
    }));
}

/**
 * Plays one forager alone in a scene and reads its credits.
 * @param {string} arm the controller's name
 * @param {{foods: {x: number, y: number}[], start?: {x: number, y: number}, ticks?: number, seed?: number}} scene the
 *   food, where the forager starts (default left of the centre, facing east) and the run length (default 1500)
 * @returns {ReturnType<typeof playCredit>['credits'] extends (slot: number) => infer C ? C : never} slot 0's credits
 */
export function forage(arm, { foods, start = { x: 1000, y: CENTRE.y }, ticks = 1500, seed = 1 }) {
    const stage = { foods, rocks: [], agents: [forager(start.x, start.y)] };
    return playCredit({ stage, arms: arm, ticks, seed }).credits(0);
}

/**
 * Plays a predator (slot 0) and a forager (slot 1) and returns both agents' credits.
 * @param {{canHunt: string, rest: string}} arms the predator's and the prey's controller
 * @param {{gap: number, config?: Record<string, any>, preyEnergy?: number, ticks?: number, foods?: {x: number, y:
 *   number}[]}} scene the distance between them, config overrides, the prey's starting energy (default 800), the run
 *   length (default 1500) and any food
 * @returns {{hunter: ReturnType<typeof forage>, prey: ReturnType<typeof forage>, world: Record<string, any>}}
 */
export function duel(arms, { gap, config = {}, preyEnergy = 800, ticks = 1500, foods = [] }) {
    const agents = [predator(1000, CENTRE.y), forager(1000 + gap, CENTRE.y, { energy: preyEnergy })];
    const { credits, world } = playCredit({ stage: { foods, rocks: [], agents }, arms, ticks, config });
    return { hunter: credits(0), prey: credits(1), world };
}
