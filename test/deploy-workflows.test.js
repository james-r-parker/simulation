// Static rules for the production deploy path (docs/designs/deployment-and-community.md, "Phase 1a"). No YAML parser is
// installed, so the workflow files are read as text.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { holdsSecrets, jobsOf, text, triggers } from './helpers/workflow-text.js';

describe.each(['deploy.yml', 'preview.yml', 'release-please.yml'])('%s', (file) => {
    const source = text(file);
    const jobs = jobsOf(source);

    it('has jobs and uses no cache', () => {
        expect(jobs.length).toBeGreaterThan(0);
        expect(source).not.toMatch(/^\s*cache:/m);
    });

    it.each(jobs.map((job) => [job.name, job]))('job %s: a job with secrets runs no repository code', (_name, job) => {
        if (!holdsSecrets(job.body) || file === 'release-please.yml') {
            return;
        }
        expect(job.body).not.toMatch(/\bnpm run\b|\bnpx\b/);
        for (const step of job.steps.filter((s) => /\bnpm ci\b/.test(s))) {
            expect(step).toMatch(/npm ci --ignore-scripts/);
            expect(step).toMatch(/working-directory:\s*\.github\/deploy/);
        }
    });

    it.each(jobs.map((job) => [job.name, job]))(
        'job %s: Cloudflare secrets only in a named environment',
        (_name, job) => {
            if (/secrets\.CLOUDFLARE_/.test(job.body)) {
                expect(job.body).toMatch(/environment:\s*(preview|production|\n\s+name:\s*(preview|production))/);
            }
        },
    );

    it('pins every third-party action to a 40-character SHA and persists no checkout credentials', () => {
        for (const m of source.matchAll(/^\s*(?:- )?uses:\s*(\S+)/gm)) {
            expect(m[1].startsWith('./') || /^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/.test(m[1]), m[1]).toBe(true);
        }
        for (const step of source.split(/^ +- /m).filter((s) => s.includes('actions/checkout'))) {
            expect(step).toMatch(/persist-credentials:\s*false/);
        }
    });

    it('has no pull_request_target trigger', () => {
        expect(source).not.toMatch(/pull_request_target/);
    });
});

describe('deploy.yml', () => {
    const source = text('deploy.yml');

    it('is started only by a release call or by hand, never by a push or a workflow_run', () => {
        const on = triggers(source);
        expect(on).toMatch(/^ {2}workflow_call:/m);
        expect(on).toMatch(/^ {2}workflow_dispatch:/m);
        expect(on).not.toMatch(/^ {2}(push|workflow_run|pull_request|schedule|release):/m);
        expect(source).not.toMatch(/workflow_run\./);
    });

    it('deploys the build of the tagged commit to the production branch in the production environment', () => {
        expect(source).toMatch(/ref:\s*\$\{\{\s*inputs\.tag \|\| github\.sha\s*\}\}/);
        expect(source).toMatch(/--branch main\b/);
        expect(source).toMatch(/name:\s*production/);
        expect(source).toMatch(/secrets\.CLOUDFLARE_API_TOKEN/);
        expect(source).toMatch(/group:\s*deploy-production\n\s+cancel-in-progress:\s*false/);
    });

    it('holds the Cloudflare secrets in the deploy job only, and in the production environment', () => {
        const jobs = jobsOf(source);
        expect(jobs.map((job) => job.name)).toEqual(['build', 'deploy']);
        for (const job of jobs) {
            expect(/secrets\.CLOUDFLARE_/.test(job.body), job.name).toBe(job.name === 'deploy');
        }
        expect(jobs[1].body).toMatch(/environment:\s*\n\s+name:\s*production/);
    });

    it('deploys the version branch and registers its D1 row before it changes /', () => {
        const order = [
            'wrangler d1 migrations apply blob-library --remote',
            '--branch "$branch"',
            'run: node scripts/release-upload.mjs',
            '--branch main',
        ].map((needle) => source.indexOf(needle));
        expect(order.every((at) => at > 0)).toBe(true);
        expect([...order].sort((a, b) => a - b)).toEqual(order);
    });

    it('names a missing production secret or variable before any wrangler call', () => {
        const check = source.indexOf("The 'production' environment");
        expect(check).toBeGreaterThan(-1);
        expect(check).toBeLessThan(source.indexOf('wrangler d1 migrations'));
    });

    it('can attach the build to the GitHub Release because release-please.yml grants contents: write to the call', () => {
        const caller = text('release-please.yml');
        expect(caller.slice(caller.indexOf('\n  deploy:\n'))).toMatch(/permissions:\s*\n\s+contents:\s*write/);
        expect(jobsOf(source)[1].body).toMatch(/permissions:\s*\n\s+contents:\s*write/);
    });
});

describe('release-please.yml', () => {
    const source = text('release-please.yml');

    it('runs on a push to main and uses the GitHub App token in the release environment', () => {
        expect(triggers(source)).toMatch(/push:\n\s+branches:\s*\[main\]/);
        expect(source).toMatch(/environment:\s*release/);
        expect(source).toMatch(/create-github-app-token/);
        expect(source).toMatch(/client-id:\s*\$\{\{\s*vars\.RELEASE_CLIENT_ID/);
        expect(source).not.toMatch(/\bapp-id:/);
        expect(source).toMatch(/token:\s*\$\{\{\s*steps\.app\.outputs\.token/);
        expect(source).toMatch(/vars\.RELEASE_CLIENT_ID/);
        expect(source).toMatch(/secrets\.RELEASE_APP_PRIVATE_KEY/);
    });

    it('names a missing App variable or secret in a failing step before it mints the token', () => {
        const check = source.indexOf('Missing variable RELEASE_CLIENT_ID');
        expect(check).toBeGreaterThan(-1);
        expect(source).toMatch(/Missing secret RELEASE_APP_PRIVATE_KEY/);
        expect(check).toBeLessThan(source.indexOf('create-github-app-token'));
    });

    it('calls deploy.yml only when a release was created, with the new tag', () => {
        const job = source.slice(source.indexOf('\n  deploy:\n'));
        expect(job).toMatch(/if:\s*needs\.release-please\.outputs\.release_created == 'true'/);
        expect(job).toMatch(/uses:\s*\.\/\.github\/workflows\/deploy\.yml/);
        expect(job).toMatch(/tag:\s*\$\{\{\s*needs\.release-please\.outputs\.tag_name\s*\}\}/);
    });

    it('is the only workflow that calls deploy.yml', () => {
        for (const name of ['check.yml', 'nightly.yml']) {
            expect(text(name)).not.toMatch(/workflows\/deploy\.yml/);
        }
    });
});

describe('release-please configuration', () => {
    const config = JSON.parse(readFileSync('release-please-config.json', 'utf8'));
    const manifest = JSON.parse(readFileSync('.release-please-manifest.json', 'utf8'));
    const root = JSON.parse(readFileSync('package.json', 'utf8'));

    it('has one node package at the root with v-prefixed tags and no component prefix', () => {
        expect(Object.keys(config.packages)).toEqual(['.']);
        expect(config.packages['.']).toMatchObject({
            'release-type': 'node',
            'changelog-path': 'CHANGELOG.md',
            'include-v-in-tag': true,
            'include-component-in-tag': false,
            'bump-minor-pre-major': false,
        });
    });

    it('keeps the manifest version equal to package.json and has no release-as override after 6.0.0', () => {
        expect(manifest['.']).toBe(root.version);
        expect(config.packages['.']['release-as']).toBeUndefined();
    });
});
