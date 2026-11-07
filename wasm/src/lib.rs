//! WASM kernels for the sim's hot numeric loops (docs/designs/wasm-kernels.md).
//!
//! The JS worker keeps the tick loop and every rule; it calls one export per phase. Every argument is an `i32` byte
//! offset or count into the one imported memory, and results are written back into that memory. No allocation, no
//! dependencies, no fast-math: each operation rounds as the JS double operation it replaces.
#![no_std]

mod brain;
mod det_math;
mod sense;

/// The kernel ABI version; `js/sim/wasm-loader.js` refuses a binary whose version it does not know.
pub const ABI_VERSION: i32 = 1;

/// Returns the ABI version, so the loader can check it is talking to the binary it expects.
#[unsafe(no_mangle)]
pub extern "C" fn abi_version() -> i32 {
    ABI_VERSION
}

/// `detTanhInto` in place over `n` doubles at byte offset `ptr`: 0, or i + 1 for the first non-finite value.
///
/// # Safety
/// `ptr` must address `n` doubles inside the memory.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn tanh_into(ptr: i32, n: i32) -> i32 {
    // SAFETY: the caller passes an in-bounds range.
    unsafe { det_math::tanh_in_place(ptr as usize as *mut f64, n as usize) as i32 }
}

/// `detTanh` of one finite value.
#[unsafe(no_mangle)]
pub extern "C" fn tanh_f64(x: f64) -> f64 {
    det_math::det_tanh(x)
}

/// `detExp` of one value in [-708, 709].
#[unsafe(no_mangle)]
pub extern "C" fn exp_f64(x: f64) -> f64 {
    det_math::det_exp(x)
}

/// `detSigmoid` of one finite value.
#[unsafe(no_mangle)]
pub extern "C" fn sigmoid_f64(x: f64) -> f64 {
    det_math::det_sigmoid(x)
}

/// Runs the brain phase for every alive slot (`forwardAll`): 0, or 1 with the fault written to the parameter block.
///
/// # Safety
/// `params` and `doubles` address the blocks `js/sim/wasm-brain.js` wrote, describing arrays inside the memory.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn brain_forward(params: i32, doubles: i32) -> i32 {
    // SAFETY: the caller passes the arena's parameter blocks.
    unsafe { brain::forward_all(params as u32, doubles as u32) }
}

/// Pools one slot's raw inputs into its `pooled` row (`poolRays`), as the brain phase does before its hidden step.
///
/// # Safety
/// `params` addresses the block `js/sim/wasm-brain.js` wrote, and `slot` is below `maxAgents`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn pool_slot(params: i32, slot: i32) {
    // SAFETY: the caller passes the arena's parameter block and a slot inside it.
    unsafe { brain::pool_one(params as u32, slot as usize) }
}

/// Gathers one casting agent's circles and finds every ray's nearest hit (`castRays` without the hit classes): the
/// gathered row count.
///
/// # Safety
/// `params` addresses the block `js/sim/wasm-sense.js` wrote, and `slot` is below `maxAgents`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn sense_slot(params: i32, slot: i32) -> i32 {
    // SAFETY: the caller passes the arena's sense parameter block and an alive slot.
    unsafe { sense::sense_slot(params as u32, slot as usize) as i32 }
}

#[panic_handler]
fn panic(_info: &core::panic::PanicInfo) -> ! {
    core::arch::wasm32::unreachable()
}
