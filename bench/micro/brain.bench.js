import { forwardAll } from '../../js/sim/brain.js';
import { microSuite, microWorld } from './fixture.js';

const plain = microWorld();
const leaky = microWorld({ leakEnabled: true });
const learning = microWorld({ leakEnabled: true, hebbianRate: 0.05 });

microSuite('brain', [
    ['forwardAll, 500 agents, defaults', () => forwardAll(plain)],
    ['forwardAll, 500 agents, leakEnabled', () => forwardAll(leaky)],
    ['forwardAll, 500 agents, leakEnabled + hebbianRate 0.05', () => forwardAll(learning)],
]);
