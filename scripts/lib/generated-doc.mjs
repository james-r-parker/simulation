// The `--write` / `--check` / print command line of a doc a script generates from a registry: the doc is the source's
// table, `--check` fails (exit 1) when the committed file differs, and the conventions gate runs the check.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

/**
 * @param {string[]} args the command-line arguments: `--write`, `--check`, or none to print
 * @param {{ path: string, markdown: string, file: string, command: string }} doc the doc's path, its generated text, its
 *   name in messages (`docs/log-events.md`) and the command that regenerates it (`node scripts/events-doc.mjs`)
 * @returns {number} the exit code: 0, 1 for a stale doc under `--check`, 2 for an unknown argument
 */
export function runGeneratedDoc(args, { path, markdown, file, command }) {
    const unknown = args.filter((arg) => arg !== '--write' && arg !== '--check');
    if (unknown.length > 0) {
        process.stderr.write(`unknown argument: ${unknown.join(' ')} (expected --write or --check)\n`);
        return 2;
    }
    if (args.includes('--check')) {
        const current = existsSync(path) ? readFileSync(path, 'utf8') : '';
        if (current !== markdown) {
            process.stderr.write(`${file} is stale. Run: ${command} --write\n`);
            return 1;
        }
        process.stdout.write(`${file} is up to date.\n`);
        return 0;
    }
    if (args.includes('--write')) {
        writeFileSync(path, markdown);
        process.stdout.write(`Wrote ${file}\n`);
        return 0;
    }
    process.stdout.write(markdown);
    return 0;
}
