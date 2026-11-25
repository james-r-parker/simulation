### 2026-10-23 - A heap-delta allocation test needs a collection before each window and the smallest of several

`process.memoryUsage().heapUsed` over a window of calls also counts V8 tiering the loop up (OSR, a concurrent TurboFan job
landing) inside the window: up to about 1 MB, more often when the machine is loaded, which made `interpolateInto`'s test flaky
in the full gate and CI. Single windows of 5000 calls read 0 to 23 KB in a full fast-suite run. A computed double passed to a
call that is not inlined is boxed by the caller, 16 bytes a call, so `f((i % 10) / 10)` reads as allocation in `f`; pass
literals, or Smis. The reliable shape (`test/app/interpolate.test.js`): `gc()` through `v8.setFlagsFromString('--expose-gc')`
and `vm.runInNewContext('gc')` before each window, no `gc()` after (so short-lived garbage counts, not only retained memory),
the smallest growth of ten windows, and a limit under one small object a call.
