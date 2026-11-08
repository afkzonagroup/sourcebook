// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { datasetFromHfCard, isRepoId } from '../src/collect/hf-card.js';
import { fetchHubDataset, isAllowedUrl, isRevision } from '../src/collect/hf-hub.js';
import { datasetFromParquet, datasetsFromCsvManifest, datasetsFromJsonManifest, parquetFooterLength, parseParquetFooter, ParquetError } from '../src/collect/manifest.js';
import { largeDatasets, mergeInventories, newInventory, parseInventory, prefillSummary, sizeRangeFor, type InventoryDataset } from '../src/collect/inventory.js';
import { SchemaError } from '../src/schema/parse.js';
import { validateSummary } from '../src/validate/validate.js';
import { DomainRanker } from '../src/domains/rank.js';
import { chunks, exampleSummary, fixture, vectors } from './helpers.js';

describe('Hugging Face dataset cards (real fixtures, vectors shared with Python)', () => {
  it.each(vectors<{ fixture: string; mode: string; expect: unknown }[]>('cards.json').map((v) => [v.fixture, v.mode, v] as const))('%s (%s)', (_f, mode, v) => {
    const api = JSON.parse(readFileSync(fixture(`hf/${v.fixture}.api.json`), 'utf8')) as { id: string };
    const readme = mode === 'api-no-readme' ? null : readFileSync(fixture(`hf/${v.fixture}.README.md`), 'utf8');
    const got =
      mode === 'offline'
        ? datasetFromHfCard({ id: api.id, readme, reference: `${v.fixture}.README.md` })
        : datasetFromHfCard({ id: api.id, api, readme, reference: `https://huggingface.co/api/datasets/${api.id}` });
    expect(got).toEqual(v.expect);
  });

  it('takes facts from a real card and says what is missing', () => {
    const squad = datasetFromHfCard({ id: 'rajpurkar/squad', readme: readFileSync(fixture('hf/rajpurkar_squad.README.md'), 'utf8'), reference: 'README.md' });
    expect(squad).toMatchObject({ id: 'hf:rajpurkar/squad', name: 'SQuAD', link: 'https://huggingface.co/datasets/rajpurkar/squad', category: 'public', modalities: ['text'], languages: ['en'], licenses: ['cc-by-sa-4.0'] });
    expect(squad.sizes.map((s) => s.unit)).toEqual(['bytes', 'examples']);
    expect(squad.sizes.every((s) => !s.after_preprocessing)).toBe(true);
    const stack = JSON.parse(readFileSync(fixture('hf/bigcode_the-stack.api.json'), 'utf8')) as unknown;
    const gated = datasetFromHfCard({ api: stack, readme: null, reference: 'api' });
    expect(gated.notes.join(' ')).toContain('gated');
    const alpaca = datasetFromHfCard({ api: JSON.parse(readFileSync(fixture('hf/tatsu-lab_alpaca.api.json'), 'utf8')), readme: null, reference: 'api' });
    expect(alpaca.licenses).toEqual(['cc-by-nc-4.0']);
  });

  it('marks private datasets and ignores hostile values in a card', () => {
    const d = datasetFromHfCard({
      api: { id: '../../etc', private: true, cardData: { pretty_name: 'X\u202eY', language: ['en', 5, { a: 1 }, 'x'.repeat(500)], license: 'other' } },
      reference: 'api',
    });
    expect(d.category).toBeNull();
    expect(d.id.startsWith('card:')).toBe(true);
    expect(d.link).toBe('');
    expect(d.languages).toEqual(['en']);
    expect(d.name).not.toContain('\u202e');
  });

  it('validates repository ids', () => {
    expect(['org/name', 'name', 'a/b.c_d-e'].map(isRepoId)).toEqual([true, true, true]);
    expect(['../x', 'a/../b', 'a--b/c', '-a/b', 'a/b/c', '', 'a/b?x=1', 'a b/c', `${'a'.repeat(97)}/b`].map(isRepoId)).toEqual(Array(9).fill(false));
  });
});

/** A fake fetch that records requests and answers from a table. */
function fakeFetch(routes: Record<string, () => Response>): { fetch: (u: string, i: RequestInit) => Promise<Response>; calls: { url: string; init: RequestInit }[] } {
  const calls: { url: string; init: RequestInit }[] = [];
  return {
    calls,
    fetch: (url, init) => {
      calls.push({ url, init });
      const route = Object.keys(routes).find((k) => url.startsWith(k));
      return Promise.resolve(route === undefined ? new Response('not found', { status: 404 }) : (routes[route] ?? (() => new Response('', { status: 500 })))());
    },
  };
}

