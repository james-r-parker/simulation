// The director measured in Node (docs/designs/worker-and-renderer.md T50, docs/designs/ambient-display.md): runs the
// real sim host over a fake port and clock, feeds every snapshot, effect and ticker item to the real director on a
// simulated clock (decisions every 500 ms, time is ticks / 60), and reads four numbers off the shots it takes:
// `director.chase_precision`, `director.max_kind_share`, `director.shots_per_hour` and `director.min_shot_hold_s`. The director draws from its
// seeded prng, so a seed's shot list replays. A detector, never fitness.

import { createDirector } from '../../js/app/director/director.js';
import { MOMENT_KIND } from '../../js/app/director/scoring.js';
import { createRingViews, holdFrom, READER, RELEASED } from '../../js/worker/snapshot-ring.js';
import { createSimHost } from '../../js/worker/sim-host.js';

/**
 * The bars of ambient-display.md: chase precision at least, max kind share at most, shots per hour between (20 to 60
 * since Phase 7, a calm camera) and the shortest shot, its cut to its pullback, at least `minShotHoldS` seconds.
 */
export const BARS = Object.freeze({ chasePrecision: 0.6, maxKindShare: 0.4, shotsPerHour: [20, 60], minShotHoldS: 30 });

/** Ticks a second at x1. */
const TPS = 60;
/** Simulated seconds of effects the director is shown. */
const WINDOW_S = 10;
/** Ticks run per fake slice at the speed the dry run asks for. */
const SPEED = 480;

/**
 * @param {Uint32Array} u32 a snapshot's words
 * @param {Float32Array} f32 the same words as floats
 * @param {{effectsOffset: number, effectWords: number}} layout the snapshot layout
 * @returns {Record<string, number>[]} the effects the snapshot carries
 */
function decodeEffects(u32, f32, { effectsOffset, effectWords }) {
    const out = [];
    for (let i = 0; i < u32[effectsOffset]; i++) {
        const w = effectsOffset + 2 + i * effectWords;
        out.push({
            kind: u32[w],
            tick: u32[w + 1],
            x: f32[w + 2],
            y: f32[w + 3],
            a: u32[w + 4],
            b: u32[w + 5],
            c: u32[w + 6],
            d: u32[w + 7],
        });
    }
    return out;
}

/**
 * @typedef {object} OpenShot
 * @property {string} kind the moment kind
 * @property {number} hunterId a chase's hunter
 * @property {number} preyId a chase's prey
 * @property {boolean} resolved whether the pair had a bite, a death or an escape during the shot
 */

/**
 * Whether an effect is a bite, a death or an escape between the pair.
 * @param {Record<string, number>} e the effect
 * @param {OpenShot} shot the chase shot
 * @param {Record<string, number>} kinds `layout.effectKinds`
 * @returns {boolean} whether it resolves the pursuit
 */
function resolvesChase(e, shot, kinds) {
    if (e.kind === kinds.BITE) {
        return e.a === shot.hunterId && e.b === shot.preyId;
    }
    return (e.kind === kinds.DIED || e.kind === kinds.ESCAPED) && e.a === shot.preyId && e.b === shot.hunterId;
}

/**
 * @typedef {object} DryOptions
 * @property {number} seed the world seed
 * @property {number} ticks how long to run
 * @property {Record<string, any>} [overrides] config overrides
 * @property {(options: Record<string, any>) => Record<string, any>} createPolicy the policy factory
 * @property {string} [policyName] the registered policy to run
 */

/**
 * @typedef {object} DryResult
 * @property {number} seed the seed
 * @property {number} ticks the ticks run
 * @property {{tick: number, kind: string, score: number, resolved: boolean, holdS: number | null}[]} shots one per
 *   shot, in order; `holdS` is the seconds from its cut to its pullback, null for a shot the run ended in
 * @property {Record<string, number>} shares each kind's share of the shots
 * @property {number | null} chasePrecision chase shots that saw the pair bite, die or escape; null with no chase shot
 * @property {number} maxKindShare the largest share one kind holds
 * @property {number} shotsPerHour shots per simulated hour
 * @property {number | null} minShotHoldS the shortest `holdS` of the shots that ended; null when none did
 */

/**
 * @param {DryResult['shots']} list every shot
 * @param {{seed: number, ticks: number}} run the seed and the length
 * @returns {DryResult} the readings
 */
