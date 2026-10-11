// Parses one design doc and applies every rule that depends on its status.

import { readDependsOn, readPriority, readStatus, readTitle, readValidated, UNBUILT } from './header.mjs';
import { validateDeliveryRequirements, validateTaskTable } from './lint-tables.mjs';
import { lintLineReferences, validateTargets } from './lint-text.mjs';
import { DesignDocError, toLines } from './markdown.mjs';

/**
 * @typedef {object} Doc
 * @property {string} fileName
 * @property {string} title
 * @property {string} keyword
 * @property {string} detail
 * @property {{sha: string, date: string} | null} validated
 * @property {string[]} dependsOn
 * @property {{rank: number, reason: string} | null} priority
 */

/**
 * Parses and lints one design doc.
 * @param {string} fileName
 * @param {string} body
 * @returns {Doc}
 */
export function parseDoc(fileName, body) {
    const lines = toLines(body);
    const title = readTitle(lines, fileName);
    const { keyword, detail } = readStatus(lines, fileName);
    const validated = readValidated(lines);
    const priority = readPriority(lines, fileName);
    lintLineReferences(lines, fileName);
    if (UNBUILT.has(keyword)) {
        lintPlan(lines, fileName, { keyword, stub: /^stub/i.test(detail), validated, priority });
    } else if (priority) {
        throw new DesignDocError(`${fileName}: only Proposed and In progress docs carry a **Priority:** line.`);
    }
    return { fileName, title, keyword, detail, validated, dependsOn: readDependsOn(lines), priority };
}

/**
 * The rules for a Proposed or In progress doc: stamp, priority, tables and Targets (the last two skipped for stubs).
 * @param {string[]} lines
 * @param {string} fileName
 * @param {{keyword: string, stub: boolean, validated: object | null, priority: object | null}} head
 */
function lintPlan(lines, fileName, head) {
    if (!head.validated) {
        throw new DesignDocError(
            `${fileName}: ${head.keyword} docs need a "**Validated:** <sha> (<YYYY-MM-DD>)" line under the status.`,
        );
    }
    if (!head.stub) {
        validateTaskTable(lines, fileName);
        validateTargets(lines, fileName);
    }
    validateDeliveryRequirements(lines, fileName, head.stub);
    if (!head.priority) {
        throw new DesignDocError(
            `${fileName}: ${head.keyword} docs need a "**Priority:** <rank> - <reason>" line under the validated stamp. See docs/designs/STYLE.md.`,
        );
    }
}
