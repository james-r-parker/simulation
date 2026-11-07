// The layout of the circles a casting agent's rays could hit, as the sense kernel gathers them into `world.rayLocal`
// (`gather` in wasm/src/sense.rs, docs/designs/wasm-kernels.md): obstacles, live herd bodies and smoke clouds, then the
// agents and food of the hash cells under the vision box, each row `[x, y, c, key]` relative to the caster. The JS
// gather was deleted when the kernel was adopted (T11); these constants are what the kernel and the rules share.

/** Hit kinds, ranked in this order when two hits are equally near. */
export const FOOD = 0;
export const AGENT = 1;
export const OBSTACLE = 2;
export const WALL = 3;
export const SMOKE = 4;
export const HERD = 5;

// Indices into `world.rayScratch`, set by `castSlot` before the kernel gathers (index 3 is the kernel's stamp counter).
export const OX = 0;
export const OY = 1;
export const RANGE = 2;

/** Multiplier that packs a hit kind and an index into one number: `kind * KIND_STRIDE + index` sorts as (kind, index). */
export const KIND_STRIDE = 4294967296;

/** Doubles per `rayLocal` row: origin-relative x, origin-relative y, `c` of the ray-circle quadratic, packed key. */
export const LOCAL_STRIDE = 4;