describe('Hugging Face Hub access (network allow-list)', () => {
  const api = readFileSync(fixture('hf/rajpurkar_squad.api.json'), 'utf8');
  const readme = readFileSync(fixture('hf/rajpurkar_squad.README.md'), 'utf8');

  it('reads the API and README from huggingface.co only, without credentials', async () => {
    const f = fakeFetch({
      'https://huggingface.co/api/datasets/rajpurkar/squad?': () => new Response(api, { status: 200 }),
      'https://huggingface.co/datasets/rajpurkar/squad/raw/main/README.md': () => new Response(readme, { status: 200 }),
    });
    const hub = await fetchHubDataset('rajpurkar/squad', { fetch: f.fetch });
    expect(hub.readme).toBe(readme);
    expect(f.calls).toHaveLength(2);
    for (const c of f.calls) {
      expect(c.init).toMatchObject({ redirect: 'manual', credentials: 'omit', method: 'GET' });
      expect(c.init.signal).toBeInstanceOf(AbortSignal);
      expect(new URL(c.url).hostname).toBe('huggingface.co');
    }
    expect(f.calls[0]?.url).toContain('expand[]=cardData');
  });

  it('follows same-host redirects and refuses redirects to other hosts', async () => {
    const ok = fakeFetch({
      'https://huggingface.co/api/datasets/squad?': () => new Response(null, { status: 307, headers: { location: '/api/datasets/rajpurkar/squad?expand[]=cardData' } }),
      'https://huggingface.co/api/datasets/rajpurkar/squad': () => new Response(api, { status: 200 }),
      'https://huggingface.co/datasets/squad/raw/main/README.md': () => new Response(null, { status: 401 }),
    });
    expect((await fetchHubDataset('squad', { fetch: ok.fetch })).readme).toBeNull();
    for (const location of ['https://evil.example/x', 'http://huggingface.co/x', 'https://huggingface.co:444/x', 'https://user@huggingface.co/x', '//evil.example/x', 'https://huggingface.co.evil.example/x']) {
      const bad = fakeFetch({ 'https://huggingface.co/api/datasets/a/b': () => new Response(null, { status: 302, headers: { location } }) });
      await expect(fetchHubDataset('a/b', { fetch: bad.fetch }), location).rejects.toMatchObject({ code: 'bad-redirect' });
      expect(bad.calls).toHaveLength(1);
    }
  });

  it('stops redirect loops', async () => {
    const loop = fakeFetch({ 'https://huggingface.co/': () => new Response(null, { status: 302, headers: { location: 'https://huggingface.co/api/datasets/a/b?loop' } }) });
    await expect(fetchHubDataset('a/b', { fetch: loop.fetch })).rejects.toMatchObject({ code: 'too-many-redirects' });
    expect(loop.calls).toHaveLength(4);
  });

  it('caps the response size, also when the length header is missing or lies', async () => {
    const big = 'x'.repeat(5000);
    const declared = fakeFetch({ 'https://huggingface.co/api/': () => new Response(big, { status: 200, headers: { 'content-length': '999999999' } }) });
    await expect(fetchHubDataset('a/b', { fetch: declared.fetch, maxBytes: 1024 })).rejects.toMatchObject({ code: 'too-large' });
    const streamed = fakeFetch({ 'https://huggingface.co/api/': () => new Response(new Blob([big]).stream(), { status: 200 }) });
    await expect(fetchHubDataset('a/b', { fetch: streamed.fetch, maxBytes: 1024 })).rejects.toMatchObject({ code: 'too-large' });
  });

  it('reports timeouts, network errors, missing datasets, bad JSON and server errors', async () => {
    const slow = (_u: string, init: RequestInit): Promise<Response> =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          reject(init.signal?.reason as Error);
        });
      });
    await expect(fetchHubDataset('a/b', { fetch: slow, timeoutMs: 20 })).rejects.toMatchObject({ code: 'network', message: expect.stringContaining('timed out') as string });
    await expect(fetchHubDataset('a/b', { fetch: () => Promise.reject(new TypeError('fetch failed')) })).rejects.toMatchObject({ code: 'network' });
    await expect(fetchHubDataset('a/b', { fetch: fakeFetch({}).fetch })).rejects.toMatchObject({ code: 'not-found' });
    await expect(fetchHubDataset('a/b', { fetch: fakeFetch({ 'https://huggingface.co/api/': () => new Response('{not json', { status: 200 }) }).fetch })).rejects.toMatchObject({ code: 'bad-json' });
    await expect(fetchHubDataset('a/b', { fetch: fakeFetch({ 'https://huggingface.co/api/': () => new Response('', { status: 500 }) }).fetch })).rejects.toMatchObject({ code: 'http' });
  });

  it('validates ids and revisions before building URLs', async () => {
    const f = fakeFetch({});
    await expect(fetchHubDataset('../admin', { fetch: f.fetch })).rejects.toMatchObject({ code: 'bad-id' });
    await expect(fetchHubDataset('a/b', { fetch: f.fetch, revision: '../../x' })).rejects.toMatchObject({ code: 'bad-revision' });
    expect(f.calls).toHaveLength(0);
    expect(['main', 'v1.0', 'refs/convert/parquet', 'a'.repeat(40)].map(isRevision)).toEqual([true, true, true, true]);
    expect(['', '..', 'a//b', 'a/', 'x?y', 'a b'].map(isRevision)).toEqual(Array(6).fill(false));
    const revisioned = fakeFetch({ 'https://huggingface.co/api/datasets/a/b/revision/v1.0?': () => new Response('{"id":"a/b"}', { status: 200 }) });
    await fetchHubDataset('a/b', { fetch: revisioned.fetch, revision: 'v1.0' });
    expect(revisioned.calls[1]?.url).toBe('https://huggingface.co/datasets/a/b/raw/v1.0/README.md');
    expect(isAllowedUrl('not a url')).toBe(false);
  });
});

