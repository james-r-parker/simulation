### 2026-11-14 - WebGPU binds one vertex buffer per attribute, and allows 8 (crisp-renderer)

three's WebGPU backend makes one GPU vertex buffer per `BufferAttribute` (attributes of one `InterleavedBuffer` share
one), and a WebGPU device allows 8 vertex buffers per pipeline by default. The agent meshes read the quad position and
nine instance vec4s, ten buffers, so their pipelines failed on WebGPU (phones, desktop Chrome) and only the agents
vanished, while the WebGL2 fallback (16 attributes) drew them and every local check passed. `createInstances` now
interleaves a mesh's instance attributes into one `InstancedInterleavedBuffer` (two buffers per mesh), and a test
asserts the agent meshes stay within 8.
