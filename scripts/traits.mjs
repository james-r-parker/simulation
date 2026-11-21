#!/usr/bin/env node
// Prints, for a config, each spec's value of every lane a trait moves at the gene's minimum, at 0 and at its maximum,
// with the paired cost at each, and generates docs/trait-table.md from the default config
// (docs/designs/body-genes.md, "The table"). A tweak to a span or a cost is read here before any run.
//
// Usage:
//   node scripts/traits.mjs                              # print the table of the default config
//   node scripts/traits.mjs --config <file.json>         # a JSON object of config overrides
//   node scripts/traits.mjs --set <a.b.c=value> ...      # one override, the value as JSON (else a string)
//   node scripts/traits.mjs --write                      # (re)write docs/trait-table.md from the defaults
//   node scripts/traits.mjs --check                      # exit 1 if the committed doc is stale
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createConfig } from '../js/sim/config.js';
import { runGeneratedDoc } from './lib/generated-doc.mjs';
import { renderTraitTable } from './lib/trait-table.mjs';

const DOC_PATH = fileURLToPath(new URL('../docs/trait-table.md', import.meta.url));
const USAGE = 'usage: node scripts/traits.mjs [--config <file.json>] [--set <a.b.c=value>]... [--write | --check]';

/**
 * @param {Record<string, any>} target the object to set into
 * @param {string} setting `a.b.c=value`, the value read as JSON when it parses and as text when not
 * @returns {void}
 * @throws {Error} when the setting has no `=` or an empty path part
 */
export function applySetting(target, setting) {
    const eq = setting.indexOf('=');
    const path = eq < 0 ? [] : setting.slice(0, eq).split('.');
    if (path.length === 0 || path.includes('')) {
        throw new Error(`--set needs a.b.c=value, got: ${setting}\n${USAGE}`);
    }
    const text = setting.slice(eq + 1);
    let value;
    try {
        value = JSON.parse(text);
    } catch {
        value = text;
    }
    let node = target;
    for (const part of path.slice(0, -1)) {
        node[part] ??= {};
        node = node[part];
    }
    node[path[path.length - 1]] = value;
}

/**
 * @param {string[]} args the arguments after the script name
 * @returns {{overrides: Record<string, any>, doc: string[]}} the config overrides, and the `--write` or `--check` flags
 * @throws {Error} on an unknown argument or a flag without its value
 */
export function parseArgs(args) {
    /** @type {Record<string, any>} */
    const overrides = {};
    /** @type {string[]} */
    const doc = [];
    for (let i = 0; i < args.length; i++) {
        const flag = args[i];
        if (flag === '--write' || flag === '--check') {
            doc.push(flag);
        } else if (flag === '--config' || flag === '--set') {
            const value = args[++i];
            if (value === undefined) {
                throw new Error(`${flag} needs a value\n${USAGE}`);
            }
            if (flag === '--set') {
                applySetting(overrides, value);
            } else {
                Object.assign(overrides, JSON.parse(readFileSync(value, 'utf8')));
            }
        } else {
            throw new Error(`unknown argument: ${flag}\n${USAGE}`);
        }
    }
    return { overrides, doc };
}

/**
 * @param {string[]} args the arguments after the script name
 * @param {{path?: string}} [options] the doc's path
 * @returns {number} the exit code: 0, 1 for a stale doc under `--check`, 2 for a bad argument or a doc flag with overrides
 */
export function main(args, { path = DOC_PATH } = {}) {
    try {
        const { overrides, doc } = parseArgs(args);
        if (doc.length > 0 && Object.keys(overrides).length > 0) {
            process.stderr.write(`--write and --check read the default config, not --config or --set\n${USAGE}\n`);
            return 2;
        }
        return runGeneratedDoc(doc, {
            path,
            markdown: renderTraitTable(createConfig(overrides)),
            file: 'docs/trait-table.md',
            command: 'node scripts/traits.mjs',
        });
    } catch (error) {
        process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
        return 2;
    }
}

if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
    process.exitCode = main(process.argv.slice(2));
}
