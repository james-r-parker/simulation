// Shared command-line parsing for the scripts: integer flags and a table-driven flag loop.

/**
 * @param {string} flag the flag name
 * @param {string | undefined} text the flag's value
 * @param {number} min the smallest allowed value
 * @param {string} usage the usage line appended to the error
 * @returns {number} the value as an integer
 * @throws {Error} when the value is missing, not an integer, or below `min`
 */
export function intValue(flag, text, min, usage) {
    const value = Number(text);
    if (text === undefined || !Number.isInteger(value) || value < min) {
        throw new Error(`${flag} must be an integer >= ${min}, got: ${text}\n${usage}`);
    }
    return value;
}

/**
 * @typedef {object} FlagSpec
 * @property {Record<string, (value: string | undefined, flag: string) => [string, any]>} valueFlags flags that take
 *   a value; each parser returns the option key and its parsed value
 * @property {Record<string, string>} [booleanFlags] flags without a value, mapped to the option key they set true
 * @property {Record<string, any>} defaults the starting options
 * @property {string} usage the usage line appended to the unknown-argument error
 */

/**
 * @param {string[]} argv command-line arguments after the script name
 * @param {FlagSpec} spec the accepted flags
 * @returns {Record<string, any>} the defaults with each given flag applied
 * @throws {Error} on an unknown argument, or whatever a value parser throws
 */
export function parseFlags(argv, { valueFlags, booleanFlags = {}, defaults, usage }) {
    const opts = { ...defaults };
    for (let i = 0; i < argv.length; i++) {
        const flag = argv[i];
        if (Object.hasOwn(booleanFlags, flag)) {
            opts[booleanFlags[flag]] = true;
        } else if (Object.hasOwn(valueFlags, flag)) {
            const [key, parsed] = valueFlags[flag](argv[++i], flag);
            opts[key] = parsed;
        } else {
            throw new Error(`unknown argument: ${flag}\n${usage}`);
        }
    }
    return opts;
}
