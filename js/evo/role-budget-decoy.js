// The decoy in the role budget (docs/designs/smoke-decoy.md): a hunter whose rays read a fresh cloud as a body runs at the
// cloud, grips it (stops thrusting once it is at its mouth) and holds there while the cloud is a decoy, then runs on blind.
// Pure: it rewrites a hunter's 1D profile along its heading.

import { speedStep } from './role-budget-kinematics.js';

/** The proximity of a ray hit from which a hunter has its target in its jaws and stops thrusting to grip it. */
export const GRIP = 0.95;

/**
 * @param {import('./role-budget-params.js').RoleParams} hunter the hunter
 * @param {{xs: number[], from: number, cloud: {x: number, r: number}, held: number, speed?: number}} scene its profile along its
 *   heading, the index of the release in it, the cloud (its centre x on the heading, its radius), the ticks the cloud is a
 *   decoy and its speed at tick 0 (read from the profile when the release is later)
 * @returns {number[]} the profile with the decoy: unchanged up to `from`; then the hunter sprints until its nearest ray hit is
 *   within `(1 - GRIP)` of its view of the cloud, coasts (no thrust, the cruise speed cap, the sim's damping) to the end of the decoy at
 *   `from + held`, then sprints on blind. `held` 0 returns `xs` itself
 */
export function decoyProfile(hunter, { xs, from, cloud, held, speed = hunter.cap.cruise }) {
    if (held <= 0 || from >= xs.length - 1) {
        return xs;
    }
    const grip = cloud.x - cloud.r - (1 - GRIP) * hunter.view.range;
    const out = xs.slice(0, from + 1);
    let v = from > 0 ? xs[from] - xs[from - 1] : speed;
    for (let t = from + 1; t < xs.length; t++) {
        const holding = t <= from + held && out[t - 1] >= grip;
        // a gripped hunter drops its sprint, so its speed cap is the cruise cap as well as its thrust 0
        v = holding
            ? speedStep(v, 0, hunter.damping, hunter.cap.cruise)
            : speedStep(v, hunter.thrust.sprint, hunter.damping, hunter.cap.sprint);
        out.push(out[t - 1] + v);
    }
    return out;
}
