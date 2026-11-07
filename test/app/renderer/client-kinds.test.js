import { describe, expect, it } from 'vitest';
import { CLIENT_KIND } from '../../../js/app/renderer/client-kinds.js';
import { smallReady } from '../helpers/ready.js';

describe('CLIENT_KIND', () => {
    it('never collides with a worker effect kind', () => {
        const { layout } = smallReady();
        const worker = Object.values(layout.effectKinds);
        for (const k of Object.values(CLIENT_KIND)) {
            expect(worker).not.toContain(k);
            expect(k).toBeGreaterThan(1000);
        }
    });
});
