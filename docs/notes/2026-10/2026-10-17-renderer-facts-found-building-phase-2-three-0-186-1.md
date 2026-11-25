### 2026-10-17 - Renderer facts found building Phase 2 (three 0.186.1)

- `three` ships no type declarations and `@types/three` is not a dependency, so `js/app/three-shim.d.ts` declares `three` and
  `three/examples/jsm/*` as untyped modules and the tsconfig includes it.
- `three`'s objects (geometries, `InstancedMesh`, `ShaderMaterial`, `DataTexture`, `WebGLRenderTarget`) build in Node without a
  GL context, so layers are unit-tested there; only `scene.js` and `bloom.js` need a browser.
- Tone mapping applies only when drawing to the screen, never into a render target, so a shader that ends with
  `#include <tonemapping_fragment>` and `<colorspace_fragment>` is right on both paths: direct to the canvas (quality 2) and
  through the composer, where `OutputPass` does it. The renderer uses `NeutralToneMapping`, which keeps hue better than ACES.
- `UnrealBloomPass` blends five mips with `bloomFactors` `[1, 0.8, 0.6, 0.4, 0.2]`; the widest mip is about 700 px at 1080p and
  turns a dense scene into a fog. `BLOOM.factors` weights them `[1, 0.7, 0.38, 0.12, 0.03]` with radius 0 and strength 0.32 so the
  black stays black.
- `Float32BufferAttribute(array)` copies its array; use `BufferAttribute(array)` to keep writing into a preallocated one.
- `half` is a reserved word in GLSL ES 3.00; a variable called `half` fails to compile.
- Headless Chromium renders WebGL2 with `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`; a 4K frame of 420
  agents, haze and bloom takes a few seconds in software.
