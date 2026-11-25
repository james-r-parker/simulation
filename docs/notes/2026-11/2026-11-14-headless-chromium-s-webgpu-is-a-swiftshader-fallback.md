### 2026-11-14 - Headless Chromium's WebGPU is a SwiftShader fallback adapter that cannot present (crisp-renderer)

Headless Chromium (Playwright's build, with or without `--enable-unsafe-webgpu`) reports a WebGPU adapter with
`info.isFallbackAdapter` true (`vendor: google`, `architecture: swiftshader`). `renderer.init()` succeeds, but the canvas
screenshots blank and `readRenderTargetPixelsAsync` fails with "A valid external Instance reference no longer exists".
The stage's `chooseBackend` takes WebGL2 on a fallback adapter, so the smoke tests draw; `?backend=webgpu` still forces
it.
