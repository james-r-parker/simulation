// One body of the chase timeline (docs/designs/role-budget.md, "Phase 1 steps"): its state and the per-tick law of the
// sim for it, in the order the sim runs it (the sprint store, then `actAll`, then `moveAgentsKernel`, then `tickCost`),
// without a world. A scalar mirror of js/sim/physics.js, sprint-store.js and energy.js, graded by an effort `e`.

import { detCos, detSin } from '../sim/det-math.js';
import { norm, sprintFactor } from './role-budget-kinematics.js';

const PI = Math.PI;
const TWO_PI = 2 * PI;

/**
 * @typedef {object} Out the outputs one body holds for a tick
 * @property {number} [thrust] the `THRUST` output, 1 when absent
 * @property {number} turn the `TURN` output, -1 to 1
 * @property {number} sprint the sprint effort, 0 for none, up to 1
 */

/**
 * @typedef {object} Body
 * @property {import('./role-budget-params.js').RoleParams} p the body's numbers
 * @property {number} x
 * @property {number} y
 * @property {number} vx
 * @property {number} vy
 * @property {number} angle
 * @property {number} ch the cosine of the angle, kept with it so the steering reads no trigonometry
 * @property {number} sh the sine of the angle
 * @property {number} energy
 * @property {number} size
 * @property {number} level the sprint store, 0 to 1
 * @property {number} turnRate the turn applied this tick
 * @property {number} spent the energy the costs have taken
 */

/**
 * @param {import('./role-budget-params.js').RoleParams} p a body's numbers
 * @param {{x: number, y: number, angle: number, speed?: number}} at where it stands, its heading and its speed along it
 * @returns {Body} the body at the start energy with a full store
 */
export function createBody(p, { x, y, angle, speed = 0 }) {
    return {
        p,
        x,
        y,
        vx: speed * detCos(angle),
        vy: speed * detSin(angle),
        angle,
        ch: detCos(angle),
        sh: detSin(angle),
        energy: p.energy,
        size: p.size,
        level: 1,
        turnRate: 0,
        spent: 0,
    };
}

/**
 * @param {Body} b the body
 * @returns {number} its fat factor `1 - fatSlowShare x energy / maxEnergy`
 */
export function fatOf(b) {
    return 1 - (b.p.thrust.fatShare * b.energy) / b.p.sizing.max;
}

/**
 * @param {Body} b the body
 * @returns {number} the sprint factor of its store as the tick begins (1 with the store off)
 */
export function factorOf(b) {
    return b.p.store.on === 1 ? sprintFactor(b.level, b.p.store.floor) : 1;
}

/**
 * @param {Body} b the body
 * @returns {boolean} whether its store is above the floor (true with the store off): the oracles sprint only then
 */
export function aboveFloor(b) {
    return b.p.store.on === 0 || b.level > b.p.store.floor;
}

/**
 * @param {Body} b the body
 * @returns {number} its speed
 */
export function speedOf(b) {
    return norm(b.vx, b.vy);
}

/**
 * Runs the store, the act and the move of one tick: drains the store by `drain x e` while sprinting, turns, adds the
 * thrust along the new heading, damps, caps (raised by the sprint) and moves.
 * @param {Body} b the body, updated in place
 * @param {Out} out its outputs
 * @returns {number} the sprint factor the tick read before the drain, which the cost of the tick needs
 */
export function stepBody(b, out) {
    const { p } = b;
    const factor = factorOf(b);
    const gain = out.sprint > 0 ? 1 + p.thrust.gain * factor * out.sprint : 1;
    if (out.sprint > 0 && p.store.on === 1) {
        b.level = Math.max(0, b.level - p.store.drain * out.sprint);
    }
    const fat = fatOf(b);
    b.turnRate = out.turn * p.turnRate.max * fat;
    let a = b.angle + b.turnRate;
    a = a >= PI ? a - TWO_PI : a < -PI ? a + TWO_PI : a;
    b.angle = a;
    const thrust = p.thrust.base * gain * fat * (out.thrust ?? 1);
    b.ch = detCos(a);
    b.sh = detSin(a);
    b.vx = (b.vx + thrust * b.ch) * p.damping;
    b.vy = (b.vy + thrust * b.sh) * p.damping;
    const cap = p.cap.cruise * gain;
    const speed = speedOf(b);
    if (speed > cap) {
        b.vx *= cap / speed;
        b.vy *= cap / speed;
    }
    b.x += b.vx;
    b.y += b.vy;
    return factor;
}

/**
 * @param {Body} b the body
 * @returns {number} its size for an energy: `max(minSize, baseSize + energy / energyToSize)`
 */
export function sizeOf(b) {
    const { sizing } = b.p;
    return Math.max(sizing.min, sizing.base + b.energy / sizing.perEnergy);
}

/**
 * The energy `tickCost` takes for the tick just moved, from the speed now and the size as it stood.
 * @param {Body} b the body
 * @param {Out} out its outputs this tick
 * @param {number} factor the sprint factor read as the tick began
 * @returns {number} the cost
 */
