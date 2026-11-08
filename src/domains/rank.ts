// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The domain list of Section 2.3 of the template: "the top 10 % of all domain
 * names determined by the size of the content scraped (in a representative
 * manner across all modalities where applicable). Small and medium-sized
 * enterprises (SMEs), including start-ups, should disclose top 5% of all
 * domain names or 1 000 internet domain names, whichever is lower."
 *
 * Choices this module makes where the template is silent (all recorded in
 * every report and explained in docs/domain-ranking.md):
 *
 * - "Top 10 %" counts domain names, rounded up: with 25 domains, 3 are listed.
 *   Rounding up never lists fewer than the share the template names.
 * - Ties at the cut-off: by default every domain with the same size as the
 *   last one inside the share is listed too (`ties: 'include'`), so the list
 *   never depends on alphabetical order. `ties: 'cut'` stops exactly at the
 *   count, breaking ties alphabetically.
 * - Domains with no content counted (size 0) are not "domain names crawled
 *   and used for training" and are left out of the count.
 * - Modalities: with `modalityMode: 'per-modality'` the share is applied
 *   within each modality and the lists are merged, so a small modality is
 *   still represented; with `'combined'` all sizes are added up (use it only
 *   when they share a unit).
 */

import { checkHost, hostOfUrl, MAX_URL_LENGTH, type HostRejection } from './host.js';
import { bundledPublicSuffixList, registrableDomain, type PublicSuffixList } from './psl.js';
import { GENERATOR } from '../version.js';

/** One crawled or scraped item, as read from a crawl log. */
export interface CrawlRecord {
  /** The URL (or, with `host`, a bare host name). */
  readonly url?: string;
  readonly host?: string;
  /** Size of the content, in the report's unit. */
  readonly size: bigint;
  /** Modality, when the log records it (e.g. "text"). */
  readonly modality?: string;
  /** Month of collection, "YYYY-MM", when the log records it. */
  readonly month?: string;
}

export type TieRule = 'include' | 'cut';
export type ModalityMode = 'combined' | 'per-modality';

export interface RankOptions {
  /** The provider is an SME, including a start-up (5 % or 1 000, whichever is lower). */
  readonly sme: boolean;
  readonly ties: TieRule;
  readonly modalityMode: ModalityMode;
  /** Also apply the PRIVATE section of the Public Suffix List. */
  readonly includePrivateSuffixes: boolean;
  /** Unit of `size`, e.g. "bytes" or "tokens". */
  readonly sizeUnit: string;
  /** How the size was measured, e.g. "WARC payload bytes". */
  readonly sizeMeasure: string;
  /** Stop with an error beyond this many distinct domains (memory bound). */
  readonly maxDomains: number;
  /** Public Suffix List to use; the bundled list by default. */
  readonly publicSuffixList?: PublicSuffixList;
}

export const DEFAULT_RANK_OPTIONS: RankOptions = {
  sme: false,
  ties: 'include',
  modalityMode: 'combined',
  includePrivateSuffixes: false,
  sizeUnit: 'bytes',
  sizeMeasure: 'bytes',
  maxDomains: 5_000_000,
};

/** Hard upper bound for `maxDomains`. */
export const MAX_DOMAINS_LIMIT = 50_000_000;

export type SkipReason = HostRejection | 'public_suffix_only' | 'zero_size';

type DomainOrSkip = { domain: string } | { skip: SkipReason };

export interface RankedDomain {
  rank: number;
  domain: string;
  /** Total size, as a decimal string (sizes can exceed 2^53). */
  size: string;
  /** Share of the total size, in percent with four decimals, e.g. "12.3456". */
  share_percent: string;
  records: number;
  modalities: string[];
}

export interface DomainGroup {
  /** "all" in combined mode, otherwise the modality. */
  modality: string;
  domains: number;
  size: string;
  /** How many domains the template asks for in this group. */
  required: number;
  /** Size of the last required domain ("0" when none). */
  cutoff_size: string;
  /** Domains listed for this group, including ties. */
  selected: number;
}

