#!/usr/bin/env bash
# Builds the WASM kernels (docs/designs/wasm-kernels.md): cargo for wasm32-unknown-unknown, then wasm-opt -O3 with
# standard SIMD. With no argument it writes the committed wasm/blob-kernels.wasm and wasm/blob-kernels.wasm.sha256;
# with a path it writes only that file (scripts/check-wasm.mjs rebuilds into a temporary path and compares).
# Run it whenever wasm/src changes. Needs rustc and cargo (1.99, target wasm32-unknown-unknown) and wasm-opt.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PATH="$HOME/.cargo/bin:$PATH"

out="${1:-$root/wasm/blob-kernels.wasm}"
# Outside the tree, so Prettier and the other gates never walk the build output.
target_dir="${CARGO_TARGET_DIR:-${XDG_CACHE_HOME:-$HOME/.cache}/blob-kernels/target}"

# Cargo reads wasm/.cargo/config.toml from the working directory, so build from inside the crate. The source path is
# remapped so the bytes do not depend on where the checkout lives.
cd "$root/wasm"
cargo build --release --locked --quiet --target-dir "$target_dir" \
  --config "target.wasm32-unknown-unknown.rustflags=['--remap-path-prefix=$root=/blob']"
# The features rustc's generic wasm32 CPU emits, plus standard SIMD; relaxed SIMD stays off.
wasm-opt -O3 --enable-simd --enable-nontrapping-float-to-int --enable-bulk-memory --enable-sign-ext \
  --enable-mutable-globals --enable-multivalue --enable-reference-types --strip-debug --strip-producers \
  "$target_dir/wasm32-unknown-unknown/release/blob_kernels.wasm" -o "$out"

if [[ $# -eq 0 ]]; then
  sha256sum blob-kernels.wasm > blob-kernels.wasm.sha256
  echo "wrote wasm/blob-kernels.wasm ($(stat -c %s "$out") bytes) and its hash"
fi
