import { describe, expect, it } from 'vitest';
import {
    ICON_OUTPUTS,
    ICO_SIZES,
    encodeIco,
    jpegSize,
    pngSize,
    readIco,
    variantSvg,
} from '../scripts/lib/icon-files.mjs';

/**
 * A minimal PNG header: the signature and an IHDR chunk with the given size, then filler bytes.
 * @param {number} width Pixel width.
 * @param {number} height Pixel height.
 * @param {number} [extra] Filler bytes after the header.
 * @returns {Uint8Array} The bytes.
 */
function fakePng(width, height, extra = 9) {
    const bytes = new Uint8Array(24 + extra);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const view = new DataView(bytes.buffer);
    view.setUint32(8, 13);
    bytes.set([73, 72, 68, 82], 12);
    view.setUint32(16, width);
    view.setUint32(20, height);
    return bytes;
}

describe('pngSize', () => {
    it('reads the width and height from IHDR', () => {
        expect(pngSize(fakePng(1200, 630))).toEqual({ width: 1200, height: 630 });
    });

    it('reads from a view into a larger buffer', () => {
        const big = new Uint8Array(48);
        big.set(fakePng(16, 32), 8);
        expect(pngSize(big.subarray(8))).toEqual({ width: 16, height: 32 });
    });

    it('refuses a short buffer, a non-PNG and a PNG without IHDR first', () => {
        expect(() => pngSize(new Uint8Array(10))).toThrow('Not a PNG');
        expect(() => pngSize(new Uint8Array(30))).toThrow('Not a PNG');
        const noIhdr = fakePng(4, 4);
        noIhdr[12] = 0x58;
        expect(() => pngSize(noIhdr)).toThrow('IHDR');
    });
});

describe('jpegSize', () => {
    /** SOI, an APP0 segment of 4 bytes, then a frame marker with height 630 and width 1200. */
    const jpeg = (frame = 0xc0) =>
        new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 1, 2, 0xff, frame, 0, 17, 8, 0x02, 0x76, 0x04, 0xb0, 3]);

    it('reads the size from the first start-of-frame marker after other segments', () => {
        expect(jpegSize(jpeg())).toEqual({ width: 1200, height: 630 });
        expect(jpegSize(jpeg(0xc2))).toEqual({ width: 1200, height: 630 });
    });

    it('refuses a non-JPEG and a JPEG with no frame marker', () => {
        expect(() => jpegSize(new Uint8Array([0x89, 0x50, 0, 0]))).toThrow('Not a JPEG');
        expect(() => jpegSize(new Uint8Array([0xff]))).toThrow('Not a JPEG');
        expect(() => jpegSize(jpeg(0xdb))).toThrow('no start-of-frame');
    });
});

describe('encodeIco', () => {
    it('writes the header and one directory entry per image with sizes and offsets', () => {
        const images = [16, 32, 48].map((size, i) => ({ size, png: fakePng(size, size, 5 + i) }));
        const ico = encodeIco(images);
        const view = new DataView(ico.buffer);
        expect([view.getUint16(0, true), view.getUint16(2, true), view.getUint16(4, true)]).toEqual([0, 1, 3]);
        expect(view.getUint16(6 + 4, true)).toBe(1);
        expect(view.getUint16(6 + 6, true)).toBe(32);
        const entries = readIco(ico);
        expect(entries.map((e) => e.width)).toEqual([16, 32, 48]);
        expect(entries[0].offset).toBe(6 + 16 * 3);
        for (const [i, entry] of entries.entries()) {
            expect(entry.bytes).toBe(images[i].png.length);
            expect(ico.subarray(entry.offset, entry.offset + entry.bytes)).toEqual(images[i].png);
        }
        expect(ico.length).toBe(entries[2].offset + entries[2].bytes);
    });

    it('writes 0 for a 256 px side, which reads back as 256', () => {
        const ico = encodeIco([{ size: 256, png: fakePng(256, 256) }]);
        expect(ico[6]).toBe(0);
        expect(readIco(ico)[0]).toMatchObject({ width: 256, height: 256 });
    });

    it('refuses no images, a size mismatch, a side over 256 and a non-PNG', () => {
        expect(() => encodeIco([])).toThrow('at least one');
        expect(() => encodeIco([{ size: 32, png: fakePng(16, 16) }])).toThrow('expected 32x32');
        expect(() => encodeIco([{ size: 512, png: fakePng(512, 512) }])).toThrow('at most 256');
        expect(() => encodeIco([{ size: 16, png: new Uint8Array(30) }])).toThrow('Not a PNG');
    });
});

describe('readIco', () => {
    it('refuses a non-ICO and a truncated directory', () => {
        expect(() => readIco(new Uint8Array(4))).toThrow('Not an ICO');
        expect(() => readIco(new Uint8Array([0, 0, 2, 0, 1, 0]))).toThrow('Not an ICO');
        expect(() => readIco(new Uint8Array([0, 0, 1, 0, 2, 0, 16]))).toThrow('truncated');
    });
});

describe('variantSvg', () => {
    const source = '<!-- x --><svg viewBox="0 0 1 1"></svg>';

    it('adds the variant and the size to the root element', () => {
        expect(variantSvg(source, { variant: 'favicon' })).toBe(
            '<!-- x --><svg data-variant="favicon" viewBox="0 0 1 1"></svg>',
        );
        expect(variantSvg(source, { variant: '', size: 16 })).toBe(
            '<!-- x --><svg style="width:16px;height:16px;display:block" viewBox="0 0 1 1"></svg>',
        );
    });

    it('refuses text with no svg element', () => {
        expect(() => variantSvg('<p></p>', { variant: '' })).toThrow('no <svg>');
    });
});

describe('the icon list', () => {
    it('names each output once, in the icon folder or as a root favicon', () => {
        const paths = ICON_OUTPUTS.map((o) => o.path);
        expect(new Set(paths).size).toBe(paths.length);
        expect(paths.every((p) => p.startsWith('public/icons/') || p.startsWith('public/favicon.'))).toBe(true);
        expect(ICO_SIZES).toEqual([16, 32, 48]);
    });
});
