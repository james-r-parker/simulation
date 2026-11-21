// The effect readers alone (`npm run bench:micro -- --area effects`, docs/designs/status-effects.md Phase 5): `liveOf` on
// the `maxThrust` and `passiveLoss` lanes, `gateOpen` on the `mate` and `eat` gates and the fade pass, each over every slot
// of the warmed 500-agent micro world, so each speed task is timed with `--compare origin/main`.
import { GATE, LANE_ID, fadeEffects, gateOpen, liveOf } from '../../js/sim/effects.js';
import { aliveSlots, microSuite, microWorld } from './fixture.js';

const world = microWorld();
const slots = aliveSlots(world);
const MAX_THRUST = LANE_ID.maxThrust;
const PASSIVE_LOSS = LANE_ID.passiveLoss;
/** Where each reader's results are summed, so the compiler cannot drop the calls. */
const sink = new Float64Array(1);

/**
 * @param {number} lane a lane's index
 * @returns {() => void} a pass of `liveOf` on the lane over every alive slot
 */
function liveOver(lane) {
    return () => {
        for (const slot of slots) {
            sink[0] += liveOf(world, slot, lane);
        }
    };
}

/**
 * @param {number} gate a `GATE` code
 * @returns {() => void} a pass of `gateOpen` on the gate over every alive slot
 */
function gateOver(gate) {
    return () => {
        for (const slot of slots) {
            sink[0] += gateOpen(world, slot, gate) ? 1 : 0;
        }
    };
}

microSuite('effects-readers', [
    [`liveOf maxThrust x ${slots.length} agents`, liveOver(MAX_THRUST)],
    [`liveOf passiveLoss x ${slots.length} agents`, liveOver(PASSIVE_LOSS)],
    [`gateOpen mate x ${slots.length} agents`, gateOver(GATE.MATE)],
    [`gateOpen eat x ${slots.length} agents`, gateOver(GATE.EAT)],
    ['fadeEffects, 500-agent world', () => fadeEffects(world)],
]);
