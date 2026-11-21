// Smoke in the role budget (docs/designs/role-budget.md, "Smoke" and "Defender smoke"): where a cloud lies, which rays it
// blocks, how long a hunter that keeps its speed and heading is blind, and how long the hidden body needs to leave the
// hunter's view. Pure: a 1D profile of the hunter along its heading and a 2D walk of the hidden body.

import { MAX_TICKS } from './role-budget-timeline.js';
import { cell } from './role-budget-cell.js';
import { charge, costOf, createBody, stepBody } from './role-budget-body.js';
import { norm, speedStep, swingTicks } from './role-budget-kinematics.js';
import { steerOut } from './role-budget-play.js';
import { viewReach, viewReachCos } from './role-budget-senses.js';

const TWO_PI = 2 * Math.PI;

/**
 * @typedef {object} Cloud
 * @property {number} x the centre's x (the hunter runs along the x axis)
 * @property {number} y the centre's y
 * @property {number} r the radius
 */

/**
 * @param {{x: number, y: number}} a one end of the segment
 * @param {{x: number, y: number}} b the other end
 * @param {Cloud} cloud the cloud
 * @returns {boolean} whether the segment meets the disc: the centre is closer than `r` to the nearest point of it. The test
 *   of a ray that meets a cloud before the body behind it (`SMOKE` of js/sim/ray-gather.js); a segment that starts inside
 *   the disc meets it
 */
export function segmentHitsCloud(a, b, cloud) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const u = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((cloud.x - a.x) * dx + (cloud.y - a.y) * dy) / len2));
    return norm(a.x + u * dx - cloud.x, a.y + u * dy - cloud.y) < cloud.r;
}

/**
 * @param {import('./role-budget-params.js').RoleParams} hunter the hunter
 * @param {{speed: number, sprint?: boolean, ticks?: number}} run its speed at tick 0, whether it sprints, and how far to go
 * @returns {number[]} its position along its heading after each tick, from 0 at tick 0: a straight run at its gait's
 *   `speedStep`, as a hunter that is blind keeps its speed and heading
 */
export function hunterXs(hunter, { speed, sprint = true, ticks = MAX_TICKS }) {
    const a = sprint ? hunter.thrust.sprint : hunter.thrust.cruise;
    const cap = sprint ? hunter.cap.sprint : hunter.cap.cruise;
    const xs = [0];
    let v = speed;
    for (let t = 1; t <= ticks; t++) {
        v = speedStep(v, a, hunter.damping, cap);
        xs.push(xs[t - 1] + v);
    }
    return xs;
}

/**
 * @typedef {object} Hidden a body that runs sideways out of the hunter's sight behind a cloud
 * @property {number} hiddenTicks the ticks from the release for which the hunter's line to the body meets the cloud,
 *   at most the cloud's life
 * @property {number} escapeNeed the ticks until the body is out of the hunter's view for good, `Infinity` when it never is
 */

/**
 * @param {import('./role-budget-params.js').RoleParams} hunter the hunter, heading along +x at `hx`
 * @param {import('./role-budget-body.js').Body} body the other body
 * @param {number} hx the hunter's position
 * @returns {boolean} whether the body is inside the hunter's view: closer than its reach at the bearing, plus the body's size
 */
function inView(hunter, body, hx) {
    const dx = body.x - hx;
    const dist = norm(dx, body.y);
    return dist < viewReachCos(hunter, dx / Math.max(dist, 1e-9)) + body.size;
}

/**
 * The hidden body runs sideways from the release at full sprint, steering at `(0, 1)` on the body law of the sim (it turns
 * and gathers speed, it does not jump to its cap); the hunter keeps its heading along `xs`. The hunter's view is its reach
 * at the bearing of the body from its heading, plus the body's size.
 * @param {import('./role-budget-params.js').RoleParams} hunter the hunter
 * @param {import('./role-budget-params.js').RoleParams} runner the hidden body
 * @param {{xs: number[], from: number, at: {x: number, y: number}, cloud: Cloud, life: number, paid?: number, lag?: number}} scene
 *   the hunter's profile and the index of the release in it, where the body stands (facing +x), the cloud, its life in ticks,
 *   the energy the body paid to release (0 when another body released) and the ticks before it starts to run (1 for a body
 *   that senses a cloud another body released, which exists from that tick's signal phase)
 * @returns {Hidden} the hidden and the escape ticks
 */
