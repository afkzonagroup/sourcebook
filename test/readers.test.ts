// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CrawlLogError, DEFAULT_READER_LIMITS, modalityOfMime, monthOf, parseSize, readCdx, readCdxj, readCsv, readCsvRows, readWarc, type FilterCounts } from '../src/domains/readers.js';
import { LimitError, type CrawlRecord } from '../src/domains/rank.js';
import { readByteStream } from '../src/cli/node-io.js';
import { chunks, fixture, vectors } from './helpers.js';

const enc = new TextEncoder();
async function collect(gen: AsyncGenerator<CrawlRecord>): Promise<Record<string, string>[]> {
  const out: Record<string, string>[] = [];
  for await (const r of gen) out.push({ ...(r as unknown as Record<string, string>), size: r.size.toString() });
  return out;
}
const read = {
  warc: (b: AsyncIterable<Uint8Array>, f: FilterCounts) => readWarc(b, f),
  cdx: (b: AsyncIterable<Uint8Array>, f: FilterCounts) => readCdx(b, f),
  cdxj: (b: AsyncIterable<Uint8Array>, f: FilterCounts) => readCdxj(b, f),
  csv: (b: AsyncIterable<Uint8Array>, f: FilterCounts) => readCsv(b, { url: 'url', size: 'bytes', modality: 'modality', date: 'date' }, f),
};

describe('crawl log readers (vectors shared with Python)', () => {
  const v = vectors<{ file: string; kind: keyof typeof read; records: unknown[]; filtered: FilterCounts }[]>('crawl.json');
  it.each(v.flatMap((c) => [1, 7, 97, 65536].map((size) => [c.file, size, c] as const)))('%s in chunks of %d bytes', async (_f, size, c) => {
    const buf = readFileSync(fixture(`crawl/${c.file}`));
    const filtered: FilterCounts = {};
    expect(await collect(read[c.kind](chunks(buf, size), filtered))).toEqual(c.records);
    expect(filtered).toEqual(c.filtered);
  });

  it('reads gzip-compressed WARC files with several gzip members', async () => {
    const plain = vectors<{ file: string; records: unknown[] }[]>('crawl.json').find((c) => c.file === 'sample.warc');
    expect(await collect(readWarc(readByteStream(fixture('crawl/sample.warc.gz')), {}))).toEqual(plain?.records);
  });
});

describe('WARC limits and errors', () => {
  const record = (headers: string, body: string): string => `WARC/1.0\r\n${headers}Content-Length: ${enc.encode(body).length}\r\n\r\n${body}\r\n\r\n`;

  it('stops at an over-long header', async () => {
    const text = `WARC/1.0\r\nWARC-Type: resource\r\nX: ${'a'.repeat(70_000)}\r\n`;
    await expect(collect(readWarc(chunks(enc.encode(text), 4096), {}))).rejects.toBeInstanceOf(LimitError);
  });

  it('stops when the total header block is too long', async () => {
    const text = `WARC/1.0\r\n${Array.from({ length: 2000 }, (_, i) => `X-${i}: ${'a'.repeat(40)}\r\n`).join('')}\r\n`;
    await expect(collect(readWarc(chunks(enc.encode(text), 4096), {}))).rejects.toMatchObject({ code: 'header-too-long' });
  });

  it('rejects a truncated block, a missing length and a non-WARC file', async () => {
    const truncated = `WARC/1.0\r\nWARC-Type: resource\r\nWARC-Target-URI: https://a.com/\r\nContent-Length: 1000\r\n\r\nshort`;
    await expect(collect(readWarc(chunks(enc.encode(truncated), 10), {}))).rejects.toMatchObject({ code: 'truncated' });
    await expect(collect(readWarc(chunks(enc.encode('WARC/1.0\r\nWARC-Type: resource\r\n\r\n'), 10), {}))).rejects.toMatchObject({ code: 'bad-length' });
    await expect(collect(readWarc(chunks(enc.encode('<html>not a warc</html>\n'), 10), {}))).rejects.toBeInstanceOf(CrawlLogError);
    await expect(collect(readWarc(chunks(enc.encode('WARC/1.0\r\nContent-Length: 99999999999999999\r\n\r\n'), 10), {}))).rejects.toMatchObject({ code: 'bad-length' });
  });

  it('enforces the record and byte limits', async () => {
    const two = record('WARC-Type: resource\r\nWARC-Target-URI: https://a.com/\r\n', 'x') + record('WARC-Type: resource\r\nWARC-Target-URI: https://b.com/\r\n', 'y');
    await expect(collect(readWarc(chunks(enc.encode(two), 50), {}, {}, { ...DEFAULT_READER_LIMITS, maxRecords: 1 }))).rejects.toMatchObject({ code: 'too-many-records' });
    await expect(collect(readWarc(chunks(enc.encode(two), 50), {}, {}, { ...DEFAULT_READER_LIMITS, maxBytes: 100 }))).rejects.toMatchObject({ code: 'too-many-bytes' });
  });

  it('skips large record blocks without keeping them in memory', async () => {
    const big = 'b'.repeat(5_000_000);
    const out = await collect(readWarc(chunks(enc.encode(record('WARC-Type: resource\r\nWARC-Target-URI: https://big.com/\r\nContent-Type: text/plain\r\n', big)), 65536), {}));
    expect(out).toEqual([{ url: 'https://big.com/', size: '5000000', modality: 'text' }]);
  });

  it('counts responses without HTTP headers or with other statuses as filtered', async () => {
    const f: FilterCounts = {};
    const text = record('WARC-Type: response\r\nWARC-Target-URI: https://a.com/\r\nContent-Type: application/http; msgtype=response\r\n', 'no headers here') + record('WARC-Type: response\r\nWARC-Target-URI: https://a.com/\r\nContent-Type: application/http\r\n', 'HTTP/1.1 301 Moved\r\nLocation: /x\r\n\r\n');
    expect(await collect(readWarc(chunks(enc.encode(text), 13), f))).toEqual([]);
    expect(f).toEqual({ http_headers_not_found: 1, http_not_2xx: 1 });
  });
});

