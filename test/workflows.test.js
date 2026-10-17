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
});
