#!/usr/bin/env bash
# Runs the Rust `#[test]` cases of the WASM kernels crate (docs/designs/wasm-kernels.md). The crate builds only for
# wasm32-unknown-unknown, so `cargo test` cannot run the tests itself: it builds a test .wasm that imports `env.memory`,
# and Node instantiates it with a fresh memory and calls its `main(0, 0)`. libtest returns 0 when every test passes; a
# failing test panics, which traps as "unreachable" on this target. Needs cargo (1.99, target wasm32-unknown-unknown),
# so CI and the gates do not run it; run it after any change under wasm/src.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PATH="$HOME/.cargo/bin:$PATH"
# Outside the tree, as scripts/build-wasm.sh does, so Prettier and the other gates never walk the build output.
target_dir="${CARGO_TARGET_DIR:-${XDG_CACHE_HOME:-$HOME/.cache}/blob-kernels/target}"

cd "$root/wasm"
binary="$(cargo test --locked --no-run --quiet --target-dir "$target_dir" --message-format=json \
  | node -e '
let path = "";
for (const line of require("node:fs").readFileSync(0, "utf8").split("\n")) {
    const msg = line ? JSON.parse(line) : {};
    if (msg.reason === "compiler-artifact" && msg.profile?.test && msg.executable) path = msg.executable;
}
process.stdout.write(path);
')"
if [[ -z "$binary" ]]; then
  echo "test-wasm: cargo built no test binary" >&2
  exit 1
fi

node -e '
const bytes = require("node:fs").readFileSync(process.argv[1]);
const memory = new WebAssembly.Memory({ initial: 64 });
const { exports } = new WebAssembly.Instance(new WebAssembly.Module(bytes), { env: { memory } });
let code;
try {
    code = exports.main(0, 0);
} catch (error) {
    console.error(`test-wasm: a Rust test failed (${error.message}); the trap does not say which`);
    process.exit(1);
}
if (code !== 0) {
    console.error(`test-wasm: the test harness returned ${code}`);
    process.exit(1);
}
console.log("test-wasm: every Rust test passed");
' "$binary"
