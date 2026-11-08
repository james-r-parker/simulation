// Static rules for the preview workflow and the pinned deploy-time wrangler (docs/designs/deployment-and-community.md,
// "Preview workflow"). No YAML parser is installed, so the files are read as text.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { jobsOf, text, triggers } from './helpers/workflow-text.js';

describe('preview.yml', () => {
    const source = text('preview.yml');
    const jobs = jobsOf(source);

    it('is started only by a finished check run', () => {
        const on = triggers(source);
        expect(on).toMatch(/^ {2}workflow_run:/m);
        expect(on).toMatch(/workflows:\s*\[check\]/);
        expect(on).not.toMatch(/^ {2}(push|pull_request|workflow_call|workflow_dispatch|release):/m);
    });

    it('never deploys to a production branch, and runs in the preview environment only', () => {
        expect(source).not.toMatch(/--branch main\b(?!-)/);
        expect(source).not.toMatch(/environment:\s*production|name:\s*production/);
        expect(source).toMatch(/environment:\s*preview/);
        expect(source).toContain('^(pr-[0-9]+|next|main-latest)$');
    });

    it('migrates only the preview database', () => {
        expect(source).toMatch(/migrations apply blob-library-preview --env preview --remote/);
        expect(source).not.toMatch(/migrations apply blob-library --remote/);
    });

    it('fails by name when the preview environment lacks its secrets, before any wrangler call, and never skips', () => {
        const check = source.indexOf("The 'preview' GitHub environment");
        expect(check).toBeGreaterThan(-1);
        expect(source).toContain('missing+=("secret CLOUDFLARE_API_TOKEN")');
        expect(source).toContain('missing+=("secret CLOUDFLARE_ACCOUNT_ID")');
        expect(check).toBeLessThan(source.indexOf('wrangler d1 migrations'));
        expect(source).not.toMatch(/continue-on-error|if:.*secrets\./);
    });

    it('keeps Cloudflare secrets in the deploy job only; the comment job writes pull requests without them', () => {
        for (const job of jobs) {
            expect(/secrets\.CLOUDFLARE_/.test(job.body), job.name).toBe(job.name === 'deploy');
        }
        expect(jobs.find((job) => job.name === 'comment')?.body).toMatch(/pull-requests:\s*write/);
    });
});

describe('scripts/preview-comment.mjs', () => {
    it('prints the marked comment for the URL and commit it is given', () => {
        const out = execFileSync('node', ['scripts/preview-comment.mjs'], {
            encoding: 'utf8',
            env: { ...process.env, URL: 'https://pr-7.example.pages.dev', SHA: 'abcdef0123456789' },
        });
        expect(out.startsWith('<!-- blob-evolution-preview -->\n')).toBe(true);
        expect(out).toContain('https://pr-7.example.pages.dev');
        expect(out).toContain('abcdef0');
    });
});

describe('.github/deploy', () => {
    const root = JSON.parse(readFileSync('package.json', 'utf8'));
    const deploy = JSON.parse(readFileSync('.github/deploy/package.json', 'utf8'));
    const lock = JSON.parse(readFileSync('.github/deploy/package-lock.json', 'utf8'));

    it('pins wrangler to the version in the root package.json, in the manifest and the lockfile', () => {
        expect(deploy.dependencies.wrangler).toBe(root.devDependencies.wrangler);
        expect(lock.packages['node_modules/wrangler'].version).toBe(root.devDependencies.wrangler);
    });

    it('is listed in dependabot.yml', () => {
        expect(readFileSync('.github/dependabot.yml', 'utf8')).toMatch(/directory:\s*\/\.github\/deploy/);
    });
});