describe('manifests', () => {
  it('reads a JSON manifest with integer sizes', () => {
    const ds = datasetsFromJsonManifest(
      { datasets: [{ name: 'Corpus A', link: 'https://example.org/a', category: 'licensed', modalities: ['text'], sizes: [{ modality: 'text', value: 1200, unit: 'tokens', after_preprocessing: true }] }] },
      'manifest.json',
    );
    expect(ds[0]).toMatchObject({ id: 'manifest:Corpus A', category: 'licensed', sizes: [{ value: '1200', unit: 'tokens', basis: 'manifest', after_preprocessing: true }], source: { kind: 'manifest-json' } });
    expect(() => datasetsFromJsonManifest({ datasets: [{ name: 'x', category: 'stolen' }] }, 'm')).toThrow(SchemaError);
    expect(() => datasetsFromJsonManifest({ datasets: [{ name: 'x', link: 'javascript:1' }] }, 'm')).toThrow(SchemaError);
    expect(() => datasetsFromJsonManifest({ nope: 1 }, 'm')).toThrow(SchemaError);
    expect(() => datasetsFromJsonManifest({ datasets: [{ name: 'x', sizes: [{ modality: 'text', value: -5, unit: 'tokens' }] }] }, 'm')).toThrow(SchemaError);
  });

  it('reads a CSV manifest, one row per modality', async () => {
    const csv = 'name,category,modality,size,unit,after_preprocessing,languages,licenses,collection_start,collection_end,publicly_known\nNews,private,text,500,tokens,yes,en;fr,proprietary,2020-01,2024-12,true\nNews,private,image,20,images,no,,,,,\n';
    const ds = await datasetsFromCsvManifest(chunks(new TextEncoder().encode(csv), 16), 'm.csv');
    expect(ds).toHaveLength(1);
    expect(ds[0]).toMatchObject({ modalities: ['text', 'image'], languages: ['en', 'fr'], publicly_known: true, collection_period: { start: '2020-01', end: '2024-12' } });
    expect(ds[0]?.sizes).toEqual([
      { modality: 'text', value: '500', unit: 'tokens', basis: 'manifest', after_preprocessing: true },
      { modality: 'image', value: '20', unit: 'images', basis: 'manifest', after_preprocessing: false },
    ]);
    await expect(datasetsFromCsvManifest(chunks(new TextEncoder().encode('name,evil\nx,1\n'), 8), 'm')).rejects.toMatchObject({ code: 'unknown-column' });
    await expect(datasetsFromCsvManifest(chunks(new TextEncoder().encode('link\nx\n'), 8), 'm')).rejects.toMatchObject({ code: 'missing-column' });
    await expect(datasetsFromCsvManifest(chunks(new TextEncoder().encode('name,size,modality\n,1,text\n'), 8), 'm')).rejects.toMatchObject({ code: 'missing-name' });
  });
});