export function shadowRun(hunter, runner, { xs, from, at, cloud, life, paid = 0, lag = 0 }) {
    const b = createBody(runner, { x: at.x, y: at.y, angle: 0 });
    charge(b, paid);
    let hidden = 0;
    let blind = true;
    let seen = -1;
    for (let t = 0; from + t < xs.length; t++) {
        const hx = xs[from + t];
        seen = inView(hunter, b, hx) ? t : seen;
        blind = blind && t <= life && segmentHitsCloud({ x: hx, y: 0 }, b, cloud);
        hidden += blind ? 1 : 0;
        const out = t < lag ? { turn: 0, sprint: 0, thrust: 0 } : { turn: steerOut(b, { x: 0, y: 1 }), sprint: 1 };
        charge(b, costOf(b, out, stepBody(b, out)));
    }
    const last = xs.length - from - 1;
    return { hiddenTicks: Math.min(hidden, life), escapeNeed: seen >= last ? Infinity : seen + 1 };
}

/**
 * @param {import('./role-budget-params.js').RoleParams} releaser the body that releases
 * @param {import('./role-budget-model.js').RoleModel} model the model options
 * @param {{sinceRelease?: number}} [geometry] the ticks since this body last released (default: never has)
 * @returns {'ready' | 'cooling' | 'broke'} whether it may release: `cooling` inside `smokeCooldown`, `broke` when its energy
 *   is not above `smokeCost` (`smoke` in js/sim/calls.js)
 */
function mayRelease(releaser, model, { sinceRelease = Infinity } = {}) {
    if (sinceRelease < releaser.smoke.cooldown) {
        return 'cooling';
    }
    return releaser.energy > releaser.smoke.cost ? 'ready' : 'broke';
}

/**
 * The smoke cell of a prey the hunter closes on: it releases at `smokeGap` with its back to the hunter (the cloud lands
 * `size + smokeRadius` behind it, on the hunter's side), then runs sideways at its sprint cap.
 * @param {import('./role-budget-params.js').RoleParams} hunter the hunter
 * @param {import('./role-budget-params.js').RoleParams} prey the prey
 * @param {import('./role-budget-model.js').RoleModel & {sinceRelease?: number}} model the model options; `sinceRelease`
 *   is the ticks since the prey last released
 * @returns {{cell: import('./role-budget-cell.js').Cell, hiddenTicks: number, escapeNeed: number,
 *   energy: {cost: number, held: number}, cloud: Cloud}} the cell (slack `hiddenTicks - escapeNeed - reactionTicks`; `n/a`
 *   inside the cooldown; impossible when the prey cannot pay or never leaves the hunter's view) and its parts
 */
export function smokeCell(hunter, prey, model) {
    const gap = model.smokeGap;
    const r = prey.smoke.radius;
    const cloud = { x: gap - (prey.size + r), y: 0, r };
    const xs = hunterXs(hunter, { speed: hunter.cap.sprint });
    const { hiddenTicks, escapeNeed } = shadowRun(hunter, prey, {
        xs,
        from: 0,
        at: { x: gap, y: 0 },
        cloud,
        life: prey.smoke.ticks - 1,
        paid: prey.smoke.cost,
    });
    const state = mayRelease(prey, model, model);
    const margin = hiddenTicks - escapeNeed - model.reactionTicks;
    const slack = smokeMargin({ refused: false, state, slacks: [margin >= 0 ? margin : null] });
    return {
        cell: cell(slack, model),
        hiddenTicks,
        escapeNeed,
        energy: { cost: prey.smoke.cost, held: prey.energy },
        cloud,
    };
}

/**
 * @param {import('./role-budget-params.js').RoleParams} defender the defender
 * @param {{from: {x: number, y: number}, angle: number, to: {x: number, y: number}}} walk where it starts, which way it faces
 *   and the point it walks to
 * @returns {{ticks: number, angle: number}} the ticks to come within its size of the point, sprinting while steering at it
 *   (`Infinity` when it does not inside `MAX_TICKS`), and the heading it arrives on
 */
function walkTo(defender, { from, angle, to }) {
    const b = createBody(defender, { x: from.x, y: from.y, angle });
    for (let t = 0; t < MAX_TICKS; t++) {
        if (norm(to.x - b.x, to.y - b.y) < defender.size) {
            return { ticks: t, angle: b.angle };
        }
        stepBody(b, { turn: steerOut(b, { x: to.x - b.x, y: to.y - b.y }), sprint: 1 });
    }
    return { ticks: Infinity, angle: b.angle };
}

/**
 * @param {number} a an angle
 * @returns {number} its size once wrapped into [0, PI]
 */
function spread(a) {
    const w = ((a % TWO_PI) + TWO_PI) % TWO_PI;
    return w > Math.PI ? TWO_PI - w : w;
}

