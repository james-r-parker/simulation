import { describe, expect, it } from 'vitest';
import {
    COVERAGE_TIMEOUT_FACTOR,
    COVERAGE_TIMEOUT_MS,
    DEFAULT_TIMEOUT_MS,
    scaleTimeout,
    testTimeoutFor,
    timeoutFactorFor,
} from '../scripts/lib/test-timeout.mjs';

describe('testTimeoutFor', () => {
    it('keeps Vitest default of 5000 ms without coverage', () => {
        expect(testTimeoutFor(['node', 'vitest', 'run'])).toBe(DEFAULT_TIMEOUT_MS);
        expect(DEFAULT_TIMEOUT_MS).toBe(5000);
    });

    it('gives 20000 ms when --coverage is among the arguments', () => {
        expect(testTimeoutFor(['node', 'vitest', 'run', '--coverage'])).toBe(COVERAGE_TIMEOUT_MS);
        expect(COVERAGE_TIMEOUT_MS).toBe(20000);
    });

    it('also reads the --coverage.enabled form', () => {
        expect(testTimeoutFor(['vitest', '--coverage.enabled'])).toBe(COVERAGE_TIMEOUT_MS);
    });

    it('does not treat --coverage=false as coverage', () => {
        expect(testTimeoutFor(['vitest', '--coverage=false'])).toBe(DEFAULT_TIMEOUT_MS);
        expect(testTimeoutFor(['vitest', '--coverage.enabled=false'])).toBe(DEFAULT_TIMEOUT_MS);
    });
});

describe('timeoutFactorFor', () => {
    it('is 1 without coverage and the coverage factor with it', () => {
        expect(timeoutFactorFor(['vitest', 'run'])).toBe(1);
        expect(timeoutFactorFor(['vitest', 'run', '--coverage'])).toBe(COVERAGE_TIMEOUT_FACTOR);
    });
});

describe('scaleTimeout', () => {
    it('returns the timeout unchanged with no factor in the environment', () => {
        expect(scaleTimeout(60_000, {})).toBe(60_000);
    });

    it('multiplies by the factor under coverage', () => {
        expect(scaleTimeout(60_000, { TEST_TIMEOUT_FACTOR: String(COVERAGE_TIMEOUT_FACTOR) })).toBe(
            60_000 * COVERAGE_TIMEOUT_FACTOR,
        );
    });

    it('ignores a factor below 1 or not a number, so it never shortens a timeout', () => {
        expect(scaleTimeout(1000, { TEST_TIMEOUT_FACTOR: '0.5' })).toBe(1000);
        expect(scaleTimeout(1000, { TEST_TIMEOUT_FACTOR: 'x' })).toBe(1000);
    });
});
