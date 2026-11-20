// reads: .github/workflows
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fullMatrix } from '../scripts/lib/affected-matrix.mjs';
import { HEAVY_TESTS, STATISTICAL_TESTS } from '../scripts/lib/test-scope.mjs';

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
            // queue: a skipped job reports no check. The only one allowed leaves out the manual noise dispatch (T17); the
            // aggregate `check` also says `always()`, so it reports when a job it needs failed.
            for (const [id, allowed] of [
                ['check', "github.event_name != 'workflow_dispatch' && always()"],
                ['browser-smoke', "github.event_name != 'workflow_dispatch'"],
            ]) {
                const conditions = [...job(id).matchAll(/^ {4}if: (.*)$/gm)].map((m) => m[1]);
                expect(
                    conditions.every((c) => c === allowed),
                    `${id}: ${conditions}`,
                ).toBe(true);
            }
        });

        it('scopes a push against the previous tip, falling back to the full scope when it is unknown', () => {
            for (const [id, fallback] of [
                ['scope', 'full'],
                ['browser-smoke', 'browser'],
            ]) {
                const text = job(id);
                expect(text).toContain('BEFORE: ${{ github.event.before }}');
                expect(text).toContain('"$BEFORE"');
                expect(text).toContain('^0+$');
                expect(text).toContain('git cat-file -e');
                expect(text).toContain(`|| echo ${fallback})`);
                expect(text).toContain(`scope=${fallback}\n`);
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
            for (const id of ['scope', 'browser-smoke']) {
                expect(job(id), id).toContain('github.event.merge_group.base_sha');
                expect(job(id), id).toContain("format('origin/{0}', github.base_ref)");
                expect(job(id), id).toMatch(/EVENT" == pull_request \|\| "\$EVENT" == merge_group/);
            }
        });

        it('falls back to the full scope when the base cannot be resolved', () => {
            expect(job('scope')).toContain('|| echo full)');
            expect(job('browser-smoke')).toContain('|| echo browser)');
        });

        it('runs the docs gate for the docs scope and the whole gate otherwise', () => {
            const steps = job('static').split('\n      - ');
            expect(steps.find((s) => s.includes('scripts/check.sh --ci --docs'))).toContain("scope == 'docs'");
            const full = steps.find((s) => s.includes('scripts/check.sh --ci ${skip'));
            expect(full).toContain("scope != 'docs'");
            // The pull request and queue legs leave the tests to the `test` and `coverage` jobs; a push keeps the fast ones.
            expect(full).toContain('[[ "$EVENT" == push ]] || skip=(--skip=test)');
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

        it('still checks every push to main, and to season/next, which preview.yml waits on', () => {
            expect(check).toMatch(/push:\s*\n\s*branches: \[main, season\/next\]/);
        });

        it('runs the matrix the scope job writes, slow tests included, with one seed and coverage only on a whole run', () => {
            const text = job('test');
            expect(text).toContain("if: needs.scope.outputs.has_tests == 'true'");
            expect(text).toContain('matrix: ${{ fromJSON(needs.scope.outputs.matrix) }}');
            expect(text).toContain('fail-fast: false');
            // Slow tests are not left out (no TEST_SCOPE=fast), and every job shares one seed.
            expect(text).not.toContain('TEST_SCOPE: fast');
            expect(text).toContain('TEST_SCOPE: ${{ matrix.pass }}');
            expect(text).toContain('--sequence.seed="$SEED"');
            // The jobs of a whole run are the full matrix (test/workflows/heavy-shards.test.js pins it): every shard once, and
            // one job per heavy and per statistical file, with unique ids so blob reports and artifacts do not collide.
            const jobs = fullMatrix();
            expect(new Set(jobs.map((entry) => entry.id)).size).toBe(jobs.length);
            expect(new Set(jobs.map((entry) => entry.pass))).toEqual(new Set(['shard', 'heavy', 'statistical']));
            const statistical = jobs.filter((entry) => entry.pass === 'statistical').map((entry) => entry.files);
            expect([...statistical].sort()).toEqual([...STATISTICAL_TESTS].sort());
            const heavy = jobs.filter((entry) => entry.pass === 'heavy').map((entry) => entry.files);
            expect([...heavy].sort()).toEqual([...HEAVY_TESTS].sort());
            // Only a whole run on a job with coverage carries coverage and a blob report.
            expect(text).toMatch(
                /"\$COVERAGE" == whole \]\]; then\n\s+args\+=\(--coverage --coverage.reportOnFailure --reporter=blob/,
            );
            expect(text).toContain("matrix.pass != 'statistical' && needs.scope.outputs.coverage == 'whole'");
        });

        it('merges the shards coverage and runs the ratchet on it, even after a failed shard', () => {
            const text = job('coverage');
            expect(text).toContain('needs: [scope, test]');
            expect(text).toContain(
                "if: ${{ !cancelled() && needs.scope.outputs.coverage == 'whole' && needs.test.result != 'skipped' }}",
            );
            expect(text).toContain('pattern: blob-*');
            expect(text).toContain('npx vitest run --merge-reports=.vitest-reports --coverage');
            expect(text).toContain('node scripts/quality-ratchet.mjs --check');
        });

        it('has one required check that needs every job and fails when one failed or was cancelled', () => {
            const text = job('check');
            expect(text).toContain('needs: [scope, static, test, coverage, ratchet-related]');
            expect(text).toContain('*" failure "*');
            expect(text).toContain('*" cancelled "*');
        });

        it('runs the static gates without the tests on a pull request, and the fast tests on a push', () => {
            expect(job('static')).toContain('needs: scope');
            expect(job('static')).toContain('--skip=test');
        });

        it('runs the release check on pull requests, with the title passed through the environment', () => {
            const step = check.slice(check.indexOf('- name: Release check'));
            expect(step).toContain("if: github.event_name == 'pull_request'");
            expect(step).toContain('PR_TITLE: ${{ github.event.pull_request.title }}');
            expect(step).toContain('run: node scripts/release-check.mjs');
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

    it('upload the browser smoke flakes as an artifact whatever the smoke result', () => {
        const check = workflows.find(({ name }) => name === 'check.yml')?.text ?? '';
        const job = check.slice(check.indexOf('\n  browser-smoke:'), check.indexOf('\n  perf:'));
        const step = job.slice(job.indexOf('- name: Upload smoke flakes'));
        expect(step).toContain('if: always()');
        expect(step).toContain('name: smoke-flakes');
        expect(step).toContain('path: .checklogs/smoke-flakes.json');
        expect(step).toContain('if-no-files-found: ignore');
    });

    it('list the last 7 days of smoke flakes in one nightly issue', () => {
        const nightly = workflows.find(({ name }) => name === 'nightly.yml')?.text ?? '';
        const job = nightly.slice(nightly.indexOf('\n  smoke-flakes:'));
        expect(job).toMatch(/actions:\s*read/);
        expect(job).toMatch(/issues:\s*write/);
        expect(job).toContain('7 days ago');
        expect(job).toContain('gh run download "$id" --name smoke-flakes');
        expect(job).toContain('scripts/lib/smoke-flakes.mjs digest');
        expect(job).toContain('gh issue edit "$open"');
    });
});
