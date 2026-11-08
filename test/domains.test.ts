// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from 'vitest';
import { checkHost, hostOfUrl, normaliseHost, punycodeEncode } from '../src/domains/host.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { bundledPublicSuffixList, loadBundledText, parsePublicSuffixList, publicSuffix, registrableDomain } from '../src/domains/psl.js';
import { DomainRanker, LimitError, requiredCount, selectTop, sharePercent, type CrawlRecord, type RankOptions } from '../src/domains/rank.js';
import { hostOfSurt } from '../src/domains/readers.js';
import { isLink } from '../src/schema/checks.js';
import { ROOT, vectors } from './helpers.js';

const psl = bundledPublicSuffixList();

describe('Public Suffix List', () => {
  it('passes the official test cases of the list maintainers (CC0)', () => {
    const v = vectors<{ cases: { input: string; expect: string | null }[] }>('psl.json');
    expect(v.cases.length).toBeGreaterThan(70);
    for (const c of v.cases) {
      const host = normaliseHost(c.input);
      const got = host === null || host.startsWith('.') ? null : registrableDomain(host, psl, true);
      const want = c.expect === null ? null : normaliseHost(c.expect);
      expect(c.input.startsWith('.') ? null : got, c.input).toBe(want);
    }
  });

  it('records the bundled list version', () => {
    expect(psl.version).toMatch(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}_UTC$/);
    expect(psl.icann.size).toBeGreaterThan(5000);
  });

  it('groups by registrable domain, using only the ICANN section by default', () => {
    expect(registrableDomain('news.bbc.co.uk', psl)).toBe('bbc.co.uk');
    expect(registrableDomain('a.b.example.com', psl)).toBe('example.com');
    expect(registrableDomain('alice.github.io', psl)).toBe('github.io');
    expect(registrableDomain('alice.github.io', psl, true)).toBe('alice.github.io');
    expect(registrableDomain('co.uk', psl)).toBeNull();
    expect(registrableDomain('www.ck', psl)).toBe('www.ck');
    expect(registrableDomain('a.b.ck', psl)).toBe('a.b.ck');
    expect(registrableDomain('unknown-tld-host.zzzz', psl)).toBe('unknown-tld-host.zzzz');
    expect(publicSuffix('x.kawasaki.jp', psl)).toBe('x.kawasaki.jp');
  });

  it('checks the integrity of the bundled list', () => {
    const gz = readFileSync(join(ROOT, 'data', 'public_suffix_list.dat.gz'));
    expect(loadBundledText(gz)).toContain('// ===BEGIN ICANN DOMAINS===');
    expect(() => loadBundledText(gz, '0'.repeat(64))).toThrow('checksum');
    expect(() => loadBundledText(gzipSync(Buffer.alloc(32 * 1024 * 1024)))).toThrow();
  });

  it('rejects text that is not a public suffix list', () => {
    expect(() => parsePublicSuffixList('com\nnet\n')).toThrow();
  });
});

describe('host names', () => {
  it('matches the shared vectors', () => {
    const v = vectors<{ urls: { input: string; expect: unknown }[]; punycode: { input: string; expect: string }[]; surt: { input: string; expect: string | null }[] }>('hosts.json');
    for (const c of v.urls) expect(hostOfUrl(c.input), c.input).toEqual(c.expect);
    for (const c of v.punycode) expect(punycodeEncode(c.input), c.input).toBe(c.expect);
    for (const c of v.surt) expect(hostOfSurt(c.input), c.input).toBe(c.expect);
    for (const c of vectors<{ links: { input: string; expect: boolean }[] }>('hosts.json').links) expect(isLink(c.input), c.input).toBe(c.expect);
  });

  it('encodes the RFC 3492 sample strings', () => {
    // RFC 3492, section 7.1, samples (L) and (A) (lower-cased as hosts are).
    expect(punycodeEncode('3年b組金八先生')).toBe('3b-ww4c5e180e575a65lsy2b');
    expect(punycodeEncode('ليهمابتكلموشعربي؟')).toBe('egbpdaj6bu4bxfgehfvwxn');
    expect(punycodeEncode('bücher')).toBe('bcher-kva');
  });

  it('normalises case, trailing dots, ideographic dots and international names', () => {
    expect(hostOfUrl('HTTPS://WWW.Bücher.DE./x')).toEqual({ ok: true, host: 'www.xn--bcher-kva.de' });
    expect(hostOfUrl('https://a。b。example/')).toEqual({ ok: true, host: 'a.b.example' });
    expect(checkHost('Example.COM')).toEqual({ ok: true, host: 'example.com' });
  });

  it('rejects IP addresses, other schemes and malformed hosts', () => {
    expect(hostOfUrl('http://127.0.0.1/')).toEqual({ ok: false, reason: 'ip_address' });
    expect(hostOfUrl('http://[::1]:80/')).toEqual({ ok: false, reason: 'ip_address' });
    expect(hostOfUrl('http://2130706433/')).toEqual({ ok: false, reason: 'ip_address' });
    expect(hostOfUrl('javascript:alert(1)')).toEqual({ ok: false, reason: 'not_http' });
    expect(hostOfUrl('https://exa%6dple.com/')).toEqual({ ok: false, reason: 'invalid_host' });
    expect(hostOfUrl(`https://${'a'.repeat(9000)}.com/`)).toEqual({ ok: false, reason: 'invalid_url' });
    expect(hostOfUrl('https://example.com:70000/')).toEqual({ ok: false, reason: 'invalid_url' });
    expect(checkHost('evil.com\u202e')).toEqual({ ok: false, reason: 'invalid_host' });
    expect(checkHost('a/b')).toEqual({ ok: false, reason: 'invalid_host' });
  });
});

