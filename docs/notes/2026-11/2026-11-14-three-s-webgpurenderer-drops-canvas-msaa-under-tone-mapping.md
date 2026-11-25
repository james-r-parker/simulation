### 2026-11-14 - three's WebGPURenderer drops canvas MSAA under tone mapping or a colour-space conversion (crisp-renderer)

three 0.187's `Renderer` draws through an internal framebuffer target whenever `toneMapping` is not `NoToneMapping` or
the output colour space differs from `ColorManagement.workingColorSpace` (`needsFrameBufferTarget`), and then
`currentSamples` is 0 on the canvas plus one full-screen pass. The crisp stage sets `NoToneMapping`,
`outputColorSpace = LinearSRGBColorSpace` and `ColorManagement.enabled = false`, and writes display values straight to
the canvas, so 4x MSAA stays on the canvas with no extra pass.
