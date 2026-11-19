/**
 * Calls a CLI main function only when its module is the process entrypoint.
 * @param {boolean} isEntrypoint whether the module is the process entrypoint
 * @param {string[]} argv command-line arguments
 * @param {(args: string[]) => Promise<number>} main the CLI implementation
 * @returns {Promise<void>} resolves after setting the process exit code
 */
export async function runIfEntrypoint(isEntrypoint, argv, main) {
    if (isEntrypoint) {
        process.exitCode = await main(argv);
    }
}
