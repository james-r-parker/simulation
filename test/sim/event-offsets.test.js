// No reader or writer of an event record holds a bare number for a field: every offset is a named one from `EVENT`
// (docs/designs/registries.md, Events). The check is the one `rg 'd\[o \+ [0-9]' js` makes, widened to every receiver
// the event data goes by in a file that imports the events.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// reads: js
const JS_ROOT = fileURLToPath(new URL('../../js', import.meta.url));

/** The event data by the names the code gives it, indexed by a base plus a number. */
const BARE_OFFSET = /\b(?:d|data|events|world\.events\.data|ring\.data)\[[^\]]*\+\s*[0-9]+\]/;

/**
 * @param {string} dir a directory
 * @returns {string[]} every .js file under it
 */
function sources(dir) {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory()
            ? sources(join(dir, entry.name))
            : entry.name.endsWith('.js')
              ? [join(dir, entry.name)]
              : [],
    );
}

describe('event offsets', () => {
    const files = sources(JS_ROOT).map((path) => ({ path, text: readFileSync(path, 'utf8') }));

    it('leaves no `d[o + <number>]` anywhere under js/', () => {
        const hits = files.filter(({ text }) => /\bd\[o \+ [0-9]/.test(text)).map(({ path }) => path);
        expect(hits).toEqual([]);
    });

    it('leaves no bare number added to an event base in a file that reads or writes event records', () => {
        const hits = [];
        for (const { path, text } of files) {
            if (!/EVENT_STRIDE|\bpushEvent\b|events\.data/.test(text)) {
                continue;
            }
            for (const [i, line] of text.split('\n').entries()) {
                if (BARE_OFFSET.test(line) && !/^\s*(\/\/|\*)/.test(line)) {
                    hits.push(`${path.slice(JS_ROOT.length)}:${i + 1}: ${line.trim()}`);
                }
            }
        }
        expect(hits).toEqual([]);
    });
});