/** The result of ranking, as written to `domains.json`. */
export interface DomainReport {
  kind: 'sourcebook-domain-report';
  version: 1;
  generator: string;
  method: {
    grouping: 'registrable-domain';
    public_suffix_list: string;
    private_suffixes: boolean;
    threshold: 'top-10-percent' | 'sme-top-5-percent-or-1000';
    ties: TieRule;
    modality_mode: ModalityMode;
    size_unit: string;
    size_measure: string;
  };
  records: { read: number; counted: number; skipped: Record<SkipReason, number> };
  collection_period: { from: string | null; to: string | null };
  totals: { domains: number; size: string };
  groups: DomainGroup[];
  domains: RankedDomain[];
}

/** Raised when an input exceeds a configured limit. */
export class LimitError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'LimitError';
    this.code = code;
  }
}

interface DomainStats {
  size: bigint;
  records: number;
  byModality: Map<string, bigint>;
}

/** Number of domains the template asks for, out of `n` (see the module notes). */
export function requiredCount(n: number, sme: boolean): number {
  if (n <= 0) return 0;
  if (sme) return Math.min(Math.ceil((n * 5) / 100), 1000);
  return Math.ceil((n * 10) / 100);
}

/** Percent with four decimals, by integer arithmetic (identical in the Python package). */
export function sharePercent(size: bigint, total: bigint): string {
  if (total <= 0n) return '0.0000';
  const q = (size * 1_000_000n) / total;
  return `${(q / 10_000n).toString()}.${(q % 10_000n).toString().padStart(4, '0')}`;
}

function compareEntries(a: [string, bigint], b: [string, bigint]): number {
  if (a[1] !== b[1]) return a[1] > b[1] ? -1 : 1;
  return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
}

/** Selects the domains of one group; entries must have size > 0. */
export function selectTop(entries: [string, bigint][], sme: boolean, ties: TieRule): { selected: string[]; required: number; cutoff: bigint } {
  const sorted = [...entries].sort(compareEntries);
  const required = requiredCount(sorted.length, sme);
  if (required === 0) return { selected: [], required, cutoff: 0n };
  const cutoff = sorted[required - 1]?.[1] ?? 0n;
  let end = required;
  if (ties === 'include') while (end < sorted.length && sorted[end]?.[1] === cutoff) end++;
  return { selected: sorted.slice(0, end).map(([d]) => d), required, cutoff };
}

const MONTH = /^[0-9]{4}-(0[1-9]|1[0-2])$/;

/**
 * Collects crawl records and ranks their registrable domains.
 *
 * @example
 * const r = new DomainRanker();
 * r.add({ url: 'https://news.example.co.uk/a', size: 1200n });
 * r.report().domains[0]?.domain; // => 'example.co.uk'
 */
export class DomainRanker {
  private readonly options: RankOptions;
  private readonly psl: PublicSuffixList;
  private readonly stats = new Map<string, DomainStats>();
  private readonly cache = new Map<string, DomainOrSkip>();
  private readonly skipped: Record<SkipReason, number> = {
    invalid_url: 0,
    not_http: 0,
    ip_address: 0,
    invalid_host: 0,
    public_suffix_only: 0,
    zero_size: 0,
  };
  private read = 0;
  private counted = 0;
  private minMonth: string | null = null;
  private maxMonth: string | null = null;

  constructor(options: Partial<RankOptions> = {}) {
    this.options = { ...DEFAULT_RANK_OPTIONS, ...options };
    if (!Number.isInteger(this.options.maxDomains) || this.options.maxDomains < 1 || this.options.maxDomains > MAX_DOMAINS_LIMIT) {
      throw new RangeError(`maxDomains must be an integer from 1 to ${MAX_DOMAINS_LIMIT}.`);
    }
    this.psl = this.options.publicSuffixList ?? bundledPublicSuffixList();
  }

  private domainOf(record: CrawlRecord): DomainOrSkip {
    const key = record.host !== undefined ? `h:${record.host}` : cacheKey(record.url ?? '');
    const hit = key === null ? undefined : this.cache.get(key);
    if (hit !== undefined) return hit;
    const result = record.host !== undefined ? checkHost(record.host) : hostOfUrl(record.url ?? '');
    let value: DomainOrSkip;
    if (!result.ok) value = { skip: result.reason };
    else {
      const domain = registrableDomain(result.host, this.psl, this.options.includePrivateSuffixes);
      value = domain === null ? { skip: 'public_suffix_only' } : { domain };
    }
    if (key !== null) {
      if (this.cache.size >= 100_000) this.cache.clear();
      this.cache.set(key, value);
    }
    return value;
  }

