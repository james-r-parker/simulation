/** @template T @param {string[]} args CLI args @param {(args: string[]) => T | null} parse parse arguments @param {string} usage syntax help @param {(parsed: T) => void} apply operation @returns {number} process exit code */
export function runMetricWriter(args, parse, usage, apply) {
    const parsed = parse(args);
    if (parsed === null) {
        process.stderr.write(`${usage}\n`);
        return 2;
    }
    try {
        apply(parsed);
        return 0;
    } catch (error) {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
        return 1;
    }
}

/** @template T @param {{parse: (args: string[]) => T | null, usage: string}} cli CLI details @param {Readonly<Record<string, any>>} metrics registry @param {string} output generated file @param {(parsed: T, io: {metrics: Readonly<Record<string, any>>, output: string, read?: (path: string) => any, print: (line: string) => void}) => void} apply operation @returns {(args: string[], io?: {metrics?: Readonly<Record<string, any>>, output?: string, read?: (path: string) => any, print?: (line: string) => void}) => number} main function */
export function createMetricWriterMain({ parse, usage }, metrics, output, apply) {
    return (args, io = {}) =>
        runMetricWriter(args, parse, usage, (parsed) =>
            apply(parsed, {
                metrics: io.metrics ?? metrics,
                output: io.output ?? output,
                read: io.read,
                print: io.print ?? ((line) => process.stdout.write(`${line}\n`)),
            }),
        );
}
import { fileURLToPath } from 'node:url';

/** @param {string} url module URL @param {(args: string[]) => number} main CLI entry point */
export function runAsCli(url, main) {
    if (process.argv[1] === fileURLToPath(url)) {
        process.exitCode = main(process.argv.slice(2));
    }
}
