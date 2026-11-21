// Computes the input count and the weight-row offsets of the Elman RNN brain (the pooled-v6 layout, top 2 hits per channel) from a config.

/**
 * The name of the brain layout this file defines. Stamped into every genome, archive and champion file and checked on
 * load, so a file written under a layout of the same sizes but different meaning (another channel order, hit count or
 * block order) is refused by name. Change it whenever a gene's meaning or position changes.
 */
export const BRAIN_LAYOUT_NAME = 'pooled-v6';

/**
 * @typedef {object} IoChannel one raw ray channel
 * @property {string} name the channel's name, the suffix of its `CH_` constant
 * @property {string} display its name in the inspector
 * @property {boolean} pooled whether the brain's pooled row has a channel for it (every channel but `proximity`)
 */

/**
 * @typedef {object} IoSense a group of pooled values that are not a ray channel
 * @property {string} name the group's name
 * @property {readonly string[]} labels one label per value, in order
 */

/**
 * @typedef {object} IoBody one body input
 * @property {string} label its label in reports
 * @property {string} display its name in the inspector
 * @property {string} group its group in the inspector
 * @property {string} [key] its `BODY_INPUT` name, for an input the code reads by offset
 */

/**
 * @typedef {object} IoOutput one output
 * @property {string} name its name; `OUTPUT_INDEX` names it in upper case
 * @property {boolean} gene whether it has genes (a column in `wOut`, `bOut` and `wSkip`)
 * @property {string | null} threshold the config key above which it fires, null when it fires above 0 or is continuous
 */

/**
 * @param {readonly (readonly [string, string, string, string?])[]} rows label, inspector name, group and `BODY_INPUT` key
 * @returns {readonly IoBody[]} the body inputs, one per value
 */
const bodyInputs = (rows) =>
    Object.freeze(rows.map(([label, display, group, key]) => Object.freeze({ label, display, group, key })));

/**
 * The schema of the brain's inputs and outputs (docs/designs/registries.md, "Brain inputs and outputs"). Every offset,
 * count and label below is built from it, and so are the inspector's names and the checks of the Rust constants
 * (`scripts/check-wasm.mjs`). A body input or an output is added by one entry.
 */
