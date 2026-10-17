import { describe, expect, it } from 'vitest';
import { createDownloader } from '../../../js/app/ui/download.js';
import { fakeDocument } from '../helpers/fake-dom.js';

describe('createDownloader', () => {
    it('links a blob URL with the file name, clicks it, removes the link and frees the URL', () => {
        const doc = fakeDocument();
        doc.body = doc.createElement('body');
        const log = /** @type {string[]} */ ([]);
        const url = {
            createObjectURL: (/** @type {any} */ blob) => (log.push(`create ${blob.type}:${blob.text}`), 'blob:1'),
            revokeObjectURL: (/** @type {string} */ u) => void log.push(`revoke ${u}`),
        };
        const originalCreate = doc.createElement;
        doc.createElement = (/** @type {string} */ tag) => {
            const el = originalCreate(tag);
            el.click = () =>
                log.push(
                    `click ${el.getAttribute('href')} ${el.getAttribute('download')} in:${el.parent === doc.body}`,
                );
            return el;
        };
        const save = createDownloader({ doc, url, makeBlob: (text, type) => ({ text, type }) });
        save({ name: 'run.json', text: '{}' });
        expect(log).toEqual(['create application/json:{}', 'click blob:1 run.json in:true', 'revoke blob:1']);
        expect(doc.body.children).toHaveLength(0);
    });

    it('makes a real Blob of the given type when no maker is injected', () => {
        const doc = fakeDocument();
        doc.body = doc.createElement('body');
        const blobs = /** @type {any[]} */ ([]);
        const url = { createObjectURL: (/** @type {any} */ b) => (blobs.push(b), 'blob:3'), revokeObjectURL() {} };
        const el = { setAttribute() {}, click() {}, remove() {} };
        const save = createDownloader({ doc: { createElement: () => el, body: { appendChild() {} } }, url });
        save({ name: 'a.json', text: '{"a":1}' });
        expect(blobs[0]).toBeInstanceOf(Blob);
        expect([blobs[0].type, blobs[0].size]).toEqual(['application/json', 7]);
    });

    it('uses the type it is given', () => {
        const doc = fakeDocument();
        doc.body = doc.createElement('body');
        const types = /** @type {string[]} */ ([]);
        const url = { createObjectURL: (/** @type {any} */ b) => (types.push(b.type), 'blob:2'), revokeObjectURL() {} };
        const el = { setAttribute() {}, click() {}, remove() {} };
        const save = createDownloader({
            doc: { createElement: () => el, body: { appendChild() {} } },
            url,
            makeBlob: (text, type) => ({ text, type }),
        });
        save({ name: 'a.txt', text: 'x', type: 'text/plain' });
        expect(types).toEqual(['text/plain']);
    });
});