export function costOf(b, out, factor) {
    const { cost } = b.p;
    const speed = speedOf(b);
    const standing = (cost.passive + cost.size * cost.standingMult * b.size) * cost.heat;
    const base = (standing + cost.move * speed * speed + cost.turn * Math.abs(b.turnRate)) * cost.drain * cost.juvenile;
    const sprint = out.sprint > 0 ? cost.sprint * cost.juvenile * factor * out.sprint : 0;
    return base + sprint + cost.upkeep;
}

/**
 * Charges the tick's cost, never below 0, and recomputes the size.
 * @param {Body} b the body, updated in place
 * @param {number} cost the energy to take
 * @returns {void}
 */
export function charge(b, cost) {
    const taken = Math.min(cost, b.energy);
    b.energy -= taken;
    b.spent += taken;
    b.size = sizeOf(b);
}

/**
 * Resolves the overlap of the hunter (the lower slot) and the prey as `resolveContacts` does: an impulse along the line of
 * centres when they approach, mass the size squared, with the config's restitution, then the two pushed apart.
 * @param {Body} h the hunter, updated in place
 * @param {Body} p the prey, updated in place
 * @returns {void}
 */
export function collide(h, p) {
    const dx = p.x - h.x;
    const dy = p.y - h.y;
    const d = norm(dx, dy);
    const nx = d === 0 ? 1 : dx / d;
    const ny = d === 0 ? 0 : dy / d;
    const mi = h.size * h.size;
    const mj = p.size * p.size;
    const vn = (p.vx - h.vx) * nx + (p.vy - h.vy) * ny;
    if (vn < 0) {
        const jn = (-(1 + h.p.contact.restitution) * vn) / (1 / mi + 1 / mj);
        h.vx -= (jn * nx) / mi;
        h.vy -= (jn * ny) / mi;
        p.vx += (jn * nx) / mj;
        p.vy += (jn * ny) / mj;
    }
    const pen = h.size + p.size - d;
    h.x -= (nx * pen * mj) / (mi + mj);
    h.y -= (ny * pen * mj) / (mi + mj);
    p.x += (nx * pen * mi) / (mi + mj);
    p.y += (ny * pen * mi) / (mi + mj);
}

/**
 * @param {Body} h the biter
 * @param {Body} p the victim
 * @returns {boolean} whether the victim's centre lies within `biteArc` of the biter's heading (`inJaws`)
 */
export function inJaws(h, p) {
    if (h.p.bite.arc >= PI) {
        return true;
    }
    const dx = p.x - h.x;
    const dy = p.y - h.y;
    return dx * detCos(h.angle) + dy * detSin(h.angle) >= detCos(h.p.bite.arc) * norm(dx, dy);
}

/**
 * @param {Body} h the biter
 * @param {Body} p the victim
 * @returns {boolean} whether the size gate lets `h` bite `p` as the sizes stand now (`couldBite` reads it on each bite, so a
 *   gate refused at first contact opens once the victim has shrunk)
 */
export function mayBite(h, p) {
    return h.size > h.p.bite.sizeRatio * p.size;
}

/**
 * Lands one bite if the prey is in the jaws: the victim loses `biteEnergy x alarm x its biteTaken`, the hunter gains it, a
 * fatal bite (the victim at or under its kill line) also gives the gorge, and the hunter pays the kick, read before the bite.
 * @param {Body} h the biter, updated in place
 * @param {Body} p the victim, updated in place
 * @param {{bites: number, income: number, kick: number}} tally the bites, energy returned and kicks, updated in place
 * @param {boolean} [alarmed] whether the victim's seen alarm is running, which cuts the bite to `alarmBiteShare`
 * @returns {boolean} whether the bite killed
 */
export function bite(h, p, tally, alarmed = false) {
    if (!inJaws(h, p)) {
        return false;
    }
    const hp = h.p;
    const vp = p.p;
    const kick = hp.bite.cost * (p.size / h.size) * (0.5 + p.energy / vp.sizing.max) * vp.bite.kick;
    const moved = Math.min(hp.bite.damage * (alarmed ? hp.bite.alarm : 1) * vp.bite.taken, p.energy);
    const gained = Math.min(moved, hp.sizing.max - h.energy);
    p.energy -= moved;
    h.energy += gained;
    tally.bites += 1;
    tally.income += gained;
    const fatal = p.energy <= vp.kill.line;
    if (fatal && p.energy > 0) {
        const take = Math.min(p.energy, hp.kill.gorgeShare * p.energy, hp.kill.gorgeCap, hp.sizing.max - h.energy);
        h.energy += take;
        p.energy -= take;
        tally.income += take;
    }
    p.size = sizeOf(p);
    h.size = sizeOf(h);
    const paid = Math.min(kick, h.energy);
    h.energy -= paid;
    h.size = sizeOf(h);
    tally.kick += paid;
    return fatal;
}
