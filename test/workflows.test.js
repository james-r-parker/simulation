import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const DIR = '.github/workflows';
const workflows = readdirSync(DIR)
    .filter((name) => name.endsWith('.yml'))
    .map((name) => ({ name, text: readFileSync(`${DIR}/${name}`, 'utf8') }));

describe('workflows', () => {
    it('use the Playwright image tagged with the exact @playwright/test pin', () => {
        const pin = JSON.parse(readFileSync('package.json', 'utf8')).devDependencies['@playwright/test'];
        const tags = workflows.flatMap(({ name, text }) =>
            [...text.matchAll(/mcr\.microsoft\.com\/playwright:v([^\s-]+)(?:-\S+)?/g)].map((m) => ({
                name,
                tag: m[1],
            })),
        );
        expect(tags.length).toBeGreaterThan(0);
        for (const { name, tag } of tags) {
            expect(tag, `${name} image tag`).toBe(pin);
        }
    });

    it('upload hidden .checklogs/ files only with include-hidden-files', () => {
        for (const { name, text } of workflows) {
            for (const step of text.split(/\n\s*- (?=name:|uses:)/)) {
                if (step.includes('upload-artifact') && step.includes('.checklogs')) {
                    expect(step, `${name} upload step`).toMatch(/include-hidden-files:\s*true/);
                }
            }
        }
    });

    it('install the Node version in .node-version, which satisfies engines', () => {
        const version = readFileSync('.node-version', 'utf8').trim();
        const engines = JSON.parse(readFileSync('package.json', 'utf8')).engines.node;
        expect(version).toMatch(/^\d+\.\d+\.\d+$/);
        expect(Number(version.split('.')[0])).toBeGreaterThanOrEqual(Number(/\d+/.exec(engines)?.[0]));
        for (const { name, text } of workflows) {
            for (const step of text.split(/\n\s*- (?=name:|uses:)/).filter((s) => s.includes('actions/setup-node'))) {
                expect(step, `${name} setup-node`).toContain('node-version-file: .node-version');
                expect(step, `${name} setup-node`).not.toMatch(/^\s*node-version:/m);
            }
        }
    });

    it('check the golden hashes in Chromium in the nightly run', () => {
        const nightly = workflows.find(({ name }) => name === 'nightly.yml');
        expect(nightly?.text).toContain('npx playwright install --with-deps chromium');
        expect(nightly?.text).toContain('npm run browser:hash');
    });
    it('give the perf job room to finish its bench-compare on a hosted runner', () => {
        // Five alternating runs at 500 agents overran a 15-minute timeout on the hosted runner (PR #308).
        const check = workflows.find(({ name }) => name === 'check.yml')?.text ?? '';
        const perf = check.slice(check.indexOf('\n  perf:'));
        expect(Number(/timeout-minutes:\s*(\d+)/.exec(perf)?.[1])).toBeGreaterThanOrEqual(30);
        expect(Number(/bench-compare\.mjs[^\n]*--runs=(\d+)/.exec(perf)?.[1])).toBeLessThanOrEqual(3);
    });

    it('offer a noise dispatch on check.yml that runs bench-compare --self', () => {
        const check = workflows.find(({ name }) => name === 'check.yml')?.text ?? '';
        expect(check).toMatch(/workflow_dispatch:\s+inputs:\s+noise:/);
        const noise = check.slice(check.indexOf('\n  noise:'));
        expect(noise).toContain('bench-compare.mjs --self');
    });

    it('open a nightly-failure issue from a job that needs the nightly job', () => {
        const nightly = workflows.find(({ name }) => name === 'nightly.yml')?.text ?? '';
        const job = nightly.slice(nightly.indexOf('\n  nightly-failure:'));
        expect(job).toMatch(/needs:\s*nightly/);
        expect(job).toContain('failure()');
        expect(job).toMatch(/issues:\s*write/);
        expect(job).toContain('nightly-failure');
        expect(job).toContain('scripts/lib/nightly-digest.mjs');
        expect(nightly).toContain('reports/nightly-summary.txt');
    });
});