/**
 * @typedef {object} DefenderSmoke
 * @property {boolean} refused whether the geometry refuses the release: the defender faces the hunter, so the cloud lands
 *   behind it on the caller's side and the hunter's rays meet the defender first
 * @property {number} releasePoint the defender's position along the hunter-to-caller segment (hunter at 0)
 * @property {number} coast the distance a defender at its sprint cap coasts when it stops pushing, the stop the geometry
 *   assumes it makes on the spot
 * @property {number} facingTicks the ticks to turn its back to the hunter
 * @property {number} runTicks the ticks to walk onto the segment
 * @property {number} releaseTick the tick it releases
 * @property {number} latestRelease the last tick at which the cloud's near edge is still ahead of the hunter
 * @property {number} hiddenTicks the ticks the hunter's rays to the caller meet the cloud
 * @property {number} escapeNeed the ticks the caller needs to leave the hunter's view
 * @property {number | null} slackDefender `latestRelease - releaseTick`, null when it never gets there
 * @property {number | null} slackCaller `hiddenTicks - escapeNeed - reactionTicks`, null when the caller never escapes
 * @property {Cloud} cloud the cloud
 * @property {import('./role-budget-cell.js').Cell} cell the cell: the smaller slack, `n/a` inside the cooldown
 */

/**
 * @param {number[]} xs the hunter's profile along its heading
 * @param {{cloud: Cloud, reaction: number, speed: number}} at the cloud, the reaction ticks and the hunter's speed at tick 0
 * @returns {number} the last tick at which the cloud's near edge is still ahead of the hunter after its reaction ticks of
 *   travel, -1 when it never is
 */
function latestRelease(xs, { cloud, reaction, speed }) {
    let latest = -1;
    for (let t = 0; t < xs.length; t++) {
        const v = t === 0 ? speed : xs[t] - xs[t - 1];
        latest = xs[t] + v * reaction <= cloud.x - cloud.r ? t : latest;
    }
    return latest;
}

/**
 * @param {{refused: boolean, state: 'ready' | 'cooling' | 'broke', slacks: Array<number | null>}} read whether the geometry
 *   refuses, whether the defender may release, and the defender's and the caller's slack
 * @returns {number | null | undefined} the cell's margin: undefined (`n/a`) inside the cooldown, null (impossible) when
 *   refused, broke or either slack is negative or missing, else the smaller slack
 */
function smokeMargin({ refused, state, slacks }) {
    if (state === 'cooling') {
        return undefined;
    }
    const worst = slacks.includes(null) ? null : Math.min(.../** @type {number[]} */ (slacks));
    return refused || state === 'broke' || worst === null || worst < 0 ? null : worst;
}

/**
 * @param {Array<import('./role-budget-params.js').RoleParams>} bodies the hunter, the caller and the defender
 * @param {import('./role-budget-model.js').RoleModel & {sinceRelease?: number, facing?: 'caller' | 'hunter',
 *   gap?: number, standing?: number}} model the model options; `facing` is where the defender faces when it releases
 *   (default the caller); `standing` is the heading of a defender already on the spot at rest (it walked there; default:
 *   it walks from beside the caller)
 * @returns {DefenderSmoke} where and when the defender must release so that the cloud lies on the hunter-to-caller line
 */
export function defenderSmokeGeometry([hunter, caller, defender], model) {
    const length = model.gap ?? viewReach(caller, Math.PI) + hunter.size;
    const spot = length - (caller.size + defender.size);
    const cloud = { x: spot - (defender.size + defender.smoke.radius), y: 0, r: defender.smoke.radius };
    const walk =
        model.standing === undefined
            ? walkTo(defender, {
                  from: { x: length, y: model.defenderGap },
                  angle: -Math.PI / 2,
                  to: { x: spot, y: 0 },
              })
            : { ticks: 0, angle: model.standing };
    const facing = Math.ceil(swingTicks(spread(walk.angle), defender.turnRate.start));
    const releaseTick = 2 * model.reactionTicks + 1 + walk.ticks + facing;
    const xs = hunterXs(hunter, { speed: hunter.cap.cruise });
    const latest = latestRelease(xs, { cloud, reaction: model.reactionTicks, speed: hunter.cap.cruise });
    const from = Number.isFinite(releaseTick) ? Math.min(releaseTick, xs.length - 1) : 0;
    const hidden = shadowRun(hunter, caller, {
        xs,
        from,
        at: { x: length, y: 0 },
        cloud,
        life: defender.smoke.ticks - 1,
        lag: 1,
    });
    const slackDefender = Number.isFinite(releaseTick) ? latest - releaseTick : null;
    const margin = hidden.hiddenTicks - hidden.escapeNeed - model.reactionTicks;
    const slackCaller = Number.isFinite(margin) ? margin : null;
    const refused = model.facing === 'hunter';
    const state = mayRelease(defender, model, model);
    const slack = smokeMargin({ refused, state, slacks: [slackDefender, slackCaller] });
    return {
        refused,
        releasePoint: spot,
        coast: (defender.cap.sprint * defender.damping) / (1 - defender.damping),
        facingTicks: facing,
        runTicks: walk.ticks,
        releaseTick,
        latestRelease: latest,
        ...hidden,
        slackDefender,
        slackCaller,
        cloud,
        cell: cell(slack, model),
    };
}
