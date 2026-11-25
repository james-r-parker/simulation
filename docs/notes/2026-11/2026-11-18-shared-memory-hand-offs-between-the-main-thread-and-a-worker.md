### 2026-11-18 - Shared-memory hand-offs between the main thread and a worker

- A request block that mixes `Int32` words and `Float64` fields cannot be written atomically as a whole: the pack worker could read a request half old and half new. A sequence lock fixes it: the writer stores `BEGIN`, writes the fields, then stores the sequence and notifies; the reader copies the fields and keeps them only when `BEGIN` still equals the sequence it started from (`readRequest` in `js/app/pack/frame-slots.js`).
- A worker blocked in `Atomics.wait` takes no messages, and a stop flag set between the worker's check and its wait is missed until the next notify; a finite timeout (250 ms) bounds that.
- `worker.terminate()` returns before the worker's last writes to shared memory are done: a worker caught mid-pack can store its ring hold after the main thread released it. Release after `terminate()`, and again before the next worker starts.
- `typed.set(other.subarray(a, b))` creates a view object per call; a per-frame copy of rows in a loop allocates nothing.
- Three output slots with a published index and a reading index are enough for one writer and one reader: the writer claims the slot that is neither, and the reader re-checks the published index after marking its slot read.
