// The icon set's file list and the two binary formats it needs: reading a PNG's size and writing an ICO container.
// Pure: scripts/build-icons.mjs renders the pixels, test/web-presence.test.js checks the committed files.

/** The source of truth every icon is rendered from. */
export const ICON_SOURCE = 'public/icons/icon.svg';

/** The tile-less favicon SVG, written from the source with `data-variant="favicon"`. */
export const FAVICON_SVG = 'public/favicon.svg';

/** The multi-size favicon and the sizes it holds. */
export const FAVICON_ICO = 'public/favicon.ico';
export const ICO_SIZES = Object.freeze([16, 32, 48]);

/** The share card. */
export const OG_IMAGE = Object.freeze({ path: 'public/og/og-image.png', width: 1200, height: 630 });

/**
 * Every square PNG the build writes: its path, side in pixels and the source's `data-variant` (`''` is the full tile).
 * @type {ReadonlyArray<Readonly<{ path: string, size: number, variant: '' | 'maskable' | 'favicon' }>>}
 */
export const ICON_OUTPUTS = Object.freeze([
    { path: 'public/favicon.png', size: 192, variant: '' },
    { path: 'public/icons/icon-192.png', size: 192, variant: '' },
    { path: 'public/icons/icon-512.png', size: 512, variant: '' },
    { path: 'public/icons/maskable-192.png', size: 192, variant: 'maskable' },
    { path: 'public/icons/maskable-512.png', size: 512, variant: 'maskable' },
    { path: 'public/icons/apple-touch-icon.png', size: 180, variant: 'maskable' },
]);

const PNG_SIGNATURE = Object.freeze([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ICO_HEADER_BYTES = 6;
const ICO_ENTRY_BYTES = 16;

/**
 * Whether the bytes start with the PNG signature.
 * @param {Uint8Array} bytes The file.
 * @returns {boolean} True for a PNG.
 */
function isPng(bytes) {
    return bytes.length >= PNG_SIGNATURE.length && PNG_SIGNATURE.every((b, i) => bytes[i] === b);
}

/**
 * Reads a PNG's width and height from its IHDR chunk.
 * @param {Uint8Array} bytes The PNG file.
 * @returns {{ width: number, height: number }} The pixel size.
 */
export function pngSize(bytes) {
    if (bytes.length < 24 || !isPng(bytes)) {
        throw new Error('Not a PNG file');
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (String.fromCharCode(...bytes.subarray(12, 16)) !== 'IHDR') {
        throw new Error('PNG has no IHDR chunk first');
    }
    return { width: view.getUint32(16), height: view.getUint32(20) };
}

/**
 * Writes an ICO container holding PNG-compressed square images.
 * @param {{ size: number, png: Uint8Array }[]} images One PNG per size, in the order they are listed.
 * @returns {Uint8Array} The ICO file.
 */
export function encodeIco(images) {
    if (images.length === 0) {
        throw new Error('An ICO needs at least one image');
    }
    const dataStart = ICO_HEADER_BYTES + ICO_ENTRY_BYTES * images.length;
    const total = dataStart + images.reduce((sum, image) => sum + image.png.length, 0);
    const out = new Uint8Array(total);
    const view = new DataView(out.buffer);
    view.setUint16(2, 1, true);
    view.setUint16(4, images.length, true);
    let offset = dataStart;
    images.forEach(({ size, png }, i) => {
        const { width, height } = pngSize(png);
        if (width !== size || height !== size || size > 256) {
            throw new Error(`ICO image ${i} is ${width}x${height}, expected ${size}x${size} (at most 256)`);
        }
        const entry = ICO_HEADER_BYTES + ICO_ENTRY_BYTES * i;
        out[entry] = size % 256;
        out[entry + 1] = size % 256;
        view.setUint16(entry + 4, 1, true);
        view.setUint16(entry + 6, 32, true);
        view.setUint32(entry + 8, png.length, true);
        view.setUint32(entry + 12, offset, true);
        out.set(png, offset);
        offset += png.length;
    });
    return out;
}

/**
 * Reads an ICO's directory.
 * @param {Uint8Array} bytes The ICO file.
 * @returns {{ width: number, height: number, bytes: number, offset: number }[]} One entry per image (0 reads as 256).
 */
export function readIco(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (bytes.length < ICO_HEADER_BYTES || view.getUint16(0, true) !== 0 || view.getUint16(2, true) !== 1) {
        throw new Error('Not an ICO file');
    }
    const count = view.getUint16(4, true);
    if (bytes.length < ICO_HEADER_BYTES + ICO_ENTRY_BYTES * count) {
        throw new Error('ICO directory is truncated');
    }
    return Array.from({ length: count }, (_, i) => {
        const entry = ICO_HEADER_BYTES + ICO_ENTRY_BYTES * i;
        return {
            width: bytes[entry] || 256,
            height: bytes[entry + 1] || 256,
            bytes: view.getUint32(entry + 8, true),
            offset: view.getUint32(entry + 12, true),
        };
    });
}
