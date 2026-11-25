### 2026-10-30 - Dither the aurora in linear light, and declare no attribute `ShaderMaterial` adds

The aurora is dim (at most `AURORA_MAX_LUMINANCE` 0.010 linear, about 28 of 255 encoded), so its smooth gradients cover only a few dozen 8-bit steps and the encode in `OutputPass` can show them as contours. The upsample therefore adds interleaved gradient noise (`finish-glsl.js`) scaled to one sRGB step at that value, in linear light. Banding was judged by eye in screenshots only; no banding metric has been measured.

A `ShaderMaterial` prepends `attribute vec3 position` (and `uv`, `normal`) to its vertex shader, so a shader that declares `position` again fails to link: the program is dropped with a `console.error` and the layer draws nothing. The unit tests build no GL context and did not see this; `test/app/renderer/shader-sources.test.js` scans every layer's vertex shader for it and the browser spec loads quality 0, where those layers draw.
