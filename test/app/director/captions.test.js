import { describe, expect, it } from 'vitest';
import { captionFor } from '../../../js/app/director/captions.js';
import { MOMENT_KIND } from '../../../js/app/director/scoring.js';

describe('captionFor', () => {
    it('formats every moment kind in the design table', () => {
        expect(captionFor({ kind: MOMENT_KIND.CHASE, hunterSpec: 'predator', preySpec: 'forager' })).toBe(
            'Chase - predator after forager',
        );
        expect(captionFor({ kind: MOMENT_KIND.CHASE })).toBe('Chase - predator after forager');
        expect(captionFor({ kind: MOMENT_KIND.PACK_KILL })).toBe('Pack kill');
        expect(captionFor({ kind: MOMENT_KIND.KILL })).toBe('Kill');
        expect(captionFor({ kind: MOMENT_KIND.ESCAPE })).toBe('Escape');
        expect(captionFor({ kind: MOMENT_KIND.SMOKE_ESCAPE })).toBe('Smoke escape');
        expect(captionFor({ kind: MOMENT_KIND.SMOKE_SCREEN })).toBe('Smoke screen');
        expect(captionFor({ kind: MOMENT_KIND.ALARM_CHORUS })).toBe('Alarm chorus');
        expect(captionFor({ kind: MOMENT_KIND.BIRTH_CLUSTER, count: 6 })).toBe('Birth cluster of 6');
        expect(captionFor({ kind: MOMENT_KIND.BIRTH_CLUSTER })).toBe('Birth cluster of 6');
        expect(captionFor({ kind: MOMENT_KIND.FAMILY_LEAD, family: 'Velari' })).toBe('Velari takes the lead');
        expect(captionFor({ kind: MOMENT_KIND.EXTINCT, family: 'Velari' })).toBe('Velari has died out');
        expect(captionFor({ kind: MOMENT_KIND.LAST_STAND, family: 'Velari' })).toBe('Last stand of Velari');
        expect(captionFor({ kind: MOMENT_KIND.FIRST, tickerKind: 'first-pack-kill' })).toBe('First pack kill');
        expect(captionFor({ kind: MOMENT_KIND.FIRST, tickerKind: 'record-streak' })).toBe('Record hunt streak');
        expect(captionFor({ kind: MOMENT_KIND.FIRST, tickerKind: 'record-age' })).toBe('Oldest blob yet');
        expect(captionFor({ kind: MOMENT_KIND.FIRST })).toBe('First pack kill');
    });

    it('derives the family name from seed and lineageId when family is not pre-filled, and returns empty for unknown', () => {
        const lead = captionFor({ kind: MOMENT_KIND.FAMILY_LEAD, lineageId: 4 }, { seed: 3, top: [{ id: 4 }] });
        expect(lead).toMatch(/^[A-Z][a-z]+ takes the lead$/);
        const fallback = captionFor({ kind: MOMENT_KIND.EXTINCT });
        expect(fallback).toMatch(/^[A-Z][a-z]+ has died out$/);
        expect(captionFor({ kind: 'unknown' })).toBe('');
    });
});
