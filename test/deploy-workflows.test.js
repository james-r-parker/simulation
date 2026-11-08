// Static rules for the production deploy path (docs/designs/deployment-and-community.md, "Phase 1a"). No YAML parser is
// installed, so the workflow files are read as text.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const text = (/** @type {string} */ name) => readFileSync(`.github/workflows/${name}`, 'utf8');
/** @param {string} source a workflow file @returns {string} its `on:` block */
const triggers = (source) => source.match(/^on:\n((?: .*\n|\n)*)/m)?.[1] ?? '';

describe.each(['deploy.yml', 'release-please.yml'])('%s', (file) => {
    const source = text(file);

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
});

describe('release-please.yml', () => {
    const source = text('release-please.yml');

    it('runs on a push to main and uses the GitHub App token in the release environment', () => {
        expect(triggers(source)).toMatch(/push:\n\s+branches:\s*\[main\]/);
        expect(source).toMatch(/environment:\s*release/);
        expect(source).toMatch(/create-github-app-token/);
        expect(source).toMatch(/token:\s*\$\{\{\s*steps\.app\.outputs\.token/);
        expect(source).toMatch(/vars\.RELEASE_APP_ID/);
        expect(source).toMatch(/secrets\.RELEASE_APP_PRIVATE_KEY/);
    });

    it('names a missing App variable or secret in a failing step before it mints the token', () => {
        const check = source.indexOf('Missing variable RELEASE_APP_ID');
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
