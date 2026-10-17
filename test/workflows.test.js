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
});
