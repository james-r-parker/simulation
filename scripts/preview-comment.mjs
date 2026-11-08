// The `comment` job of .github/workflows/preview.yml: prints the pull request comment for the deployment in URL and SHA.
//   URL=https://pr-7.matrix-6be.pages.dev SHA=<commit> node scripts/preview-comment.mjs
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { previewComment } from './lib/pr-comment.mjs';

/**
 * @param {Record<string, string | undefined>} env URL and SHA of the deployment
 * @returns {string} the pull request comment
 * @throws {Error} when URL or SHA is missing
 */
export function commentFromEnv({ URL: url, SHA: sha }) {
    if (url === undefined || url === '' || sha === undefined || sha === '') {
        throw new Error('preview-comment: URL and SHA are required');
    }
    return previewComment(url, sha);
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
    console.log(commentFromEnv(process.env));
}