export const BRAIN_IO = Object.freeze({
    /** The raw ray channels in order: channel 0 is the proximity, the rest set one class per ray. */
    channels: Object.freeze(
        /** @type {readonly IoChannel[]} */ (
            [
                ['proximity', 'proximity', false],
                ['food', 'food', true],
                ['threat', 'can bite me', true],
                ['prey', 'I can bite it', true],
                ['other', 'other', true],
                ['kin', 'kin', true],
                ['wall', 'wall', true],
                ['obstacle', 'obstacle', true],
                ['smoke', 'smoke', true],
                ['megafauna', 'megafauna', true],
            ].map(([name, display, pooled]) => Object.freeze({ name, display, pooled }))
        ),
    ),
    /**
     * The pooled values after the channels (docs/designs/body-genes.md, "Pooled values"): the size, speed and closing of
     * the two strongest prey hits and the strongest threat hit, the view share of four agent channels, then the hues of
     * the two pooled food hits, which stay last.
     */
    sense: Object.freeze(
        /** @type {readonly IoSense[]} */ (
            [
                ['prey', ['prey.size0', 'prey.speed0', 'prey.closing0', 'prey.size1', 'prey.speed1', 'prey.closing1']],
                ['threat', ['threat.size', 'threat.speed', 'threat.closing']],
                ['share', ['share.threat', 'share.prey', 'share.other', 'share.kin']],
                ['food.hue', ['food.hue0', 'food.hue1']],
            ].map(([name, labels]) => Object.freeze({ name, labels: Object.freeze(labels) }))
        ),
    ),
    /** The body block after the pooled values, one entry per input: body, senses, temperature, scent, calls, memory, refuge. */
    body: bodyInputs([
        ['energy', 'energy', 'Body'],
        ['vel.forward', 'forward speed', 'Body'],
        ['vel.side', 'lateral speed', 'Body'],
        ['turn_rate', 'turn rate', 'Body'],
        ['size', 'size', 'Body'],
        ['pregnant', 'pregnant', 'Body'],
        ['ready_to_mate', 'ready to mate', 'Body'],
        ['danger.here', 'danger here', 'Senses'],
        ['attack.here', 'attack here', 'Senses'],
        ['ate', 'ate recently', 'Senses'],
        ['bitten', 'bitten recently', 'Senses', 'BITTEN'],
        ['spec', 'type', 'Senses'],
        ['age', 'age', 'Body'],
        ['temp.0', 'temperature', 'Temperature'],
        ['temp.1', 'distance from optimal', 'Temperature'],
        ['temp.2', 'cold stress', 'Temperature'],
        ['temp.3', 'heat stress', 'Temperature'],
        ['danger.left', 'danger left', 'Scent antennae', 'SCENT'],
        ['danger.right', 'danger right', 'Scent antennae'],
        ['attack.left', 'attack left', 'Scent antennae'],
        ['attack.right', 'attack right', 'Scent antennae'],
        ['hunt_scent.here', 'hunt here', 'Scent antennae', 'HUNT_SCENT'],
        ['hunt_scent.left', 'hunt left', 'Scent antennae'],
        ['hunt_scent.right', 'hunt right', 'Scent antennae'],
        ['heard_alarm.loudness', 'alarm loudness', 'Heard calls', 'HEARD_ALARM'],
        ['heard_alarm.ahead', 'alarm ahead', 'Heard calls'],
        ['heard_alarm.side', 'alarm side', 'Heard calls'],
        ['heard_hunt.loudness', 'hunt loudness', 'Heard calls', 'HEARD_HUNT'],
        ['heard_hunt.ahead', 'hunt ahead', 'Heard calls'],
        ['heard_hunt.side', 'hunt side', 'Heard calls'],
        ['sex', 'sex', 'Body', 'SEX'],
        ['memory_a', 'memory A', 'Memory', 'MEMORY_A'],
        ['memory_b', 'memory B', 'Memory', 'MEMORY_B'],
        ['refuge.bearing_sin', 'refuge bearing sin', 'Refuge', 'REFUGE_BEARING_SIN'],
        ['refuge.bearing_cos', 'refuge bearing cos', 'Refuge', 'REFUGE_BEARING_COS'],
        ['refuge.near', 'refuge near', 'Refuge', 'REFUGE_NEAR'],
        ['reserve', 'sprint reserve', 'Body', 'RESERVE'],
    ]),
    /**
     * The outputs in order. `SPRINT`, `MATE` and `BITE` fire above 0, the calls above their own thresholds
     * (`js/sim/calls.js`), `THRUST` and `TURN` are continuous, `SPLIT` reads 0 (the split rule reads energy and age, not
     * the brain), and the memory outputs are written back as hidden state.
     */
    outputs: Object.freeze(
        /** @type {readonly IoOutput[]} */ (
            [
                ['thrust', true, null],
                ['turn', true, null],
                ['sprint', true, null],
                ['mate', true, null],
                ['bite', true, null],
                ['alarm', true, 'alarmThreshold'],
                ['smoke', true, 'smokeThreshold'],
                ['hunt', true, 'huntCallThreshold'],
                ['split', false, null],
                ['memory_a', true, null],
                ['memory_b', true, null],
            ].map(([name, gene, threshold]) => Object.freeze({ name, gene, threshold }))
        ),
    ),
});

/** Outputs per brain: thrust, turn, sprint, mate, bite, alarm, smoke, hunt call, split and two memory outputs. */
export const OUTPUT_COUNT = BRAIN_IO.outputs.length;

/**
 * Index of each output in an agent's output row, by upper-case name (`THRUST`, `SPLIT`, `MEMORY_A`), from the
 * schema's `outputs`.
 */
