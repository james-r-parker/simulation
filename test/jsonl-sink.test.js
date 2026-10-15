import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createJsonlSink } from '../scripts/lib/jsonl-sink.mjs';

describe('createJsonlSink', () => {
    it('writes one JSON line per record, creating parent directories', async () => {
        const path = join(mkdtempSync(join(tmpdir(), 'jsonl-')), 'a', 'b', 'run.jsonl');
        const { sink, close } = createJsonlSink(path);

        sink({ level: 'info', event: 'One', n: 1 });
        sink({ level: 'warn', event: 'Two' });
        await close();

        const lines = readFileSync(path, 'utf8').trim().split('\n');
        expect(lines.map((line) => JSON.parse(line))).toEqual([
            { level: 'info', event: 'One', n: 1 },
            { level: 'warn', event: 'Two' },
        ]);
    });

    it('appends to an existing file', async () => {
        const path = join(mkdtempSync(join(tmpdir(), 'jsonl-')), 'run.jsonl');
        for (const n of [1, 2]) {
            const { sink, close } = createJsonlSink(path);
            sink({ n });
            await close();
        }

        expect(readFileSync(path, 'utf8')).toBe('{"n":1}\n{"n":2}\n');
    });
});
