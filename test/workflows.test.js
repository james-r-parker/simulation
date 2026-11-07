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
        // check.yml names no image: scripts/browser-smoke.sh builds the tag from the same pin and pulls it only when the
        // smoke runs (a job `container:` is pulled even when every step is skipped).
        expect(readFileSync('scripts/browser-smoke.sh', 'utf8')).toContain(
            'mcr.microsoft.com/playwright:v${version}-noble',
        );
        for (const { name, tag } of tags) {
            expect(tag, `${name} image tag`).toBe(pin);
        }
    });

    describe('check.yml merge queue and scope', () => {
        const check = workflows.find(({ name }) => name === 'check.yml')?.text ?? '';
        /** @param {string} id job id */
        const job = (id) => {
            const start = check.indexOf(`\n  ${id}:`);
            const next = check.indexOf('\n  # ', start + 1);
            return check.slice(start, next < 0 ? undefined : next);
        };

        it('runs on merge_group, so the required checks report in the merge queue', () => {
            expect(/^on:[\s\S]*?^ {2}merge_group:/m.test(check)).toBe(true);
            // The required checks (the main ruleset) have no job-level `if` that can skip them on a pull request or in the
            // queue: a skipped job reports no check. The only one allowed leaves out the manual noise dispatch (T17).
            for (const id of ['check', 'browser-smoke']) {
                const conditions = [...job(id).matchAll(/^ {4}if: (.*)$/gm)].map((m) => m[1]);
                expect(
                    conditions.every((c) => c === "github.event_name != 'workflow_dispatch'"),
                    `${id}: ${conditions}`,
                ).toBe(true);
            }
        });

        it('skips the advisory perf job in the merge queue', () => {
            expect(job('perf')).toContain("if: github.event_name == 'pull_request'");
        });

        it('cancels superseded pull request runs only, never main or the queue', () => {
            expect(check).toMatch(/group: check-\$\{\{ github\.event\.pull_request\.number \|\| github\.ref \}\}/);
            expect(check).toContain("cancel-in-progress: ${{ github.event_name == 'pull_request' }}");
        });

        it('diffs a merge group against its base_sha and a pull request against its base branch', () => {
            for (const id of ['check', 'browser-smoke']) {
                expect(job(id), id).toContain('github.event.merge_group.base_sha');
                expect(job(id), id).toContain("format('origin/{0}', github.base_ref)");
                expect(job(id), id).toMatch(/EVENT" == pull_request \|\| "\$EVENT" == merge_group/);
            }
        });

        it('falls back to the full scope when the base cannot be resolved', () => {
            expect(job('check')).toContain('|| echo full)');
            expect(job('browser-smoke')).toContain('|| echo browser)');
        });

        it('runs the docs gate for the docs scope and the whole gate otherwise', () => {
            const steps = job('check').split('\n      - ');
            expect(steps.find((s) => s.includes('scripts/check.sh --ci --docs'))).toContain("scope == 'docs'");
            const full = steps.find((s) => /run: scripts\/check\.sh --ci$/m.test(s));
            expect(full).toContain("scope != 'docs'");
        });

        it('skips the browser smoke steps, not the job, when no app path changed', () => {
            const steps = job('browser-smoke').split('\n      - ');
            const gated = steps.filter(
                (s) => /setup-node|npm ci|browser-smoke/.test(s) && /run:|uses: actions\/setup/.test(s),
            );
            expect(gated.length).toBeGreaterThanOrEqual(3);
            for (const step of gated.filter((s) => !s.startsWith('name: Browser scope'))) {
                expect(step).toContain("steps.scope.outputs.scope == 'browser'");
            }
        });

        it('has no job container, which would pull the Playwright image before any step can be skipped', () => {
            expect(job('browser-smoke')).not.toMatch(/^ {4}container:/m);
        });

        it('leaves the nightly run unscoped, so it checks everything', () => {
            const nightly = workflows.find(({ name }) => name === 'nightly.yml')?.text ?? '';
            expect(nightly).not.toContain('change-scope');
            expect(nightly).not.toContain('merge_group');
        });

        it('still checks every push to main, which deploy.yml waits on', () => {
            expect(check).toMatch(/push:\s*\n\s*branches: \[main\]/);
        });
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
