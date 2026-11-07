// The det-math exports (wasm/src/det_math.rs): the batch tanh the brain kernel uses and the scalar exports, each on
// 1024 seeded values in [-4, 4). `tanh_into` works in place, so each run refills its buffer first; both trees pay the
// same copy.
import { microSuite, seededValues } from './fixture.js';
import { standaloneKernels } from './wasm-fixture.js';

const COUNT = 1024;
const src = seededValues('tanh-in', COUNT, -4, 4);
const { exports, memory, heap } = standaloneKernels();
const buffer = new Float64Array(memory.buffer, heap, COUNT);

/**
 * @param {(x: number) => number} fn a scalar export
 * @returns {() => number} the sum of `fn` over the seeded values
 */
function scalarLoop(fn) {
    return () => {
        let sum = 0;
        for (let i = 0; i < COUNT; i++) {
            sum += fn(src[i]);
        }
        return sum;
    };
}

microSuite('wasm-math', [
    [
        `tanh_into x ${COUNT} (with the refill)`,
        () => {
            buffer.set(src);
            return exports.tanh_into(heap, COUNT);
        },
    ],
    [`tanh_f64 x ${COUNT} calls`, scalarLoop(exports.tanh_f64)],
    [`exp_f64 x ${COUNT} calls`, scalarLoop(exports.exp_f64)],
    [`sigmoid_f64 x ${COUNT} calls`, scalarLoop(exports.sigmoid_f64)],
]);