interface RankVector {
  name: string;
  options: Partial<RankOptions>;
  records: { url?: string; host?: string; size: string; modality?: string; month?: string }[];
  expect: Record<string, unknown>;
}

function rank(records: CrawlRecord[], options: Partial<RankOptions> = {}): ReturnType<DomainRanker['report']> {
  const r = new DomainRanker(options);
  for (const rec of records) r.add(rec);
  return r.report();
}

describe('domain ranking (Section 2.3 of the template)', () => {
  it.each(vectors<RankVector[]>('ranking.json').map((v) => [v.name, v] as const))('vector %s', (_n, v) => {
    const rep = rank(
      v.records.map((r) => ({ ...r, size: BigInt(r.size) })),
      { ...v.options, maxDomains: 1000 },
    );
    expect({ method: { ...rep.method, public_suffix_list: '(bundled)' }, records: rep.records, collection_period: rep.collection_period, totals: rep.totals, groups: rep.groups, domains: rep.domains }).toEqual(v.expect);
  });

  it('asks for the top 10 %, rounded up, and for SMEs 5 % or 1 000, whichever is lower', () => {
    expect([0, 1, 9, 10, 11, 20, 21, 100].map((n) => requiredCount(n, false))).toEqual([0, 1, 1, 1, 2, 2, 3, 10]);
    expect([0, 1, 20, 21, 100, 19_999, 20_000, 20_001, 1_000_000].map((n) => requiredCount(n, true))).toEqual([0, 1, 1, 2, 5, 1000, 1000, 1000, 1000]);
    for (const c of vectors<{ required_count: { n: number; sme: boolean; expect: number }[] }>('hosts.json').required_count) expect(requiredCount(c.n, c.sme)).toBe(c.expect);
  });

  it('includes every domain tied with the last one, or cuts alphabetically', () => {
    const entries: [string, bigint][] = [
      ['d.org', 5n],
      ['c.org', 7n],
      ['b.org', 7n],
      ['a.org', 9n],
      ...Array.from({ length: 16 }, (_, i): [string, bigint] => [`z${i}.org`, 1n]),
    ];
    expect(selectTop(entries, false, 'include')).toEqual({ selected: ['a.org', 'b.org', 'c.org'], required: 2, cutoff: 7n });
    expect(selectTop(entries, false, 'cut')).toEqual({ selected: ['a.org', 'b.org'], required: 2, cutoff: 7n });
  });

  it('computes shares with integer arithmetic', () => {
    expect(sharePercent(1n, 3n)).toBe('33.3333');
    expect(sharePercent(0n, 0n)).toBe('0.0000');
    for (const c of vectors<{ share: { size: string; total: string; expect: string }[] }>('hosts.json').share) expect(sharePercent(BigInt(c.size), BigInt(c.total))).toBe(c.expect);
  });

  it('handles sizes above 2^53 exactly', () => {
    const big = 2n ** 70n;
    const rep = rank([{ url: 'https://a.com/', size: big }, { url: 'https://a.com/b', size: 1n }]);
    expect(rep.domains[0]?.size).toBe((big + 1n).toString());
  });

  it('enforces the distinct-domain limit (memory bound) and rejects negative sizes', () => {
    const r = new DomainRanker({ maxDomains: 2 });
    r.add({ url: 'https://a.com/', size: 1n });
    r.add({ url: 'https://b.com/', size: 1n });
    r.add({ url: 'https://a.com/again', size: 1n });
    expect(() => { r.add({ url: 'https://c.com/', size: 1n }); }).toThrow(LimitError);
    expect(() => { r.add({ url: 'https://a.com/', size: -1n }); }).toThrow(RangeError);
    expect(() => {
      new DomainRanker({ maxDomains: 0 });
    }).toThrow(RangeError);
    expect(() => {
      new DomainRanker({ maxDomains: 1e12 });
    }).toThrow(RangeError);
  });

  it('gives the same result whatever the record order', () => {
    const recs: CrawlRecord[] = Array.from({ length: 50 }, (_, i) => ({ url: `https://s${i % 17}.example${i % 3}.com/${i}`, size: BigInt((i * 37) % 11) }));
    const a = rank(recs);
    const b = rank([...recs].reverse());
    expect(b.domains).toEqual(a.domains);
  });

  it('does not let a cached host decide for a different URL with the same prefix', () => {
    const long = `https://example.com/${'x'.repeat(9000)}`;
    const rep = rank([{ url: 'https://example.com/a', size: 1n }, { url: long, size: 1n }]);
    expect(rep.records.skipped.invalid_url).toBe(1);
  });
});
