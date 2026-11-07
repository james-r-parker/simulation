//! WASM kernels for the sim's hot numeric loops (docs/designs/wasm-kernels.md).
//!
//! The JS worker keeps the tick loop and every rule; it calls one export per phase. Every argument is an `i32` byte
//! offset or count into the one imported memory, and results are written back into that memory. No allocation, no
//! dependencies, no fast-math: each operation rounds as the JS double operation it replaces.
#![no_std]

/// The kernel ABI version; `js/sim/wasm-loader.js` refuses a binary whose version it does not know.
pub const ABI_VERSION: i32 = 1;

/// Returns the ABI version, so the loader can check it is talking to the binary it expects.
#[unsafe(no_mangle)]
pub extern "C" fn abi_version() -> i32 {
    ABI_VERSION
}

#[panic_handler]
fn panic(_info: &core::panic::PanicInfo) -> ! {
    core::arch::wasm32::unreachable()
}