describe('Parquet footers (real files written by pyarrow)', () => {
  const footerOf = (name: string): Uint8Array => {
    const buf = new Uint8Array(readFileSync(fixture(`parquet/${name}`)));
    const len = parquetFooterLength(buf.subarray(buf.length - 8), buf.length);
    return buf.subarray(buf.length - 8 - len, buf.length - 8);
  };

  it('reads row counts, sizes, columns and the Hugging Face features', () => {
    // Values checked against pyarrow: num_rows, num_row_groups, sum(total_byte_size).
    expect(parseParquetFooter(footerOf('text.parquet'))).toEqual({ rows: 1000n, rowGroups: 4, uncompressedBytes: 26369n, columns: ['id', 'text', 'tokens'], createdBy: 'parquet-cpp-arrow version 26.0.1', modalities: ['text'] });
    expect(parseParquetFooter(footerOf('images.parquet'))).toMatchObject({ rows: 40n, rowGroups: 2, uncompressedBytes: 3262n, modalities: ['image'] });
    expect(parseParquetFooter(footerOf('plain.parquet'))).toMatchObject({ rows: 2n, rowGroups: 1, uncompressedBytes: 102n, modalities: [] });
  });

  it('turns footers into one dataset entry', () => {
    const d = datasetFromParquet([parseParquetFooter(footerOf('text.parquet')), parseParquetFooter(footerOf('text.parquet'))], { name: 'Corpus', reference: 'a, b', category: 'public' });
    expect(d.sizes).toEqual([
      { modality: 'text', value: '52738', unit: 'bytes', basis: 'Parquet row groups total_byte_size (uncompressed)', after_preprocessing: false },
      { modality: 'text', value: '2000', unit: 'examples', basis: 'Parquet num_rows', after_preprocessing: false },
    ]);
    expect(() => datasetFromParquet([], { name: 'x', reference: 'r', category: null, link: 'ftp://x' })).toThrow(RangeError);
  });

  it('rejects hostile or broken footers', () => {
    const tail = (magic: string, len: number): Uint8Array => {
      const t = new Uint8Array(8);
      new DataView(t.buffer).setUint32(0, len, true);
      t.set(new TextEncoder().encode(magic), 4);
      return t;
    };
    expect(() => parquetFooterLength(tail('PARE', 10), 100)).toThrow(expect.objectContaining({ code: 'encrypted' }) as Error);
    expect(() => parquetFooterLength(tail('ABCD', 10), 100)).toThrow(expect.objectContaining({ code: 'not-parquet' }) as Error);
    expect(() => parquetFooterLength(tail('PAR1', 0xffffffff), 2 ** 40)).toThrow(expect.objectContaining({ code: 'too-large' }) as Error);
    expect(() => parquetFooterLength(tail('PAR1', 1000), 100)).toThrow(expect.objectContaining({ code: 'truncated' }) as Error);
    expect(() => parquetFooterLength(tail('PAR1', 1), 5)).toThrow(ParquetError);
    // A list header that claims 2^40 elements.
    expect(() => parseParquetFooter(new Uint8Array([0x29, 0xfc, 0x80, 0x80, 0x80, 0x80, 0x80, 0x40]))).toThrow(expect.objectContaining({ code: 'too-large' }) as Error);
    // Deeply nested structs.
    expect(() => parseParquetFooter(new Uint8Array(Array(200).fill(0x1c)))).toThrow(expect.objectContaining({ code: 'too-deep' }) as Error);
    // Truncated string.
    expect(() => parseParquetFooter(new Uint8Array([0x68, 0x7f, 0x41]))).toThrow(ParquetError);
    // Unknown type, bad varint.
    expect(() => parseParquetFooter(new Uint8Array([0x1d, 0x00]))).toThrow(ParquetError);
    expect(() => parseParquetFooter(new Uint8Array([0x16, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x01]))).toThrow(ParquetError);
    // Random bytes never crash with anything but ParquetError.
    let seed = 7;
    for (let n = 0; n < 300; n++) {
      const bytes = new Uint8Array(64).map(() => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) & 0xff);
      try {
        parseParquetFooter(bytes);
      } catch (e) {
        expect(e).toBeInstanceOf(ParquetError);
      }
    }
  });
});

