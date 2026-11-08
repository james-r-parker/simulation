// Reads the workflow files as text for the static rules in test/deploy-workflows.test.js and
// test/preview-workflow.test.js (no YAML parser is installed): a job is the block under a two-space-indented name below
// `jobs:`, a step starts at `- `.
import { readFileSync } from 'node:fs';

/**
 * @param {string} name a file under .github/workflows
 * @returns {string} its text
 */
export const text = (name) => readFileSync(`.github/workflows/${name}`, 'utf8');

/**
 * @param {string} source a workflow file
 * @returns {string} its `on:` block
 */
export const triggers = (source) => source.match(/^on:\n((?: .*\n|\n)*)/m)?.[1] ?? '';

/**
 * @param {string} source a workflow file
 * @returns {{name: string, body: string, steps: string[]}[]} its jobs, each with its steps' text
 */
export function jobsOf(source) {
    const after = source.slice(source.indexOf('\njobs:\n') + 7);
    const parts = after.split(/^ {2}([A-Za-z0-9_-]+):\n/m);
    const jobs = [];
    for (let i = 1; i < parts.length; i += 2) {
        const body = parts[i + 1];
        jobs.push({ name: parts[i], body, steps: body.split(/^ {6}- /m).slice(1) });
    }
    return jobs;
}

/**
 * @param {string} body a job's text
 * @returns {boolean} whether it reads a secret other than the run's own token
 */
export const holdsSecrets = (body) => /secrets\.(?!GITHUB_TOKEN)/.test(body);
