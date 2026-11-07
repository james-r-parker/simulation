// The training curriculum (training.md, Trainer): an ordered list of stages, each a config and a number of generations,
// run on one archive. A stage changes the world, never the reward. Pure: no files (the script loads the configs).

/**
 * @typedef {object} CurriculumEntry
 * @property {string} name the stage's name
 * @property {string | null} config a config overrides file, or null for the default config
 * @property {number} [generations] generations in the stage; the last stage may omit it, and always runs to the end
 */

/**
 * @typedef {object} Stage
 * @property {string} name the stage's name
 * @property {string | null} config its config overrides file, or null
 * @property {number} from the first generation (0-based) it runs
 * @property {number} to one past the last generation it runs
 */

/** The curriculum of a run without `--curriculum`: the default config for every generation. */
export const DEFAULT_CURRICULUM = Object.freeze([Object.freeze({ name: 'default', config: null })]);

/**
 * @param {unknown} entry a curriculum entry
 * @param {number} index its position
 * @param {number} last the last position
 * @returns {void}
 * @throws {Error} naming the entry when it is malformed, or lacks `generations` and is not the last
 */
function checkEntry(entry, index, last) {
    const e = /** @type {Record<string, any>} */ (entry);
    const where = `curriculum[${index}]`;
    if (typeof e !== 'object' || e === null || typeof e.name !== 'string' || e.name === '') {
        throw new Error(`${where}: expected an object with a non-empty "name"`);
    }
    if (e.config !== null && typeof e.config !== 'string') {
        throw new Error(`${where} (${e.name}): "config" must be a file path or null`);
    }
    const missing = e.generations === undefined;
    if (missing ? index !== last : !(Number.isInteger(e.generations) && e.generations >= 1)) {
        throw new Error(
            `${where} (${e.name}): "generations" must be an integer >= 1 (only the last stage may omit it)`,
        );
    }
}

/**
 * Lays the stages out over the run. The last stage takes whatever is left, whatever its `generations`; a stage that begins
 * at or after `generations` is dropped, and one that crosses it is cut.
 * @param {readonly CurriculumEntry[]} entries the stages in order
 * @param {number} generations the run's total generations
 * @returns {Stage[]} the stages that run, in order, covering generations 0 to `generations`
 * @throws {Error} on an empty or malformed list or a duplicate name
 */
export function planStages(entries, generations) {
    if (!Array.isArray(entries) || entries.length === 0) {
        throw new Error('curriculum: expected a non-empty list of stages');
    }
    entries.forEach((entry, i) => checkEntry(entry, i, entries.length - 1));
    if (new Set(entries.map((e) => e.name)).size !== entries.length) {
        throw new Error('curriculum: stage names must be distinct');
    }
    /** @type {Stage[]} */
    const stages = [];
    let from = 0;
    for (const entry of entries) {
        const isLast = entry === entries[entries.length - 1];
        const to = Math.min(generations, isLast ? generations : from + /** @type {number} */ (entry.generations));
        if (from < to) {
            stages.push({ name: entry.name, config: entry.config, from, to });
        }
        from = to;
    }
    return stages;
}

/**
 * @template {Stage} T
 * @param {readonly T[]} stages a `planStages` result (or stages extended with more fields)
 * @param {number} generation a generation (0-based) inside the run
 * @returns {T} the stage that runs it
 * @throws {RangeError} when the generation is outside the plan
 */
export function stageAt(stages, generation) {
    const stage = stages.find((s) => generation >= s.from && generation < s.to);
    if (stage === undefined) {
        throw new RangeError(`curriculum: generation ${generation} is outside the plan`);
    }
    return stage;
}

/** A stage whose name starts with this runs hunters; stage configs cannot switch them off, so the name is the marker. */
const HUNT_STAGE = /^hunt/;

/**
 * Checks a curriculum's floors (training.md T29): a training floor (`minAgents` above 0) is a bounded aid that must not
 * become a rescue in the target world. No stage's `minAgents` is above the target's, a stage that runs hunters (its name
 * starts with `hunt`) has `minAgents` 0 (no restocking of a role), and the final stage is the target world (no config).
 * @param {readonly CurriculumEntry[]} entries the stages in order (already shape-checked by `planStages`)
 * @param {{overridesOf: (config: string) => Record<string, any>, targetMinAgents: number}} world how to read a stage's
 *   config overrides, and the target world's `minAgents`
 * @returns {void}
 * @throws {Error} naming the stage and the rule it breaks
 */
export function validateStageFloors(entries, { overridesOf, targetMinAgents }) {
    entries.forEach((entry, i) => {
        const floor =
            entry.config === null ? targetMinAgents : (overridesOf(entry.config).minAgents ?? targetMinAgents);
        if (floor > targetMinAgents) {
            throw new Error(
                `curriculum: stage "${entry.name}" has minAgents ${floor}, above the target world's ${targetMinAgents}`,
            );
        }
        if (HUNT_STAGE.test(entry.name) && floor > 0) {
            throw new Error(`curriculum: hunter stage "${entry.name}" has minAgents ${floor}; a hunter stage has none`);
        }
        if (i === entries.length - 1 && entry.config !== null) {
            throw new Error(
                `curriculum: the final stage "${entry.name}" is not the target world (its config must be null)`,
            );
        }
    });
}

/**
 * Whether an archive's saved stages end in the target world, so its champions may be published (training.md T29): the
 * last stage it recorded ran under the target world's rules.
 * @param {ReadonlyArray<{name: string, rulesHash: string}> | undefined} stages the archive's `stages` record
 * @param {string} targetHash the target world's `rulesHash`
 * @returns {boolean} true when the last recorded stage is the target world
 */
export function endsInTargetWorld(stages, targetHash) {
    return stages !== undefined && stages.length > 0 && stages[stages.length - 1].rulesHash === targetHash;
}