interface InventoryVector {
  name: string;
  datasets: InventoryDataset[];
  large: unknown;
  prefill: unknown;
  hints: unknown;
}

describe('inventory: large datasets and pre-fill (vectors shared with Python)', () => {
  it.each(vectors<InventoryVector[]>('inventory.json').map((v) => [v.name, v] as const))('%s', (_n, v) => {
    const inv = parseInventory({ kind: 'sourcebook-inventory', version: 1, datasets: v.datasets, domain_report: null });
    expect(largeDatasets(inv.datasets)).toEqual(v.large);
    const pre = prefillSummary(inv);
    expect(JSON.parse(JSON.stringify(pre.summary))).toEqual(v.prefill);
    expect(pre.hints).toEqual(v.hints);
  });

  it('applies "exceeds 3%" strictly', () => {
    const v = vectors<InventoryVector[]>('inventory.json');
    const boundary = largeDatasets(v.find((x) => x.name === 'three-percent-boundary')?.datasets ?? []);
    expect(boundary[0]?.large.map((l) => l.id)).toEqual(['b']);
    const over = largeDatasets(v.find((x) => x.name === 'just-over')?.datasets ?? []);
    expect(over[0]?.large.map((l) => l.id)).toEqual(['b', 'a']);
  });

  it('maps totals to the size ranges of Section 1.3, bounds included', () => {
    expect(sizeRangeFor('text', 999_999_999n, 'tokens')).toBe('below_1b_tokens');
    expect(sizeRangeFor('text', 1_000_000_000n, 'tokens')).toBe('1b_to_10t_tokens');
    expect(sizeRangeFor('text', 10_000_000_000_000n, 'tokens')).toBe('1b_to_10t_tokens');
    expect(sizeRangeFor('text', 10_000_000_000_001n, 'tokens')).toBe('above_10t_tokens');
    expect(sizeRangeFor('image', 5n, 'bytes')).toBeNull();
    expect(sizeRangeFor('audio', 10_000n, 'hours')).toBe('10k_to_1m_hours');
  });

  it('never overwrites answers the provider wrote', () => {
    const base = exampleSummary();
    const ranker = new DomainRanker();
    ranker.add({ url: 'https://new.example/', size: 5n, month: '2020-01' });
    const inv = { ...newInventory(), domain_report: ranker.report(), datasets: vectors<InventoryVector[]>('inventory.json')[5]?.datasets ?? [] };
    const { summary, hints } = prefillSummary(parseInventory(JSON.parse(JSON.stringify(inv))), base);
    expect(summary).toEqual(base);
    expect(hints['data_sources.other_private_datasets.obtained']).toEqual(['The inventory has 2 private datasets from third parties, but the answer here is No.']);
    expect(hints['general_information.modalities.image.present']).toEqual(['The inventory has image data, but this modality is not selected.']);
  });

  it('merges inventories and cross-checks the summary against them', () => {
    const v = vectors<InventoryVector[]>('inventory.json');
    const merged = mergeInventories([parseInventory({ kind: 'sourcebook-inventory', version: 1, datasets: v[1]?.datasets ?? [] }), parseInventory({ kind: 'sourcebook-inventory', version: 1, datasets: v[1]?.datasets ?? [] })]);
    expect(merged.datasets).toHaveLength(2);
    const ranker = new DomainRanker();
    for (const d of ['a.com', 'b.com', 'c.com']) ranker.add({ host: d, size: 10n });
    const result = validateSummary(exampleSummary(), { asOf: '2026-11-08', inventory: { ...merged, domain_report: ranker.report() } });
    expect(result.issues.filter((i) => i.severity === 'error').map((i) => i.code)).toEqual(['large-dataset-not-listed', 'large-dataset-not-listed', 'domain-not-listed', 'domain-not-listed', 'domain-not-listed']);
    expect(() => parseInventory({ kind: 'other' })).toThrow(SchemaError);
    expect(() => parseInventory({ kind: 'sourcebook-inventory', version: 1, domain_report: { kind: 'sourcebook-domain-report', version: 1, domains: [{ domain: 'NOT A DOMAIN' }] } })).toThrow(SchemaError);
  });
});
