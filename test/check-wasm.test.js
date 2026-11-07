import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
    checkHash,
    checkSources,
    hasRebuildTools,
    parseHashFile,
    sha256Hex,
    sourceFiles,
    sourceHashText,
} from '../scripts/check-wasm.mjs';

const BINARY = readFileSync(new URL('../wasm/blob-kernels.wasm', import.meta.url));
const HASH_TEXT = readFileSync(new URL('../wasm/blob-kernels.wasm.sha256', import.meta.url), 'utf8');
const SOURCE_TEXT = readFileSync(new URL('../wasm/blob-kernels.src.sha256', import.meta.url), 'utf8');

describe('check-wasm', () => {
    it('accepts the committed binary against its committed hash', () => {
        expect(checkHash(BINARY, HASH_TEXT)).toEqual([]);
    });

    it('names a binary that differs from its hash', () => {
        const edited = Uint8Array.from(BINARY);
        edited[edited.length - 1] ^= 1;
        const [problem] = checkHash(edited, HASH_TEXT);
        expect(problem).toContain(`hashes to ${sha256Hex(edited)}`);
        expect(problem).toContain('run scripts/build-wasm.sh');
    });

    it('names a missing binary, a missing hash file and a malformed one', () => {
        expect(checkHash(null, HASH_TEXT)[0]).toContain('blob-kernels.wasm is missing');
        expect(checkHash(BINARY, null)[0]).toContain('.sha256 is missing');
        expect(checkHash(BINARY, 'not a hash')[0]).toContain('not a sha256sum line');
    });

    it('reads a sha256sum line in text and binary mode', () => {
        const hex = 'a'.repeat(64);
        expect(parseHashFile(`${hex}  blob-kernels.wasm\n`)).toBe(hex);
        expect(parseHashFile(`${hex} *blob-kernels.wasm`)).toBe(hex);
        expect(parseHashFile(`${hex}  other.wasm`)).toBeNull();
    });

    it('needs both cargo and wasm-opt before it rebuilds', () => {
        expect(typeof hasRebuildTools()).toBe('boolean');
        // A hosted CI runner has cargo but no wasm-opt: an empty PATH hides wasm-opt even where ~/.cargo/bin has cargo.
        expect(hasRebuildTools({ PATH: '' })).toBe(false);
    });

    it('finds every source the binary is built from recorded unchanged, so source drift fails without cargo', () => {
        expect(sourceFiles()).toEqual(
            expect.arrayContaining(['Cargo.toml', 'Cargo.lock', '.cargo/config.toml', 'src/lib.rs']),
        );
        expect(checkSources(SOURCE_TEXT, sourceHashText())).toEqual([]);
    });

    it('names a changed source, a removed one and a missing record', () => {
        const actual = sourceHashText();
        const edited = actual.replace(/^[0-9a-f]{64}(?= {2}src\/lib\.rs$)/m, '0'.repeat(64));
        expect(checkSources(edited, actual)).toEqual([
            'wasm: src/lib.rs changed since wasm/blob-kernels.wasm was built - run scripts/build-wasm.sh',
        ]);
        expect(checkSources(`${actual}${'1'.repeat(64)}  src/gone.rs\n`, actual)[0]).toContain('a source was removed');
        expect(checkSources(null, actual)[0]).toContain('src.sha256 is missing');
    });
});
