import { describe, expect, it } from 'vitest';
import {
    applyRepeatPenalty,
    EFFECT_BITS,
    MOMENT_KIND,
    MOMENT_THRESHOLD,
    scoreAlarmChorus,
    scoreBirthCluster,
    scoreChase,
    scoreEffect,
    scoreTickerItem,
} from '../../../js/app/director/scoring.js';

const KINDS = { BORN: 1, DIED: 2, BITE: 3, ALARM: 4, PACK_CALL: 5, SMOKE: 6, ESCAPED: 7 };
const EATEN = 2;

describe('scoreChase', () => {
    it('scores a chase from sprinting flags and distance and returns 0 outside range', () => {
        expect(scoreChase({ distance: 0, hunterSpeed: 2, preySpeed: 2, maxVelocity: 1 })).toBe(0);
        expect(scoreChase({ distance: 401, hunterSpeed: 2, preySpeed: 2, maxVelocity: 1 })).toBe(0);
        expect(scoreChase({ distance: 200, hunterSpeed: 1.2, preySpeed: 1.2, maxVelocity: 1 })).toBeCloseTo(
            40 + 30 + 20 + 5,
        );
        expect(scoreChase({ distance: 400, hunterSpeed: 0.5, preySpeed: 0.5, maxVelocity: 1 })).toBeCloseTo(40);
    });
});

describe('scoreEffect', () => {
    it('scores deliberate pack-kill, deliberate kill and chance kill (below 45)', () => {
        const eatenWord = EATEN << EFFECT_BITS.CAUSE_SHIFT;
        const packKill = scoreEffect(
            { kind: KINDS.DIED, c: eatenWord | EFFECT_BITS.DIED_PACK | EFFECT_BITS.DIED_DELIBERATE },
            { ageS: 1, kinds: KINDS, eatenCause: EATEN },
        );
        expect(packKill).toEqual({ kind: MOMENT_KIND.PACK_KILL, score: 90 * 0.75 });

        const deliberateKill = scoreEffect(
            { kind: KINDS.DIED, c: eatenWord | EFFECT_BITS.DIED_DELIBERATE },
            { ageS: 2, kinds: KINDS, eatenCause: EATEN },
        );
        expect(deliberateKill).toEqual({ kind: MOMENT_KIND.KILL, score: 80 * 0.5 });

        const chanceKill = scoreEffect(
            { kind: KINDS.DIED, c: eatenWord | EFFECT_BITS.DIED_PACK },
            { ageS: 0, kinds: KINDS, eatenCause: EATEN },
        );
        expect(chanceKill).toEqual({ kind: MOMENT_KIND.KILL, score: 30 });
        expect(chanceKill?.score).toBeLessThan(MOMENT_THRESHOLD);

        expect(scoreEffect({ kind: KINDS.DIED, c: 0 }, { ageS: 0, kinds: KINDS, eatenCause: EATEN })).toBeNull();
        expect(
            scoreEffect({ kind: KINDS.DIED, c: eatenWord }, { ageS: 4, kinds: KINDS, eatenCause: EATEN }),
        ).toBeNull();
        expect(
            scoreEffect({ kind: KINDS.DIED, c: eatenWord }, { ageS: -1, kinds: KINDS, eatenCause: EATEN }),
        ).toBeNull();
    });

    it('scores responded escape, smoke-escape and was-bitten smoke-screen', () => {
        const { ESCAPED, ...kindsWithoutEscaped } = KINDS;
        void ESCAPED;
        const esc = scoreEffect(
            { kind: 7, c: EFFECT_BITS.ESCAPED_RESPONDED },
            { ageS: 2.5, kinds: kindsWithoutEscaped, eatenCause: EATEN },
        );
        expect(esc).toEqual({ kind: MOMENT_KIND.ESCAPE, score: 65 * 0.5 });

        const smokeEsc = scoreEffect(
            { kind: KINDS.ESCAPED, c: EFFECT_BITS.ESCAPED_RESPONDED | EFFECT_BITS.ESCAPED_SMOKE },
            { ageS: 0, kinds: KINDS, eatenCause: EATEN },
        );
        expect(smokeEsc).toEqual({ kind: MOMENT_KIND.SMOKE_ESCAPE, score: 85 });

        expect(scoreEffect({ kind: KINDS.ESCAPED, c: 0 }, { ageS: 0, kinds: KINDS, eatenCause: EATEN })).toBeNull();
        expect(
            scoreEffect(
                { kind: KINDS.ESCAPED, c: EFFECT_BITS.ESCAPED_RESPONDED },
                { ageS: 5, kinds: KINDS, eatenCause: EATEN },
            ),
        ).toBeNull();

        const smoke = scoreEffect(
            { kind: KINDS.SMOKE, c: EFFECT_BITS.SMOKE_BITTEN },
            { ageS: 1, kinds: KINDS, eatenCause: EATEN },
        );
        expect(smoke).toEqual({ kind: MOMENT_KIND.SMOKE_SCREEN, score: 55 * 0.8 });
        expect(scoreEffect({ kind: KINDS.SMOKE, c: 0 }, { ageS: 1, kinds: KINDS, eatenCause: EATEN })).toBeNull();
        expect(scoreEffect({ kind: KINDS.BORN, c: 0 }, { ageS: 0, kinds: KINDS, eatenCause: EATEN })).toBeNull();
    });
});

describe('clusters, ticker items and repeat penalty', () => {
    it('scores alarm-chorus and birth-cluster with their caps', () => {
        expect([scoreAlarmChorus(2), scoreAlarmChorus(3), scoreAlarmChorus(10)]).toEqual([0, 65, 70]);
        expect([scoreBirthCluster(5), scoreBirthCluster(6), scoreBirthCluster(10)]).toEqual([0, 55, 55]);
    });

    it('scores ticker items within 10 s and ignores older or other kinds', () => {
        expect(scoreTickerItem({ kind: 'new-leader' }, 5)).toEqual({ kind: MOMENT_KIND.FAMILY_LEAD, score: 60 });
        expect(scoreTickerItem({ kind: 'extinct' }, 10)).toEqual({ kind: MOMENT_KIND.EXTINCT, score: 75 });
        expect(scoreTickerItem({ kind: 'last-stand' }, 0)).toEqual({ kind: MOMENT_KIND.LAST_STAND, score: 70 });
        expect(scoreTickerItem({ kind: 'first-pack-kill' }, 2)).toEqual({ kind: MOMENT_KIND.FIRST, score: 90 });
        expect(scoreTickerItem({ kind: 'record-streak' }, 2)).toEqual({ kind: MOMENT_KIND.FIRST, score: 90 });
        expect(scoreTickerItem({ kind: 'record-age' }, 2)).toEqual({ kind: MOMENT_KIND.FIRST, score: 90 });
        expect(scoreTickerItem({ kind: 'extinct' }, 10.1)).toBeNull();
        expect(scoreTickerItem({ kind: 'extinct' }, -0.1)).toBeNull();
        expect(scoreTickerItem({ kind: 'elder' }, 1)).toBeNull();
    });

    it('multiplies the score by 0.6 when the same kind was shown within 30 s', () => {
        expect(applyRepeatPenalty(80, MOMENT_KIND.KILL, undefined, 50)).toBe(80);
        expect(applyRepeatPenalty(80, MOMENT_KIND.KILL, { kill: 25 }, 50)).toBeCloseTo(48);
        expect(applyRepeatPenalty(80, MOMENT_KIND.KILL, { kill: 19 }, 50)).toBe(80);
    });
});