function summarise(list, { seed, ticks }) {
    /** @type {Record<string, number>} */
    const counts = {};
    for (const s of list) {
        counts[s.kind] = (counts[s.kind] ?? 0) + 1;
    }
    const shares = Object.fromEntries(Object.entries(counts).map(([k, n]) => [k, n / Math.max(list.length, 1)]));
    const chases = list.filter((s) => s.kind === MOMENT_KIND.CHASE);
    const holds = list.flatMap((s) => (s.holdS === null ? [] : [s.holdS]));
    return {
        seed,
        ticks,
        shots: list,
        shares,
        chasePrecision: chases.length === 0 ? null : chases.filter((s) => s.resolved).length / chases.length,
        maxKindShare: Math.max(0, ...Object.values(shares)),
        shotsPerHour: (list.length * 3600 * TPS) / ticks,
        minShotHoldS: holds.length === 0 ? null : Math.min(...holds),
    };
}

/**
 * Keeps the shot on screen and the shots taken: a shot opens at its glide, closes at its pullback, and a chase shot is
 * resolved when a bite, a death or an escape between its pair arrives while it is open.
 * @returns {{list: DryResult['shots'],
 *   noteEffects: (effects: Record<string, number>[], kinds: Record<string, number>) => void,
 *   noteStep: (out: Record<string, any>, tick: number) => void, close: () => void}} the tracker
 */
function createShotTracker() {
    const list = /** @type {DryResult['shots']} */ ([]);
    let open = /** @type {(OpenShot & {tick: number, score: number, endTick: number | null}) | null} */ (null);
    let last = /** @type {object | null} */ (null);
    const close = () => {
        if (open !== null) {
            const holdS = open.endTick === null ? null : (open.endTick - open.tick) / TPS;
            list.push({ tick: open.tick, kind: open.kind, score: open.score, resolved: open.resolved, holdS });
            open = null;
        }
    };
    return {
        list,
        close,
        noteEffects(effects, kinds) {
            for (const e of effects) {
                if (open !== null && resolvesChase(e, open, kinds)) {
                    open.resolved = true;
                }
            }
        },
        noteStep(out, tick) {
            if (out.shot === last) {
                return;
            }
            last = out.shot;
            if (out.state === 'glide' && out.shot?.moment) {
                close();
                const m = out.shot.moment;
                const score = Math.round(m.score * 10) / 10;
                open = {
                    tick,
                    kind: m.kind,
                    score,
                    hunterId: m.hunterId ?? -1,
                    preyId: m.preyId ?? -1,
                    resolved: false,
                    endTick: null,
                };
            } else if (out.state === 'pullback') {
                if (open !== null) {
                    open.endTick = tick;
                }
                close();
            }
        },
    };
}

/**
 * @typedef {object} MainThread the fake main thread's state
 * @property {Record<string, any> | null} ready the `ready` message
 * @property {Record<string, number>[]} effects the effects of the last ten seconds
 * @property {any[]} ticker the ticker items of the last ten seconds
 * @property {number} lastStep the simulated second of the director's last decision
 * @property {ReturnType<typeof createDirector> | null} director the director
 */

/**
 * Takes in a snapshot: its effects go to the shot tracker and the window, and every half second the director decides.
 * @param {MainThread} m the fake main thread
 * @param {{seed: number, tracker: ReturnType<typeof createShotTracker>}} parts the seed and the shots
 * @param {{u32: Uint32Array, f32: Float32Array}} view the snapshot's slot
 * @param {number} tick its tick
 * @returns {void}
 */
function onSnapshot(m, { seed, tracker }, view, tick) {
    const ready = /** @type {Record<string, any>} */ (m.ready);
    const fresh = decodeEffects(view.u32, view.f32, ready.layout);
    tracker.noteEffects(fresh, ready.layout.effectKinds);
    const keep = (/** @type {Record<string, any>} */ e) => tick - e.tick <= WINDOW_S * TPS;
    m.effects = [...m.effects, ...fresh].filter(keep);
    m.ticker = m.ticker.filter(keep);
    if (tick / TPS - m.lastStep < 0.5) {
        return;
    }
    m.lastStep = tick / TPS;
    const out = /** @type {any} */ (m.director).step({
        tick,
        dtMs: 500,
        snapshot: view,
        effects: m.effects,
        ticker: m.ticker,
        info: ready.info,
        layout: ready.layout,
        world: { seed, top: [] },
    });
    tracker.noteStep(out, tick);
}

