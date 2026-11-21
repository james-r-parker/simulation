// The defender's escort distance (docs/designs/role-budget.md, "The defender row is read at an escort distance"): how far from
// the caller a good defender stands when the hunter closes. A guard stays near the herd it guards (a musk-ox ring, a meerkat
// sentinel), so the row reads the defender close, not 150 px off. Pure: it reads two `RoleParams` and the model.

/**
 * The clearance of the escort, in defender body radii, between the two bodies' edges. A defender closer than the sum of the
 * two sizes overlaps the caller and is pushed off it (`collide`), and one body radius of air is the nearest a guard stands
 * without bumping the body it guards. A calculator constant: no world rule reads it.
 */
export const ESCORT_CLEARANCE = 1;

/**
 * @param {import('./role-budget-params.js').RoleParams} defender the defender
 * @param {import('./role-budget-params.js').RoleParams} caller the caller it guards
 * @param {{escortGap: number | null}} model the model options
 * @returns {number} the distance of the defender from the caller when the hunter closes, in px: the model's `escortGap`, or
 *   the caller's size, the defender's size and `ESCORT_CLEARANCE` defender radii when it is null
 */
export function escortGap(defender, caller, model) {
    return model.escortGap ?? caller.size + defender.size * (1 + ESCORT_CLEARANCE);
}

/**
 * Where the defender stands when the hunter closes. A guard faces the threat between it and the herd, the way musk oxen face
 * outward, and that is `between`: the defender on the hunter's approach line, `escortGap` from the caller, facing the hunter,
 * at rest. `side` is the first reading: beside the caller, at right angles to the hunter, facing away. The derived default is
 * `side` while the row stays red with `between` on (the smoke cell is `impossible` either way, so the guard does not yet
 * change the row's status and changes no number the plan quotes); `--model guardPosture=between` reads the guard.
 * @param {{guardPosture: 'side' | 'between' | null}} model the model options
 * @returns {'side' | 'between'} the posture: the model's `guardPosture`, or `side` when it is null
 */
export function guardPosture(model) {
    return model.guardPosture ?? 'side';
}