describe('line and CSV readers', () => {
  it('stops a line without a line break before buffering it all', async () => {
    let produced = 0;
    // eslint-disable-next-line @typescript-eslint/require-await -- an async source over data in memory
    const endless = async function* (): AsyncGenerator<Uint8Array> {
      yield enc.encode(' CDX a S\n');
      for (let i = 0; i < 10_000; i++) {
        produced++;
        yield enc.encode('x'.repeat(4096));
      }
    };
    await expect(collect(readCdx(endless(), {}))).rejects.toMatchObject({ code: 'line-too-long' });
    expect(produced).toBeLessThan(40);
    await expect(collect(readCdx(chunks(enc.encode(` CDX a S\n${'y'.repeat(70_000)}`), 4096), {}))).rejects.toMatchObject({ code: 'line-too-long' });
  });

  it('stops at an over-long CDX line', async () => {
    const text = ` CDX a S\n${'x'.repeat(70_000)} 5\n`;
    await expect(collect(readCdx(chunks(enc.encode(text), 4096), {}))).rejects.toMatchObject({ code: 'line-too-long' });
    // In one chunk the line break is already in the buffer: the limit must still apply.
    await expect(collect(readCdx(chunks(enc.encode(text), 1 << 20), {}))).rejects.toMatchObject({ code: 'line-too-long' });
  });

  it('requires a CDX legend with size and URL fields', async () => {
    await expect(collect(readCdx(chunks(enc.encode('a b c\n'), 10), {}))).rejects.toMatchObject({ code: 'bad-legend' });
    await expect(collect(readCdx(chunks(enc.encode(' CDX a b\n'), 10), {}))).rejects.toMatchObject({ code: 'no-size' });
    await expect(collect(readCdx(chunks(enc.encode(' CDX b S\n'), 10), {}))).rejects.toMatchObject({ code: 'no-url' });
  });

  it('parses CSV per RFC 4180, including quotes and line breaks in fields', async () => {
    const rows: string[][] = [];
    for await (const r of readCsvRows(chunks(enc.encode('a,"b ""q"" c","multi\nline"\r\nx,,z\n'), 3), ',')) rows.push(r.fields);
    expect(rows).toEqual([
      ['a', 'b "q" c', 'multi\nline'],
      ['x', '', 'z'],
    ]);
  });

  it('rejects malformed CSV', async () => {
    const bad = async (t: string): Promise<unknown> => {
      let n = 0;
      for await (const r of readCsvRows(chunks(enc.encode(t), 2), ',')) n += r.fields.length;
      return n;
    };
    await expect(bad('a,b"c\n')).rejects.toMatchObject({ code: 'bad-csv' });
    await expect(bad('"a"b\n')).rejects.toMatchObject({ code: 'bad-csv' });
    await expect(bad('"open\n')).rejects.toMatchObject({ code: 'bad-csv' });
    await expect(bad('"a"\rb\n')).rejects.toMatchObject({ code: 'bad-csv' });
    await expect(bad(`${Array.from({ length: 300 }, () => 'x').join(',')}\n`)).rejects.toMatchObject({ code: 'too-many-fields' });
    await expect(bad(`"${'x'.repeat(70_000)}"\n`)).rejects.toMatchObject({ code: 'line-too-long' });
  });

  it('rejects invalid UTF-8 in CSV and a missing column', async () => {
    const bytes = new Uint8Array([0x75, 0x72, 0x6c, 0x2c, 0x73, 0x0a, 0xff, 0x2c, 0x31, 0x0a]);
    await expect(collect(readCsv(chunks(bytes, 4), { url: 'url', size: 's' }, {}))).rejects.toMatchObject({ code: 'bad-encoding' });
    await expect(collect(readCsv(chunks(enc.encode('a,b\n'), 4), { url: 'url', size: 'b' }, {}))).rejects.toMatchObject({ code: 'missing-column' });
    expect(() => readCsv(chunks(enc.encode(''), 4), { size: 'b' }, {})).not.toThrow();
    await expect(collect(readCsv(chunks(enc.encode(''), 4), { size: 'b' }, {}))).rejects.toBeInstanceOf(RangeError);
  });

  it('reads CSV logs that name hosts instead of URLs, with a tab delimiter', async () => {
    const out = await collect(readCsv(chunks(enc.encode('host\tsize\nExample.com\t5\n'), 4), { host: 'host', size: 'size', delimiter: '\t' }, {}));
    expect(out).toEqual([{ host: 'Example.com', size: '5' }]);
  });
});

