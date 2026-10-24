// Saving text as a file: a Blob behind an object URL on a temporary link. Over an injected document and URL so the
// steps test without a browser.

/**
 * @param {{doc: {createElement: (tag: string) => any, body: {appendChild: (c: any) => void}},
 *   url: {createObjectURL: (blob: any) => string, revokeObjectURL: (url: string) => void},
 *   makeBlob?: (text: string, type: string) => any}} deps the document, the URL object and, for tests, the Blob maker
 * @returns {(file: {name: string, text?: string, type?: string, blob?: any}) => void} saves a file with the given name
 */
export function createDownloader({ doc, url, makeBlob = (text, type) => new Blob([text], { type }) }) {
    return ({ name, text = '', type = 'application/json', blob }) => {
        const href = url.createObjectURL(blob ?? makeBlob(text, type));
        const link = doc.createElement('a');
        link.setAttribute('href', href);
        link.setAttribute('download', name);
        link.hidden = true;
        doc.body.appendChild(link);
        link.click();
        link.remove();
        url.revokeObjectURL(href);
    };
}
