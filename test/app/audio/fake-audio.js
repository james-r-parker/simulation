// Minimal Web Audio stand-in for testing `engine.js` and `audio.js` in Node.

/**
 * @param {number} initial starting value
 * @returns {{value: number, sets: number[][], ramps: number[][], setValueAtTime: (v: number, t: number) => void,
 *   linearRampToValueAtTime: (v: number, t: number) => void}} fake `AudioParam`
 */
function fakeParam(initial = 0) {
    const param = {
        value: initial,
        sets: /** @type {number[][]} */ ([]),
        ramps: /** @type {number[][]} */ ([]),
        setValueAtTime(/** @type {number} */ v, /** @type {number} */ t) {
            param.value = v;
            param.sets.push([v, t]);
        },
        linearRampToValueAtTime(/** @type {number} */ v, /** @type {number} */ t) {
            param.value = v;
            param.ramps.push([v, t]);
        },
    };
    return param;
}

/** Stand-in for `AudioContext`. */
export class FakeAudioContext {
    static instances = /** @type {FakeAudioContext[]} */ ([]);

    constructor() {
        this.currentTime = 1;
        this.destination = {};
        this.resumed = 0;
        this.suspended = 0;
        this.gains = /** @type {any[]} */ ([]);
        this.oscillators = /** @type {any[]} */ ([]);
        this.filters = /** @type {any[]} */ ([]);
        this.panners = /** @type {any[]} */ ([]);
        FakeAudioContext.instances.push(this);
    }

    createGain() {
        const node = { gain: fakeParam(1), connect() {} };
        this.gains.push(node);
        return node;
    }

    createDynamicsCompressor() {
        return { connect() {} };
    }

    createBiquadFilter() {
        const node = { type: 'lowpass', frequency: fakeParam(350), connect() {} };
        this.filters.push(node);
        return node;
    }

    createOscillator() {
        const node = {
            type: 'sine',
            frequency: fakeParam(440),
            detune: fakeParam(0),
            connect() {},
            start() {},
            stop() {},
        };
        this.oscillators.push(node);
        return node;
    }

    createStereoPanner() {
        const node = { pan: fakeParam(0), connect() {} };
        this.panners.push(node);
        return node;
    }

    resume() {
        this.resumed += 1;
        return Promise.resolve();
    }

    suspend() {
        this.suspended += 1;
        return Promise.resolve();
    }
}