describe('small helpers', () => {
  it('maps MIME types, dates and sizes', () => {
    expect(['text/html; charset=utf-8', 'application/pdf', 'image/png', 'audio/mpeg', 'video/mp4', 'application/zip'].map(modalityOfMime)).toEqual(['text', 'text', 'image', 'audio', 'video', 'other']);
    expect([monthOf('2025-03-01T00:00:00Z'), monthOf('20250301000000'), monthOf('2025-13'), monthOf('x')]).toEqual(['2025-03', '2025-03', undefined, undefined]);
    expect([parseSize('12'), parseSize(' 7 '), parseSize('-1'), parseSize('1e3'), parseSize('')]).toEqual([12n, 7n, null, null, null]);
  });
});

describe('closing sources', () => {
  it('closes the byte source when the consumer stops early', async () => {
    const cases: [(s: AsyncIterable<Uint8Array>) => AsyncGenerator<CrawlRecord>, string, string][] = [
      [(s) => readWarc(s, {}), '', 'WARC/1.0\r\nWARC-Type: resource\r\nWARC-Target-URI: https://a.com/\r\nContent-Length: 1\r\n\r\nx\r\n\r\n'],
      [(s) => readCdx(s, {}), ' CDX a S\n', 'https://a.com/ 5\n'],
      [(s) => readCdxj(s, {}), '', 'com,a)/ 20250101000000 {"url": "https://a.com/", "length": "5"}\n'],
    ];
    for (const [make, head, line] of cases) {
      let closed = false;
      let produced = 0;
      // eslint-disable-next-line @typescript-eslint/require-await -- an async source over data in memory
      const source = async function* (): AsyncGenerator<Uint8Array> {
        try {
          for (let i = 0; i < 1000; i++) {
            produced++;
            yield enc.encode(i === 0 ? head + line : line);
          }
        } finally {
          closed = true;
        }
      };
      const gen = make(source());
      expect((await gen.next()).done).toBe(false);
      await gen.return(undefined);
      expect(closed).toBe(true);
      expect(produced).toBeLessThan(1000);
    }
  });
});
