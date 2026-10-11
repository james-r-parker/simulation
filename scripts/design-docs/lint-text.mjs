// Text rules for design docs: no line-number references, links that resolve, and one `**Targets:**` line per
// unbuilt phase (docs/designs/STYLE.md).

import { existsSync } from 'node:fs';
import path from 'node:path';
import { DesignDocError, fail, MARKDOWN_LINK, unfenced } from './markdown.mjs';

const LINE_REFERENCE = /\b[\w./-]+\.(?:js|mjs|cjs|ts|md|json|html|css|sh|wgsl|toml|yml|yaml)(?::\d+|#L\d+)\b/;
const PHASE_HEADING = /^### Phase ([0-9]+[a-z]?) - .+?( \(built\))?\s*$/;
const TARGETS_LINE =
    /^\*\*Targets:\*\*\s*(none\s*-\s*\S.*|[a-z_@^][a-z0-9_@^.:*-]*(\s*,\s*[a-z_@^][a-z0-9_@^.:*-]*)*)\s*$/;

/**
 * Code is named by symbol, never by line number (STYLE.md, Linking to code).
 * @param {string[]} lines
 * @param {string} fileName
 */
export function lintLineReferences(lines, fileName) {
    for (const [i, line] of unfenced(lines)) {
        const match = LINE_REFERENCE.exec(line);
        if (match) {
            fail(fileName, i, `"${match[0]}" pins a line number - name the symbol instead. See docs/designs/STYLE.md.`);
        }
    }
}

/**
 * Relative links outside code fences resolve to a file: a doc that is only planned is named in code font until it
 * exists. README.md is the generated index, so it may not exist yet.
 * @param {string} designsDir
 * @param {string} fileName
 * @param {string[]} lines
 */
export function lintLinks(designsDir, fileName, lines) {
    for (const [i, line] of unfenced(lines)) {
        for (const match of line.matchAll(MARKDOWN_LINK)) {
            const href = (match.groups?.href ?? '').split('#')[0];
            const external = href.length === 0 || href === 'README.md' || /^[a-z]+:/i.test(href);
            if (!external && !existsSync(path.resolve(designsDir, href))) {
                fail(
                    fileName,
                    i,
                    `link to "${href}" does not resolve - name a planned doc in code font until it exists`,
                );
            }
        }
    }
}

/**
 * Exactly one well-formed `**Targets:**` line under each unbuilt `### Phase` heading. Only the first section that
 * names a phase (the design, not the Task breakdown) counts.
 * @param {string[]} lines
 * @param {string} fileName
 */
export function validateTargets(lines, fileName) {
    const phases = countTargets(lines, fileName);
    for (const [id, { built, count }] of phases) {
        if (!built && count !== 1) {
            throw new DesignDocError(
                `${fileName}: unbuilt Phase ${id} has ${count} **Targets:** lines; it needs exactly one under its heading. See docs/designs/STYLE.md.`,
            );
        }
    }
}

/**
 * Each phase id with whether any heading marks it built and how many Targets lines sit under its headings.
 * @param {string[]} lines
 * @param {string} fileName
 * @returns {Map<string, {built: boolean, count: number}>}
 */
function countTargets(lines, fileName) {
    /** @type {Map<string, {built: boolean, count: number}>} */
    const phases = new Map();
    /** @type {{built: boolean, count: number} | null} */
    let current = null;
    for (const [i, line] of unfenced(lines)) {
        const heading = phaseHeading(line, fileName, i);
        if (heading) {
            current = phases.get(heading[1]) ?? { built: false, count: 0 };
            current.built ||= Boolean(heading[2]);
            phases.set(heading[1], current);
        } else if (line.startsWith('## ')) {
            current = null;
        } else if (line.startsWith('**Targets:**')) {
            if (!TARGETS_LINE.test(line)) {
                fail(fileName, i, `"${line}" is not "**Targets:** <metric>, ..." or "**Targets:** none - <reason>".`);
            }
            if (current) {
                current.count += 1;
            }
        }
    }
    return phases;
}

/**
 * The phase heading match for a `### Phase` line, null for any other line. A `### Phase` line in another shape fails,
 * so a phase can never slip past the Targets rule.
 * @param {string} line
 * @param {string} fileName
 * @param {number} index
 * @returns {RegExpExecArray | null}
 */
function phaseHeading(line, fileName, index) {
    const heading = PHASE_HEADING.exec(line);
    if (!heading && line.startsWith('### Phase')) {
        fail(fileName, index, `"${line}" is not "### Phase <n> - <name>" (a hyphen, optionally " (built)")`);
    }
    return heading;
}