  /** Adds one record. Throws LimitError when the number of domains exceeds `maxDomains`. */
  add(record: CrawlRecord): void {
    this.read++;
    if (record.size < 0n) throw new RangeError('Record size cannot be negative.');
    const found = this.domainOf(record);
    if ('skip' in found) {
      this.skipped[found.skip]++;
      return;
    }
    const domain = found.domain;
    if (record.size === 0n) {
      this.skipped.zero_size++;
      return;
    }
    this.counted++;
    if (record.month !== undefined && MONTH.test(record.month)) {
      if (this.minMonth === null || record.month < this.minMonth) this.minMonth = record.month;
      if (this.maxMonth === null || record.month > this.maxMonth) this.maxMonth = record.month;
    }
    let s = this.stats.get(domain);
    if (s === undefined) {
      if (this.stats.size >= this.options.maxDomains) {
        throw new LimitError('too-many-domains', `More than ${this.options.maxDomains} distinct domains; raise the limit with --max-domains.`);
      }
      s = { size: 0n, records: 0, byModality: new Map() };
      this.stats.set(domain, s);
    }
    s.size += record.size;
    s.records++;
    const modality = record.modality ?? 'unspecified';
    s.byModality.set(modality, (s.byModality.get(modality) ?? 0n) + record.size);
  }

  /** Builds the report. */
  report(): DomainReport {
    const o = this.options;
    const groups: DomainGroup[] = [];
    const chosen = new Set<string>();
    let total = 0n;
    for (const s of this.stats.values()) total += s.size;
    const groupInputs: [string, [string, bigint][]][] = [];
    if (o.modalityMode === 'combined') {
      groupInputs.push(['all', [...this.stats].map(([d, s]) => [d, s.size])]);
    } else {
      const modalities = new Set<string>();
      for (const s of this.stats.values()) for (const m of s.byModality.keys()) modalities.add(m);
      for (const m of [...modalities].sort()) {
        const entries: [string, bigint][] = [];
        for (const [d, s] of this.stats) {
          const v = s.byModality.get(m);
          if (v !== undefined && v > 0n) entries.push([d, v]);
        }
        groupInputs.push([m, entries]);
      }
    }
    for (const [modality, entries] of groupInputs) {
      const { selected, required, cutoff } = selectTop(entries, o.sme, o.ties);
      let size = 0n;
      for (const [, v] of entries) size += v;
      for (const d of selected) chosen.add(d);
      groups.push({ modality, domains: entries.length, size: size.toString(), required, cutoff_size: cutoff.toString(), selected: selected.length });
    }
    const ordered = [...chosen].map((d): [string, bigint] => [d, this.stats.get(d)?.size ?? 0n]).sort(compareEntries);
    const domains: RankedDomain[] = ordered.map(([d, size], i) => {
      const s = this.stats.get(d);
      return {
        rank: i + 1,
        domain: d,
        size: size.toString(),
        share_percent: sharePercent(size, total),
        records: s?.records ?? 0,
        modalities: s === undefined ? [] : [...s.byModality.keys()].sort(),
      };
    });
    return {
      kind: 'sourcebook-domain-report',
      version: 1,
      generator: GENERATOR,
      method: {
        grouping: 'registrable-domain',
        public_suffix_list: this.psl.version,
        private_suffixes: o.includePrivateSuffixes,
        threshold: o.sme ? 'sme-top-5-percent-or-1000' : 'top-10-percent',
        ties: o.ties,
        modality_mode: o.modalityMode,
        size_unit: o.sizeUnit,
        size_measure: o.sizeMeasure,
      },
      records: { read: this.read, counted: this.counted, skipped: { ...this.skipped } },
      collection_period: { from: this.minMonth, to: this.maxMonth },
      totals: { domains: this.stats.size, size: total.toString() },
      groups,
      domains,
    };
  }
}

/**
 * Cache key for a URL: scheme and authority only, so paths do not fill the
 * cache. Null (no caching) when the result could depend on more than that.
 */
function cacheKey(url: string): string | null {
  if (url.length === 0 || url.length > MAX_URL_LENGTH) return null;
  const m = /^[A-Za-z][A-Za-z0-9+.-]*:\/\/[^/?#]*/.exec(url);
  return m === null ? null : `u:${m[0]}`;
}
