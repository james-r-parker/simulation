// Compiles the WASM kernels (docs/designs/wasm-kernels.md). The binary is embedded in `wasm-binary.js` (base64,
// written by scripts/build-wasm.sh beside wasm/blob-kernels.wasm), so every world compiles from the same bytes in Node,
// the eval workers, Vitest and the browser's sim worker, synchronously and with no file system, fetch or DOM.
// The module is compiled once per thread and its `__heap_base` read once; each world then needs only an instance.

import { KERNEL_BASE64 } from './wasm-binary.js';

/** The kernel ABI this code speaks; the binary's `abi_version` export must return it. */
export const KERNEL_ABI = 1;

/** Exports every kernel binary must have. */
export const REQUIRED_EXPORTS = Object.freeze([
    'abi_version',
    '__heap_base',
    'tanh_into',
    'brain_forward',
    'pool_slot',
    'sense_slot',
    'build_hash',
    'update_pheromones',
]);

/** Pages of the throwaway memory the probe instance reads `__heap_base` from; the kernels declare far fewer. */
export const PROBE_PAGES = 64;

/** @typedef {{ module: WebAssembly.Module, heapBase: number }} Kernels */

/**
 * @param {string} text base64
 * @returns {Uint8Array} the bytes
 */
export function decodeBase64(text) {
    const binary = atob(text);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

/**
 * Checks what a probe instance reports.
 * @param {number} abi the binary's `abi_version()`
 * @param {unknown} heapBase the binary's `__heap_base` value
 * @returns {number} the heap base
 * @throws {Error} when the ABI is not `KERNEL_ABI` or the heap base is not an integer
 */
export function checkProbe(abi, heapBase) {
    if (abi !== KERNEL_ABI) {
        throw new Error(`kernel ABI ${abi}, expected ${KERNEL_ABI}`);
    }
    if (!Number.isInteger(heapBase)) {
        throw new Error('no integer __heap_base');
    }
    return /** @type {number} */ (heapBase);
}

/**
 * Instantiates the kernels once on a throwaway memory to check the ABI and read where their own data ends.
 * @param {WebAssembly.Module} module the compiled kernels
 * @returns {number} the kernels' `__heap_base`
 */
function probeHeapBase(module) {
    const memory = new WebAssembly.Memory({ initial: PROBE_PAGES });
    const probe = new WebAssembly.Instance(module, { env: { memory } });
    const abi = /** @type {() => number} */ (probe.exports.abi_version)();
    return checkProbe(abi, /** @type {WebAssembly.Global} */ (probe.exports.__heap_base).value);
}

/**
 * Compiles a kernel binary and checks its exports and ABI. Fails loudly: there is no JS kernel to fall back to.
 * @param {Uint8Array | ArrayBuffer | null | undefined} bytes the binary
 * @returns {Kernels} the compiled module and its `__heap_base`
 * @throws {Error} when the bytes are missing, do not compile, lack an export or speak another ABI
 */
export function loadKernels(bytes) {
    if (bytes === null || bytes === undefined || bytes.byteLength === 0) {
        throw new Error('WASM kernels: no kernel bytes');
    }
    try {
        const module = new WebAssembly.Module(/** @type {BufferSource} */ (bytes));
        const names = new Set(WebAssembly.Module.exports(module).map((e) => e.name));
        const missing = REQUIRED_EXPORTS.filter((name) => !names.has(name));
        if (missing.length > 0) {
            throw new Error(`missing exports: ${missing.join(', ')}`);
        }
        return { module, heapBase: probeHeapBase(module) };
    } catch (error) {
        throw new Error(`WASM kernels: ${/** @type {Error} */ (error).message}`, { cause: error });
    }
}

/** @type {Kernels | null} */
let embedded = null;

/**
 * @returns {Kernels} the embedded kernels, compiled on first use and kept for the thread's life
 */
export function embeddedKernels() {
    embedded ??= loadKernels(decodeBase64(KERNEL_BASE64));
    return embedded;
}
