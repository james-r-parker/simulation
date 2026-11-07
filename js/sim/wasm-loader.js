// Compiles the WASM kernels (docs/designs/wasm-kernels.md) from bytes the caller read: Node reads wasm/blob-kernels.wasm
// with fs, the browser fetches it as a Vite `?url` asset, so js/sim/ touches no file system, DOM or clock.

/** The kernel ABI this code speaks; the binary's `abi_version` export must return it. */
export const KERNEL_ABI = 1;

/** Exports every kernel binary must have. */
export const REQUIRED_EXPORTS = Object.freeze(['abi_version', '__heap_base', 'tanh_into', 'brain_forward']);

/**
 * @typedef {{ ok: true, module: WebAssembly.Module }
 *   | { ok: false, reason: 'missing' | 'instantiate', detail: string }} Kernels
 */

/**
 * Compiles the kernel binary and checks its exports. Never throws: a bad binary is reported, and the caller falls back
 * to the JS kernels.
 * @param {Uint8Array | ArrayBuffer | null | undefined} bytes the binary, or nothing when it could not be read
 * @returns {Kernels} the compiled module, or why there is none
 */
export function loadKernels(bytes) {
    if (bytes === null || bytes === undefined || bytes.byteLength === 0) {
        return { ok: false, reason: 'missing', detail: 'no kernel bytes' };
    }
    /** @type {WebAssembly.Module} */
    let module;
    try {
        module = new WebAssembly.Module(/** @type {BufferSource} */ (bytes));
    } catch (error) {
        return { ok: false, reason: 'instantiate', detail: String(/** @type {Error} */ (error).message) };
    }
    const names = new Set(WebAssembly.Module.exports(module).map((e) => e.name));
    const missing = REQUIRED_EXPORTS.filter((name) => !names.has(name));
    if (missing.length > 0) {
        return { ok: false, reason: 'instantiate', detail: `missing exports: ${missing.join(', ')}` };
    }
    return { ok: true, module };
}