export const OUTPUT_INDEX = Object.freeze(
    Object.fromEntries(BRAIN_IO.outputs.map((output, index) => [output.name.toUpperCase(), index])),
);

/**
 * The outputs that have genes (weights in `wOut`, a bias in `bOut`, a column in `wSkip`), in column order: every output
 * but `SPLIT`, which has none and reads 0. Gene column `g` drives output `GENE_OUTPUTS[g]`.
 */
export const GENE_OUTPUTS = Object.freeze(BRAIN_IO.outputs.flatMap((output, index) => (output.gene ? [index] : [])));

/** Outputs with genes: `OUTPUT_COUNT` less the `SPLIT` output (10). */
export const GENE_OUTPUT_COUNT = GENE_OUTPUTS.length;

/** Values per ray: proximity, food, can bite me, I can bite it, other, kin, wall, obstacle, smoke, megafauna. */
export const RAY_CHANNELS = BRAIN_IO.channels.length;

/**
 * @param {string} name a channel name of `BRAIN_IO.channels`
 * @returns {number} its raw channel index
 */
const channelOf = (name) => BRAIN_IO.channels.findIndex((channel) => channel.name === name);

/** The raw ray channels, by the name `CH_` constants carry: each ray row's `[CH_x]` is that class's strength. */
export const CH_FOOD = channelOf('food');
export const CH_THREAT = channelOf('threat');
export const CH_PREY = channelOf('prey');
export const CH_OTHER = channelOf('other');
export const CH_KIN = channelOf('kin');
export const CH_WALL = channelOf('wall');
export const CH_OBSTACLE = channelOf('obstacle');
export const CH_SMOKE = channelOf('smoke');
/** Raw ray channel for herd bodies, appended after the Phase 1 smoke channel. */
export const CH_MEGAFAUNA = channelOf('megafauna');

/** Pooled channels, in order: the ray channels 1 to 9 (food, threat, prey, other, kin, wall, obstacle, smoke, megafauna). */
export const POOLED_CHANNELS = Object.freeze(
    BRAIN_IO.channels.filter((channel) => channel.pooled).map((channel) => channel.name),
);

/** Hits kept per pooled channel: the two strongest rays. */
export const POOLED_HITS = 2;

/** Values per hit: strength, then the cosine and sine of the ray's angle in the agent's frame. */
export const HIT_STRIDE = 3;

/** Values per pooled channel: `POOLED_HITS x HIT_STRIDE`, the strongest hit first. */
export const POOLED_STRIDE = POOLED_HITS * HIT_STRIDE;

/** The labels of each group of `BRAIN_IO.sense`, by its name. */
const SENSE_GROUPS = Object.fromEntries(BRAIN_IO.sense.map((group) => [group.name, group.labels]));

/** Hue values of the two pooled food hits. */
export const FOOD_HUE_VALUES = SENSE_GROUPS['food.hue'].length;

/**
 * The body sense values between the channels and the food hues: size, speed and closing of two prey hits and one threat
 * hit (9), then the view shares of threat, prey, other and kin (4).
 */
export const BODY_SENSE_VALUES = BRAIN_IO.sense.reduce((sum, group) => sum + group.labels.length, 0) - FOOD_HUE_VALUES;

/** Pooled values at the head of the brain's input row: 54 ray values, 13 body sense values and two food hues (69). */
export const POOLED_VALUES =
    POOLED_CHANNELS.length * POOLED_STRIDE + BRAIN_IO.sense.reduce((sum, group) => sum + group.labels.length, 0);

/**
 * Body inputs after the ray (or pooled) block: 17 of body and temperature, 13 scent and call inputs, `sex`, 2 memory,
 * 3 refuge (bearing sine and cosine, nearness) and `reserve` (the sprint store's level): one per entry of the schema's
 * `body`.
 */
export const EXTRA_INPUTS = BRAIN_IO.body.length;

