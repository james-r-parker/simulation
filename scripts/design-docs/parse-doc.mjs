// Parses one design doc and applies every rule that depends on its status.

import {
    readDependsOn,
    readPriority,
    readScheduledBy,
    readStatus,
    readTitle,
    readValidated,
    UNBUILT,
} from './header.mjs';
import { validateDeliveryRequirements, validateTaskTable } from './lint-tables.mjs';
import { lintLineReferences, validateTargetNames, validateTargets } from './lint-text.mjs';
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
 * @property {{lead: string, step: number, reason: string} | null} scheduledBy the lead doc that holds this doc's rank
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
    const scheduledBy = readScheduledBy(lines, fileName);
    lintLineReferences(lines, fileName);
    if (UNBUILT.has(keyword)) {
        lintPlan(lines, fileName, { keyword, stub: /^stub/i.test(detail), validated, priority, scheduledBy });
    } else if (priority || scheduledBy) {
        throw new DesignDocError(
            `${fileName}: only Proposed and In progress docs carry a **Priority:** or **Scheduled by:** line.`,
        );
    }
    return { fileName, title, keyword, detail, validated, dependsOn: readDependsOn(lines), priority, scheduledBy };
}

/**
 * The rules for a Proposed or In progress doc: stamp, priority or lead, tables and Targets (the last two skipped for stubs).
 * @param {string[]} lines
 * @param {string} fileName
 * @param {{keyword: string, stub: boolean, validated: object | null, priority: object | null,
 *   scheduledBy: object | null}} head
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
        validateTargetNames(lines, fileName);
    }
    validateDeliveryRequirements(lines, fileName, head.stub);
    if (head.priority && head.scheduledBy) {
        throw new DesignDocError(
            `${fileName}: a doc carries a **Priority:** line or a **Scheduled by:** line, not both.`,
        );
    }
    if (!head.priority && !head.scheduledBy) {
        throw new DesignDocError(
            `${fileName}: ${head.keyword} docs need a "**Priority:** <rank> - <reason>" line, or a "**Scheduled by:** [lead.md](lead.md) step <n> - <reason>" line, under the validated stamp. See docs/designs/STYLE.md.`,
        );
    }
}
