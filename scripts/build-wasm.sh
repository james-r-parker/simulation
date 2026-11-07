#!/usr/bin/env bash
# Builds the WASM kernels (docs/designs/wasm-kernels.md): cargo for wasm32-unknown-unknown, then wasm-opt -O3 with
# standard SIMD. With no argument it writes the committed wasm/blob-kernels.wasm, wasm/blob-kernels.wasm.sha256 and
# wasm/blob-kernels.src.sha256 (the hash of every source it was built from);
# with a path it writes only that file (scripts/check-wasm.mjs rebuilds into a temporary path and compares).
# Run it whenever wasm/src changes. Needs rustc and cargo (1.99, target wasm32-unknown-unknown) and wasm-opt.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PATH="$HOME/.cargo/bin:$PATH"

out="${1:-$root/wasm/blob-kernels.wasm}"
# Outside the tree, so Prettier and the other gates never walk the build output.
target_dir="${CARGO_TARGET_DIR:-${XDG_CACHE_HOME:-$HOME/.cache}/blob-kernels/target}"

# wasm/rust-toolchain.toml pins rustc; wasm-opt is pinned here, since another version optimises to different bytes.
WASM_OPT_VERSION=120
found="$(wasm-opt --version 2>&1 | head -1)"
if [[ ! "$found" =~ ^wasm-opt\ version\ ${WASM_OPT_VERSION}(\ |$) ]]; then
  echo "build-wasm: need wasm-opt version ${WASM_OPT_VERSION}, found: $found" >&2
  exit 1
fi

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
  node "$root/scripts/check-wasm.mjs" --write-sources
  echo "wrote wasm/blob-kernels.wasm ($(stat -c %s "$out") bytes), its hash and the source hashes"
fi
