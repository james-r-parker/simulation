// Turns the nightly gate's output into the title and body of the `nightly-failure` issue: the failed gates, each with
// the digest check.sh printed under its line, and the run URL (docs/designs/quality-gates-and-test-tiers.md, T21).
// Usage: node scripts/lib/nightly-digest.mjs <summary-file> <run-url> [--title]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ESC = String.fromCharCode(27);
const ANSI = new RegExp(`${ESC}\\[[0-9;]*m`, 'g');
const FAILED_LINE = /^✗\s+(\S+)/;
const GATE_LINE = /^[✓✗-]\s/;
const MAX_DIGEST_LINES = 15;

/**
 * @param {string} summary the gate output
 * @returns {Array<{gate: string, lines: string[]}>} each failed gate with the lines printed under it
 */
export function failedGates(summary) {
    const lines = summary.replace(ANSI, '').split('\n');
    /** @type {Array<{gate: string, lines: string[]}>} */
    const failed = [];
    /** @type {{gate: string, lines: string[]} | null} */
    let current = null;
    for (const line of lines) {
        const match = FAILED_LINE.exec(line);
        if (match) {
            current = { gate: match[1], lines: [] };
            failed.push(current);
        } else if (GATE_LINE.test(line) || line.trim() === '') {
            current = null;
        } else if (current && current.lines.length < MAX_DIGEST_LINES) {
            current.lines.push(line.trim());
        }
    }
    return failed;
}

/**
 * @param {Array<{gate: string, lines: string[]}>} failed the failed gates
 * @returns {string} the issue title
 */
export function issueTitle(failed) {
    const names = failed.map((entry) => entry.gate);
    return `Nightly failed: ${names.length > 0 ? names.join(', ') : 'no gate output (see the run)'}`;
}

/**
 * @param {Array<{gate: string, lines: string[]}>} failed the failed gates
 * @param {string} runUrl the workflow run URL
 * @returns {string} the issue body in Markdown
 */
export function issueBody(failed, runUrl) {
    const parts = [`The nightly run failed: ${runUrl}`, ''];
    if (failed.length === 0) {
        parts.push(
            'No failed gate line was found; the job failed before or outside the gate (install, browser hashes).',
        );
    }
    for (const { gate, lines } of failed) {
        parts.push(`### ${gate}`, '', '```', ...lines, '```', '');
    }
    parts.push('The `nightly-reports` artifact of the run holds `.checklogs/` with each gate log.');
    return parts.join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const [file, url, flag] = process.argv.slice(2);
    if (!file || !url) {
        console.error('usage: nightly-digest.mjs <summary-file> <run-url> [--title]');
        process.exitCode = 2;
    } else {
        let summary = '';
        try {
            summary = readFileSync(file, 'utf8');
        } catch {
            // no summary: the issue says so
        }
        const failed = failedGates(summary);
        console.log(flag === '--title' ? issueTitle(failed) : issueBody(failed, url));
    }
}
