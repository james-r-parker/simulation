// The `comment` job of .github/workflows/preview.yml: prints the pull request comment for the deployment in URL and SHA.
//   URL=https://pr-7.matrix-6be.pages.dev SHA=<commit> node scripts/preview-comment.mjs
import { previewComment } from './lib/pr-comment.mjs';

const { URL: url, SHA: sha } = process.env;
if (url === undefined || url === '' || sha === undefined || sha === '') {
    throw new Error('preview-comment: URL and SHA are required');
}
console.log(previewComment(url, sha));
