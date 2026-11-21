// Compares the kind and channel constants the Rust kernels declare (`wasm/src/sense.rs`, `wasm/src/brain.rs`) with the
// JS that owns them: the hit kinds and strides of `js/sim/ray-gather.js` and the ray channels of `BRAIN_IO`
// (docs/designs/registries.md, "Brain inputs and outputs"). A constant that drifts changes the sim without a test
// noticing, since both sides are compiled separately.
import { BRAIN_IO } from '../../js/sim/brain-layout.js';
import * as gather from '../../js/sim/ray-gather.js';

/** The constants `sense.rs` must declare, with the value `ray-gather.js` gives each. */
const SENSE_EXPECTED = Object.freeze(
    Object.fromEntries(
        ['FOOD', 'AGENT', 'OBSTACLE', 'WALL', 'SMOKE', 'HERD', 'KIND_STRIDE', 'LOCAL_STRIDE'].map((name) => [
            name,
            gather[/** @type {keyof typeof gather} */ (name)],
        ]),
    ),
);

/**
 * @param {string} source a Rust source file
 * @returns {Map<string, number>} each top-level `const NAME: type = <number>;` by name
 */
export function rustConstants(source) {
    const found = new Map();
    for (const match of source.matchAll(
        /^(?:pub )?const ([A-Z][A-Z0-9_]*): [a-z0-9]+ = (-?[0-9][0-9_]*(?:\.[0-9]+)?);/gm,
    )) {
        found.set(match[1], Number(match[2].replaceAll('_', '')));
    }
    return found;
}

/**
 * @param {string} file the file's name, for the message
 * @param {Map<string, number>} constants its constants
 * @returns {string[]} problems: a `CH_<NAME>` constant that is not the index of that channel in `BRAIN_IO.channels`
 */
function channelProblems(file, constants) {
    const problems = [];
    for (const [name, value] of constants) {
        const channel = /^CH_([A-Z]+)$/.exec(name);
        const index = channel === null ? -1 : BRAIN_IO.channels.findIndex((c) => c.name.toUpperCase() === channel[1]);
        if (channel !== null && index !== value) {
            problems.push(`wasm: ${file} ${name} is ${value}, BRAIN_IO.channels puts it at ${index} - change both`);
        }
    }
    return problems;
}

/**
 * @param {{sense: string, brain: string}} sources the text of `wasm/src/sense.rs` and `wasm/src/brain.rs`
 * @returns {string[]} problems: a hit kind or stride of `sense.rs` that differs from `ray-gather.js` or is missing, and
 *   a `CH_` constant of either file that differs from the schema
 */
export function checkSchemaConstants({ sense, brain }) {
    const senseConstants = rustConstants(sense);
    const problems = [
        ...channelProblems('sense.rs', senseConstants),
        ...channelProblems('brain.rs', rustConstants(brain)),
    ];
    for (const [name, expected] of Object.entries(SENSE_EXPECTED)) {
        const actual = senseConstants.get(name);
        if (actual !== expected) {
            problems.push(
                `wasm: sense.rs ${name} is ${actual ?? 'missing'}, js/sim/ray-gather.js says ${expected} - change both`,
            );
        }
    }
    return problems;
}
