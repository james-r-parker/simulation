import { forwardAll } from '../../js/sim/brain.js';
import { microSuite, microWorld } from './fixture.js';

const plain = microWorld();
const learning = microWorld({ hebbianRate: 0.00001 });

microSuite('brain', [
    ['forwardAll, 500 agents, defaults', () => forwardAll(plain)],
    ['forwardAll, 500 agents, hebbianRate 0.00001', () => forwardAll(learning)],
]);
