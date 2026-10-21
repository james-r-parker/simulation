import { detSigmoid, detTanh, detTanhInto } from '../../js/sim/det-math.js';
import { microSuite, seededValues } from './fixture.js';

const COUNT = 1024;
const src = seededValues('tanh-in', COUNT, -4, 4);
const dst = new Float64Array(COUNT);

microSuite('det-math', [
    [
        `detTanhInto x ${COUNT}`,
        () => {
            detTanhInto(src, dst, 0, COUNT);
        },
    ],
    [
        `detTanh scalar x ${COUNT}`,
        () => {
            let sum = 0;
            for (let i = 0; i < COUNT; i++) {
                sum += detTanh(src[i]);
            }
            return sum;
        },
    ],
    [
        `detSigmoid x ${COUNT}`,
        () => {
            let sum = 0;
            for (let i = 0; i < COUNT; i++) {
                sum += detSigmoid(src[i]);
            }
            return sum;
        },
    ],
]);
