import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { KERNEL_BASE64 } from '../../js/sim/wasm-binary.js';
import { decodeBase64 } from '../../js/sim/wasm-loader.js';

describe('KERNEL_BASE64', () => {
    it('decodes to the committed wasm/blob-kernels.wasm, byte for byte', () => {
        const committed = readFileSync(new URL('../../wasm/blob-kernels.wasm', import.meta.url));
        expect(Buffer.from(decodeBase64(KERNEL_BASE64)).equals(committed)).toBe(true);
    });
});
