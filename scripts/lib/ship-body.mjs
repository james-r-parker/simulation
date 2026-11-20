// Step 4 of scripts/ship.sh: checks a PR body file against the create-pr template.

const SIM_PATH = /^js\/(sim|evo)\//;

/**
 * @param {string} body the PR body
 * @param {string} title the section heading, without the `## `
 * @returns {string | null} the section's text, or null when the heading is missing
 */
function section(body, title) {
    const lines = body.split('\n');
    const start = lines.findIndex((l) => l.trim().toLowerCase() === `## ${title}`.toLowerCase());
    if (start < 0) {
        return null;
    }
    const rest = lines.slice(start + 1);
    const end = rest.findIndex((l) => /^## /.test(l));
    return (end < 0 ? rest : rest.slice(0, end)).join('\n').trim();
}

/**
 * @param {string} body the PR body
 * @param {string[]} paths the paths the branch changes against the base
 * @returns {string[]} what is missing, one message per problem; empty when the body passes. Every body needs a Summary;
 *   a diff under js/sim or js/evo (the brain is in js/sim) also needs a Scene served section that names a scene or
 *   selection rule and a backticked detector metric, and is not "None".
 */
export function bodyProblems(body, paths) {
    const problems = [];
    if (!section(body, 'Summary')) {
        problems.push('missing section: ## Summary');
    }
    if (paths.some((p) => SIM_PATH.test(p))) {
        const scene = section(body, 'Scene served');
        if (scene === null) {
            problems.push(
                'missing section: ## Scene served (a sim, evo or brain diff names a scene or selection rule)',
            );
        } else if (/^none\b/i.test(scene)) {
            problems.push('## Scene served says None, but the diff changes js/sim or js/evo');
        } else if (!/`[^`\s]+`/.test(scene)) {
            problems.push('## Scene served names no detector metric (put the metric name in backticks)');
        }
    }
    return problems;
}
