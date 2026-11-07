// Static rules for the workflows that hold, or sit next to, Cloudflare and release secrets
// (docs/designs/deployment-and-community.md, "Deploy workflow"). No YAML parser is installed, so the files are read as
// text: a job is the block under a two-space-indented name below `jobs:`, a step starts at `- `.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const FILES = ['deploy.yml', 'release.yml', 'release-please.yml'];
const text = (/** @type {string} */ name) => readFileSync(`.github/workflows/${name}`, 'utf8');

/**
 * @param {string} source a workflow file
 * @returns {{name: string, body: string, steps: string[]}[]} its jobs, each with its steps' text
 */
function jobsOf(source) {
    const after = source.slice(source.indexOf('\njobs:\n') + 7);
    const parts = after.split(/^ {2}([A-Za-z0-9_-]+):\n/m);
    const jobs = [];
    for (let i = 1; i < parts.length; i += 2) {
        const body = parts[i + 1];
        jobs.push({ name: parts[i], body, steps: body.split(/^ {6}- /m).slice(1) });
    }
    return jobs;
}

const holdsSecrets = (/** @type {string} */ body) => /secrets\.(?!GITHUB_TOKEN)/.test(body);

describe.each(FILES)('%s', (file) => {
    const source = text(file);
    const jobs = jobsOf(source);

    it('has jobs and no pull_request_target trigger', () => {
        expect(jobs.length).toBeGreaterThan(0);
        expect(source).not.toMatch(/pull_request_target/);
    });

    it('pins every third-party action to a 40-character SHA', () => {
        const uses = [...source.matchAll(/^\s*(?:- )?uses:\s*(\S+)/gm)].map((m) => m[1]);
        for (const ref of uses) {
            expect(ref.startsWith('./') || /^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/.test(ref), ref).toBe(true);
        }
    });

    it('persists no checkout credentials and uses no cache', () => {
        for (const step of source.split(/^ +- /m).filter((s) => s.includes('actions/checkout'))) {
            expect(step).toMatch(/persist-credentials:\s*false/);
        }
        expect(source).not.toMatch(/^\s*cache:/m);
    });

    it.each(jobs.map((job) => [job.name, job]))('job %s: a job with secrets runs no repository code', (_name, job) => {
        if (!holdsSecrets(job.body)) {
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
});

describe('deploy.yml and release.yml', () => {
    it('only the deploy jobs hold Cloudflare secrets', () => {
        for (const file of ['deploy.yml', 'release.yml']) {
            for (const job of jobsOf(text(file))) {
                expect(/secrets\.CLOUDFLARE_/.test(job.body), `${file} ${job.name}`).toBe(job.name === 'deploy');
            }
        }
    });

    it('deploy.yml deploys only to preview and next branches, never to main', () => {
        expect(text('deploy.yml')).not.toMatch(/--branch main\b(?!-)/);
        expect(text('deploy.yml')).toMatch(/environment:\s*preview/);
    });

    it('release.yml deploys production from the main branch alias, in the production environment', () => {
        expect(text('release.yml')).toMatch(/--branch main\b/);
        expect(text('release.yml')).toMatch(/name:\s*production/);
        expect(text('release.yml')).toMatch(/group:\s*release\n\s+cancel-in-progress:\s*false/);
    });

    it('release.yml is called by release-please.yml and listens to no release or tag event', () => {
        expect(text('release-please.yml')).toMatch(/uses:\s*\.\/\.github\/workflows\/release\.yml/);
        expect(text('release.yml')).not.toMatch(/^\s+(release|push):/m);
    });

    it('release-please.yml uses the GitHub App token', () => {
        expect(text('release-please.yml')).toMatch(/create-github-app-token/);
        expect(text('release-please.yml')).toMatch(/token:\s*\$\{\{\s*steps\.app\.outputs\.token/);
    });
});

describe('.github/deploy', () => {
    const root = JSON.parse(readFileSync('package.json', 'utf8'));
    const deploy = JSON.parse(readFileSync('.github/deploy/package.json', 'utf8'));
    const lock = JSON.parse(readFileSync('.github/deploy/package-lock.json', 'utf8'));
    const rootVersion = root.devDependencies.wrangler;

    it('pins wrangler to the version in the root package.json, in the manifest and the lockfile', () => {
        expect(deploy.dependencies.wrangler).toBe(rootVersion);
        expect(lock.packages['node_modules/wrangler'].version).toBe(rootVersion);
    });

    it('is listed in dependabot.yml', () => {
        expect(readFileSync('.github/dependabot.yml', 'utf8')).toMatch(/directory:\s*\/\.github\/deploy/);
    });
});

describe('release-please configuration', () => {
    const config = JSON.parse(readFileSync('release-please-config.json', 'utf8'));
    const manifest = JSON.parse(readFileSync('.release-please-manifest.json', 'utf8'));
    const root = JSON.parse(readFileSync('package.json', 'utf8'));

    it('has one node package at the root with v-prefixed tags', () => {
        expect(Object.keys(config.packages)).toEqual(['.']);
        expect(config.packages['.']).toMatchObject({
            'release-type': 'node',
            'changelog-path': 'CHANGELOG.md',
            'include-v-in-tag': true,
            'bump-minor-pre-major': false,
        });
    });

    it('starts from the package.json version and releases 6.0.0 first', () => {
        expect(manifest['.']).toBe(root.version);
        expect(config.packages['.']['release-as']).toBe('6.0.0');
    });
});
