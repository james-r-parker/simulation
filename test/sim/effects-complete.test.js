// reads: js/sim/*.js
// A within-life rule left outside the registry fails here (docs/designs/status-effects.md, Phase 1 T7): the functions the
// Phase 1 table deletes are gone, and the readers that used to hold those rules hold no condition of their own beyond the
// rules of the "Not effects" table.

import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const SIM = new URL('../../js/sim/', import.meta.url);

/** The files of `js/sim/`, name to source. */
const SOURCES = Object.fromEntries(
    readdirSync(SIM)
        .filter((name) => name.endsWith('.js'))
        .map((name) => [name, readFileSync(new URL(name, SIM), 'utf8')]),
);

/**
 * @param {string} file a file of `js/sim/`
 * @param {string} name a function declared in it
 * @returns {string} the function's source without its line comments, from its declaration to the closing brace at the margin
 */
function bodyOf(file, name) {
    const source = SOURCES[file];
    const start = source.search(new RegExp(`function ${name}\\(`));
    expect(start, `${name} in ${file}`).toBeGreaterThanOrEqual(0);
    return source.slice(start, source.indexOf('\n}\n', start) + 2).replace(/\/\/.*$/gm, '');
}

describe('the rules the registry replaced', () => {
    it.each([
        'fatFactor',
        'grazeFactor',
        'thrustEfficiency',
        'passiveMultiplier',
        'blocksMating',
        'juvenileBurnOf',
        'storeFactor',
        'isSick',
        'alarmShare',
    ])('leaves no %s in the sim', (name) => {
        const holders = Object.entries(SOURCES)
            .filter(([, source]) => new RegExp(`\\b${name}\\b`).test(source))
            .map(([file]) => file);
        expect(holders).toEqual([]);
    });
});

describe('the readers of the registry', () => {
    it('keep no effect condition in thrustOf: no temperature, fat, graze, handling or sickness term', () => {
        const body = bodyOf('physics.js', 'thrustFrom');
        for (const term of ['temperature', 'dose', 'ateTimer', 'handling', 'graze', 'BITE', 'fat', 'isSick']) {
            expect(body, term).not.toContain(term);
        }
        expect(body).toContain('liveIn(world, i, MOTION, MAX_THRUST_LANE)');
        expect(bodyOf('physics.js', 'thrustOf')).toContain('motionFactors(world, i)');
    });

    it('keep no effect condition in tickCost: no temperature band, juvenile or ramp term', () => {
        const body = bodyOf('energy.js', 'tickCost');
        for (const term of ['temperature', 'juvenile', 'ageTicks', 'burn', 'Ramp']) {
            expect(body, term).not.toContain(term);
        }
        expect(body).toContain('costFactors(world, slot)');
        expect(body).toContain('liveIn(world, slot, COST, PASSIVE_LOSS_LANE)');
    });

    it('make canEatNow the eat gate and nothing more', () => {
        expect(bodyOf('feeding.js', 'canEatNow').replace(/\s+/g, ' ')).toBe(
            'function canEatNow(world, slot) { return gateOpen(world, slot, GATE.EAT); }',
        );
    });

    it('hold the mate, split and call tests as gates, with only the rules of the "Not effects" table beside them', () => {
        const mate = bodyOf('mate-eligibility.js', 'isReadyToMate');
        const split = bodyOf('reproduction.js', 'readyBeforeGate');
        for (const body of [mate, split]) {
            for (const term of ['ageTicks', 'pregnancy', 'cooldown', 'maturityTicks', 'blocks']) {
                expect(body, term).not.toContain(term);
            }
        }
        expect(mate).toContain('GATE.MATE');
        expect(split).toContain('GATE.SPLIT');
        for (const [name, gate, timer] of [
            ['alarm', 'GATE.ALARM', 'alarmTimer'],
            ['huntCall', 'GATE.HUNT', 'huntTimer'],
            ['smoke', 'GATE.SMOKE', 'smokeTimer'],
        ]) {
            const body = bodyOf('calls.js', name);
            expect(body, name).toContain(gate);
            expect(body.replace(new RegExp(`world\\.${timer}\\[slot\\] = `, 'g'), ''), name).not.toContain(timer);
        }
    });
});