/**
 * Body input offsets, from the start of the body block, of the entries that carry a `key`: the scent block (antennae,
 * hunt scent, heard calls), the sex input, the two memory read-backs (last tick's `MEMORY_A` and `MEMORY_B`), the
 * three refuge inputs and `reserve`.
 */
export const BODY_INPUT = Object.freeze(
    Object.fromEntries(BRAIN_IO.body.flatMap((input, index) => (input.key === undefined ? [] : [[input.key, index]]))),
);

/**
 * Trait gene slots after `wSkip` (docs/designs/body-genes.md, "The registry"): the eighteen named in `TRAIT_INDEX` and
 * six spare slots, which are 0 and read by nothing, so a trait added later changes no genome layout.
 */
export const TRAIT_SLOTS = 24;

/** Trait genes in a weight row: every slot, named or spare. */
export const TRAIT_GENES = TRAIT_SLOTS;

/**
 * Index of each named trait gene within the trait block. `SIZE`, `VISION`, `CHILD_SHARE` and `LEARN` are read today;
 * the rest exist, start at 0 and are read by nothing until the trait registry (`js/sim/body-traits.js`) reads them.
 */
export const TRAIT_INDEX = Object.freeze({
    SIZE: 0,
    VISION: 1,
    CHILD_SHARE: 2,
    LEARN: 3,
    SPEED: 4,
    SPRINT_STORE: 5,
    FAT: 6,
    HEAT_BAND: 7,
    BURN: 8,
    HEARING: 9,
    NOSE: 10,
    SMOKE_SIGHT: 11,
    EYES_OR_EARS: 12,
    CLEAR_OR_SMOKE: 13,
    AGILE_OR_FAST: 14,
    WIDE_OR_FAR: 15,
    GUT: 16,
    NERVE: 17,
});

/**
 * @typedef {object} BrainLayout
 * @property {number} inputCount the values the brain multiplies (`POOLED_VALUES + EXTRA_INPUTS`): the `pooled` row
 * @property {number} rawInputCount the values in the `inputs` row (`rayCount x RAY_CHANNELS + EXTRA_INPUTS`): the raw
 *   rays and the body block, which the observer and the scripted controllers read
 * @property {number} hidden hidden units
 * @property {number} outputCount outputs (`OUTPUT_COUNT`, the width of the `outputs` row)
 * @property {number} geneOutputs outputs with genes (`GENE_OUTPUT_COUNT`): the column count of `wOut`, `bOut` and `wSkip`
 * @property {number} wIn offset of the input-to-hidden block (`inputCount x hidden`)
 * @property {number} wRec offset of the hidden-to-hidden block (`hidden x hidden`)
 * @property {number} bHidden offset of the hidden biases
 * @property {number} wOut offset of the hidden-to-output block (`hidden x geneOutputs`, hidden-major)
 * @property {number} bOut offset of the output biases
 * @property {number} wSkip offset of the pooled-to-output skip block (`POOLED_VALUES x geneOutputs`, input-major)
 * @property {number} traitStart offset of the trait genes (`TRAIT_SLOTS`)
 * @property {number} leakStart offset of the leak genes (one per hidden unit)
 * @property {number} weightCount floats in one weight row
 */

/**
 * The layout of one agent's weight row, blocks in the order wIn, wRec, bHidden, wOut, bOut,
 * wSkip, trait genes, leak genes.
 * @param {Readonly<Record<string, any>>} config the config
 * @returns {Readonly<BrainLayout>}
 */
export function brainLayout(config) {
    const inputCount = POOLED_VALUES + EXTRA_INPUTS;
    const hidden = config.brainHidden;
    const wIn = 0;
    const wRec = wIn + inputCount * hidden;
    const bHidden = wRec + hidden * hidden;
    const wOut = bHidden + hidden;
    const bOut = wOut + hidden * GENE_OUTPUT_COUNT;
    const wSkip = bOut + GENE_OUTPUT_COUNT;
    const traitStart = wSkip + POOLED_VALUES * GENE_OUTPUT_COUNT;
    const leakStart = traitStart + TRAIT_GENES;
    const weightCount = leakStart + hidden;
    return Object.freeze({
        inputCount,
        rawInputCount: config.rayCount * RAY_CHANNELS + EXTRA_INPUTS,
        hidden,
        outputCount: OUTPUT_COUNT,
        geneOutputs: GENE_OUTPUT_COUNT,
        wIn,
        wRec,
        bHidden,
        wOut,
        bOut,
        wSkip,
        traitStart,
        leakStart,
        weightCount,
    });
}

