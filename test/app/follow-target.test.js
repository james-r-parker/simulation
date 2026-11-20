import { describe, expect, it } from 'vitest';
import { createFollowInterest, noteFollowInterest, pickFollowAgent } from '../../js/app/follow-target.js';
import { createInterpolated } from '../../js/app/interpolate.js';
import { createPursuits } from '../../js/app/pursuit.js';
import { EFFECT_BITS } from '../../js/app/director/scoring.js';

const CTX = { kinds: { DIED: 2, SMOKE: 6, BORN: 1, MATED: 3, ESCAPED: 7 }, eatenCause: 1, nowMs: 1000 };

/** @returns {{agents: any, player: any, context: any}} living subjects and a renderer context */
function setup() {
    const agents = createInterpolated(3);
    agents.count = 3;
    agents.genomeId.set([30, 20, 10]);
    agents.x.set([100, 200, 300]);
    const player = {
        followInterest: createFollowInterest(),
        flee: { pursuits: createPursuits() },
        bits: { PREGNANT: 8192 },
    };
    return { agents, player, context: { player, nowMs: 1000, x: 0, y: 0 } };
}

/** @param {number} kind @param {number} a @param {number} b @param {number} c @returns {any} a scored effect */
function effect(kind, a, b = 0, c = 0) {
    return { kind, tick: 1, x: 0, y: 0, a, b, c, d: 0 };
}

describe('follow subjects', () => {
    it('chooses a living fallback, and returns zero for an empty population', () => {
        const { agents, context } = setup();
        context.player = null;
        expect(pickFollowAgent(agents, context)).toBe(30);
        agents.count = 0;
        expect(pickFollowAgent(agents, context)).toBe(0);
    });

    it('prefers a pursuit over pregnancy, movement and nearby quiet agents', () => {
        const { agents, player, context } = setup();
        agents.flags[0] = player.bits.PREGNANT;
        agents.speed[0] = 4;
        const p = player.flee.pursuits;
        p.count = 1;
        p.hunter[0] = 1;
        p.prey[0] = 2;
        p.closeness[0] = 0.5;
        expect(pickFollowAgent(agents, context)).toBe(20);
        p.hunter[0] = 2;
        p.prey[0] = 1;
        expect(pickFollowAgent(agents, context)).toBe(20);
    });

    it('follows a surviving killer, never its dead victim or a reused slot', () => {
        const { agents, player, context } = setup();
        noteFollowInterest(player.followInterest, effect(2, 999, 10, (1 << 8) | EFFECT_BITS.DIED_DELIBERATE), CTX);
        expect(pickFollowAgent(agents, context)).toBe(10);
        agents.genomeId[2] = 100;
        expect(pickFollowAgent(agents, context)).toBe(30);
    });

    it('scores escapes and smoke on the living victim or emitter', () => {
        const { agents, player, context } = setup();
        noteFollowInterest(player.followInterest, effect(7, 10, 30, EFFECT_BITS.ESCAPED_RESPONDED), CTX);
        expect(pickFollowAgent(agents, context)).toBe(10);
        player.followInterest = createFollowInterest();
        noteFollowInterest(player.followInterest, effect(6, 20, 30, EFFECT_BITS.SMOKE_BITTEN), CTX);
        expect(pickFollowAgent(agents, context)).toBe(20);
    });

    it('remembers births without treating a lineage as a participant, and both mates', () => {
        const { agents, player, context } = setup();
        noteFollowInterest(player.followInterest, effect(1, 10, 30), CTX);
        expect(pickFollowAgent(agents, context)).toBe(10);
        player.followInterest = createFollowInterest();
        noteFollowInterest(player.followInterest, effect(3, 10, 20), CTX);
        expect(pickFollowAgent(agents, context)).toBe(20);
    });

    it('ignores stale, future and uninteresting effects', () => {
        const { agents, player, context } = setup();
        noteFollowInterest(player.followInterest, effect(100, 10), CTX);
        expect(player.followInterest.count).toBe(0);
        noteFollowInterest(player.followInterest, effect(1, 10), CTX);
        context.nowMs = 6000;
        expect(pickFollowAgent(agents, context)).toBe(30);
        context.nowMs = 999;
        expect(pickFollowAgent(agents, context)).toBe(30);
        context.nowMs = 3000;
        expect(pickFollowAgent(agents, context)).toBe(10);
    });

    it('uses pregnancy, then movement when there is no stronger scene', () => {
        const { agents, player, context } = setup();
        agents.x.set([1000, 1000, 1000]);
        agents.speed[1] = 1;
        expect(pickFollowAgent(agents, context)).toBe(20);
        agents.flags[2] = player.bits.PREGNANT;
        expect(pickFollowAgent(agents, context)).toBe(10);
    });

    it('prefers local continuity only between comparably interesting subjects', () => {
        const { agents, player, context } = setup();
        noteFollowInterest(player.followInterest, effect(1, 30), CTX);
        noteFollowInterest(player.followInterest, effect(1, 10), CTX);
        expect(pickFollowAgent(agents, context)).toBe(30);
        noteFollowInterest(player.followInterest, effect(2, 999, 10, (1 << 8) | EFFECT_BITS.DIED_DELIBERATE), CTX);
        expect(pickFollowAgent(agents, context)).toBe(10);
    });

    it('breaks ties by distance then stable genome id, independently of array order', () => {
        const { agents, context } = setup();
        agents.x.set([1000, 1000, 1000]);
        expect(pickFollowAgent(agents, context)).toBe(10);
        agents.genomeId.set([10, 30, 20]);
        expect(pickFollowAgent(agents, context)).toBe(10);
        agents.x[2] = 700;
        expect(pickFollowAgent(agents, context)).toBe(20);
    });

    it('overwrites a bounded ring while retaining its allocated arrays', () => {
        const { player } = setup();
        const memory = player.followInterest;
        const subject = memory.subject;
        for (let i = 0; i < 40; i++) {
            noteFollowInterest(memory, effect(1, i + 1), CTX);
        }
        expect(memory.count).toBe(32);
        expect(memory.subject).toBe(subject);
        expect(Array.from(subject)).not.toContain(1);
    });
});
