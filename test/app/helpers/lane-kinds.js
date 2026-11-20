import { createLanes } from '../../../js/app/lanes.js';

/**
 * The two ways the per-slot stores are built: plain arrays, and views over one SharedArrayBuffer (the pack worker's).
 * For `describe.each`: each entry is `[name, makeAllocator]`; `makeAllocator()` returns the allocator argument
 * (undefined for the default plain lanes).
 * @type {[string, () => import('../../../js/app/lanes.js').LaneAllocator | undefined][]}
 */
export const LANE_KINDS = [
    ['plain', () => undefined],
    ['shared', () => createLanes(new SharedArrayBuffer(1 << 20)).alloc],
];