/**
 * @param {Readonly<Record<string, any>>} layout a `brainLayout` result
 * @returns {{ name: string, inputCount: number, brainHidden: number, outputCount: number }} the stamp saved files carry
 *   and `assertLayoutStamp` checks: the layout name and the three sizes
 */
export function layoutStamp(layout) {
    return {
        name: BRAIN_LAYOUT_NAME,
        inputCount: layout.inputCount,
        brainHidden: layout.hidden,
        outputCount: layout.outputCount,
    };
}

/**
 * @typedef {object} InputOffsets
 * @property {Readonly<Record<string, number>>} pooled index of each pooled channel's strongest hit in the brain's
 *   input row (its cosine and sine follow, then the second hit's three values); `kin` is among them
 * @property {number} senseStart index of the body sense values after the channels (size, speed and closing of two prey
 *   hits, then of one threat hit)
 * @property {number} countStart index of the four view shares (threat, prey, other, kin)
 * @property {number} foodHueStart index of the two food hues after the body sense values
 * @property {number} bodyStart index of the body block in the brain's input row
 * @property {number} scentStart index of the first scent input (the danger antennae)
 * @property {number} huntScent index of the hunt scent here (the left and right antennae follow)
 * @property {number} heardAlarm index of the heard alarm loudness (ahead and side follow)
 * @property {number} heardHunt index of the heard hunt call loudness (ahead and side follow)
 * @property {number} sex index of the sex input
 * @property {number} memoryA index of the `MEMORY_A` read-back
 * @property {number} memoryB index of the `MEMORY_B` read-back
 * @property {number} refuge index of `refugeBearingSin` (`refugeBearingCos` and `refugeNear` follow)
 * @property {number} reserve index of `reserve`, the sprint store's level
 * @property {number} rawBodyStart index of the body block in the raw `inputs` row (after the ray block)
 */

/**
 * The absolute input indices the probes, the observer and the inspector read instead of literals.
 * @param {Readonly<Record<string, any>>} config the config
 * @returns {Readonly<InputOffsets>} indices into the brain's input row, except `rawBodyStart`
 */
export function inputOffsets(config) {
    /** @type {Record<string, number>} */
    const pooled = {};
    POOLED_CHANNELS.forEach((name, c) => {
        pooled[name] = c * POOLED_STRIDE;
    });
    const at = (/** @type {number} */ offset) => POOLED_VALUES + offset;
    const senseStart = POOLED_CHANNELS.length * POOLED_STRIDE;
    return Object.freeze({
        pooled: Object.freeze(pooled),
        senseStart,
        countStart: senseStart + SENSE_GROUPS.prey.length + SENSE_GROUPS.threat.length,
        foodHueStart: POOLED_VALUES - FOOD_HUE_VALUES,
        bodyStart: POOLED_VALUES,
        scentStart: at(BODY_INPUT.SCENT),
        huntScent: at(BODY_INPUT.HUNT_SCENT),
        heardAlarm: at(BODY_INPUT.HEARD_ALARM),
        heardHunt: at(BODY_INPUT.HEARD_HUNT),
        sex: at(BODY_INPUT.SEX),
        memoryA: at(BODY_INPUT.MEMORY_A),
        memoryB: at(BODY_INPUT.MEMORY_B),
        refuge: at(BODY_INPUT.REFUGE_BEARING_SIN),
        reserve: at(BODY_INPUT.RESERVE),
        rawBodyStart: config.rayCount * RAY_CHANNELS,
    });
}
