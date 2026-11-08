// The preview comment of a pull request (deployment-and-community.md, "Preview workflow").

/** The first line of the comment; the comment job updates the comment that starts with it. */
export const PREVIEW_MARKER = '<!-- blob-evolution-preview -->';

/**
 * @param {string} url the preview deployment URL
 * @param {string} sha the commit it was built from
 * @returns {string} the comment body
 */
export function previewComment(url, sha) {
    return `${PREVIEW_MARKER}\nPreview: ${url}\n\nBuilt from \`${sha.slice(0, 7)}\`. It reads the preview database, never production.`;
}