/**
 * A world is ready: opens its ring and starts a director in TV mode over it.
 * @param {Record<string, any>} m the fake main thread
 * @param {number} seed the world seed
 * @param {Record<string, any>} ready the `ready` message
 * @returns {void}
 */
function beginWorld(m, seed, ready) {
    m.ready = ready;
    m.ring = createRingViews(ready.ring, ready.slotBytes);
    m.director = createDirector({
        seed,
        canvas: { width: 3840, height: 2160 },
        world: { width: ready.info.worldWidth, height: ready.info.worldHeight },
        log: () => {},
    });
    m.director.startNow();
}

/**
 * The fake main thread: owns the clock, the ring and what the host posted, and runs the director on each snapshot.
 * @param {number} seed the world seed
 * @param {ReturnType<typeof createShotTracker>} tracker the shots
 * @returns {{post: (message: Record<string, any>) => void, clock: () => number, ticks: () => number,
 *   timer: () => (() => void) | null, schedule: (delay: number, fn: () => void) => void,
 *   bind: (host: {receive: (message: any) => void}) => void}} the fake port, clock and scheduler
 */
function createMainThread(seed, tracker) {
    const m = {
        clock: 0,
        timer: /** @type {null | (() => void)} */ (null),
        ready: /** @type {Record<string, any> | null} */ (null),
        ring: /** @type {any} */ (null),
        effects: /** @type {Record<string, number>[]} */ ([]),
        ticker: /** @type {any[]} */ ([]),
        tick: 0,
        lastStep: -Infinity,
        director: /** @type {ReturnType<typeof createDirector> | null} */ (null),
        host: /** @type {{receive: (message: any) => void} | null} */ (null),
    };
    return {
        clock: () => m.clock,
        ticks: () => m.tick,
        timer() {
            const fn = m.timer;
            m.timer = null;
            return fn;
        },
        schedule(delay, fn) {
            m.clock += Math.max(delay, 1);
            m.timer = fn;
        },
        bind: (host) => (m.host = host),
        post(message) {
            if (message.type === 'ready') {
                beginWorld(m, seed, message);
            } else if (message.type === 'snapshot') {
                m.tick = message.tick;
                onSnapshot(m, { seed, tracker }, m.ring.slots[message.slot], message.tick);
                holdFrom(m.ring, READER.MAIN, RELEASED);
            } else if (message.type === 'ticker') {
                m.ticker.push(...message.items);
            } else if (message.type === 'field') {
                m.host?.receive({
                    type: 'returnBuffer',
                    pool: 'field',
                    buffer: new ArrayBuffer(message.buffer.byteLength),
                });
            }
        },
    };
}

/**
 * Runs one seed.
 * @param {DryOptions} options the world and how long to run it
 * @returns {DryResult} the shots and the three readings
 */
export function runDirectorDry({ seed, ticks, overrides = {}, createPolicy, policyName }) {
    const tracker = createShotTracker();
    const main = createMainThread(seed, tracker);
    const host = createSimHost({ post: main.post, now: main.clock, schedule: main.schedule, createPolicy });
    main.bind(host);
    host.receive({
        type: 'init',
        seed,
        config: overrides,
        ...(policyName === undefined ? {} : { policy: policyName }),
    });
    host.receive({ type: 'setSpeed', ticksPerSecond: SPEED });
    while (main.ticks() < ticks) {
        const fn = main.timer();
        if (fn === null) {
            throw new Error(`director-dry: the host stopped scheduling at tick ${main.ticks()}`);
        }
        fn();
    }
    tracker.close();
    return summarise(tracker.list, { seed, ticks });
}

/**
 * @param {DryResult} r one seed's result
 * @returns {{chasePrecision: boolean | null, maxKindShare: boolean, shotsPerHour: boolean,
 *   minShotHoldS: boolean | null}} whether each reading meets its bar; null when it has no reading
 */
export function meetsBars(r) {
    const [low, high] = BARS.shotsPerHour;
    return {
        chasePrecision: r.chasePrecision === null ? null : r.chasePrecision >= BARS.chasePrecision,
        maxKindShare: r.maxKindShare <= BARS.maxKindShare,
        shotsPerHour: r.shotsPerHour >= low && r.shotsPerHour <= high,
        minShotHoldS: r.minShotHoldS === null ? null : r.minShotHoldS >= BARS.minShotHoldS - 1e-9,
    };
}
