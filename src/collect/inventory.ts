// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The inventory: what the collectors found about the training data, before
 * it becomes a summary. It holds facts (names, links, modalities, sizes,
 * licences, domain ranking), never narrative. `prefillSummary` copies the
 * facts into the structured fields of a summary and leaves every narrative
 * field for the provider to write.
 */

import { CHECKBOX_MODALITIES, SIZE_RANGE_BOUNDS, STANDARD_MODALITIES, type CheckboxModality, type StandardModality } from '../spec/template.js';
import { DOMAIN_RE, MONTH_RE, isLink } from '../schema/checks.js';
import { Reader, SchemaError } from '../schema/parse.js';
import { emptySummary } from '../schema/empty.js';
import type { Summary } from '../schema/types.js';
import type { DomainReport } from '../domains/rank.js';
import { sharePercent } from '../domains/rank.js';
import { GENERATOR } from '../version.js';

/** Template category a dataset belongs to (Sections 2.1, 2.2.1, 2.2.2, 2.5, 2.6). */
export const CATEGORIES = ['public', 'licensed', 'private', 'synthetic', 'other'] as const;
export type DatasetCategory = (typeof CATEGORIES)[number];

export interface DatasetSize {
  /** "text", "image", "audio", "video" or another modality name. */
  modality: string;
  /** Non-negative integer as a decimal string. */
  value: string;
  /** "tokens", "images", "hours", "bytes", "examples", ... */
  unit: string;
  /** Where the number comes from, e.g. "dataset_info.dataset_size". */
  basis: string;
  /** True when the size is measured after pre-processing, as Section 2.1 asks. */
  after_preprocessing: boolean;
}

export interface InventoryDataset {
  /** Stable id, e.g. "hf:allenai/c4" or "manifest:corpus-a". */
  id: string;
  name: string;
  link: string;
  /** Suggested template category; null when unknown. */
  category: DatasetCategory | null;
  modalities: string[];
  languages: string[];
  licenses: string[];
  sizes: DatasetSize[];
  collection_period: { start: string | null; end: string | null };
  /** For private datasets: whether the dataset is publicly known (Section 2.2.2). */
  publicly_known: boolean | null;
  source: { kind: string; reference: string; revision: string | null };
  /** Facts the provider should review, e.g. "gated on the Hub". */
  notes: string[];
}

export interface Inventory {
  kind: 'sourcebook-inventory';
  version: 1;
  generator: string;
  datasets: InventoryDataset[];
  domain_report: DomainReport | null;
}

/** An empty inventory. */
export function newInventory(): Inventory {
  return { kind: 'sourcebook-inventory', version: 1, generator: GENERATOR, datasets: [], domain_report: null };
}

/** Merges inventories. Datasets with the same id: the later one wins. A later domain report replaces an earlier one. */
export function mergeInventories(list: readonly Inventory[]): Inventory {
  const out = newInventory();
  const byId = new Map<string, InventoryDataset>();
  for (const inv of list) {
    for (const d of inv.datasets) byId.set(d.id, d);
    if (inv.domain_report !== null) out.domain_report = inv.domain_report;
  }
  out.datasets = [...byId.values()];
  return out;
}

const NAME_MAX = 1000;

function strList(r: Reader, v: unknown, path: string, max = 1000): string[] {
  return r.list(v, path, max).map((x, i) => r.short(x, `${path}[${i}]`)).filter((s) => s !== '');
}

/**
 * Validates an inventory read from a file (it may have been edited by hand).
 *
 * @throws SchemaError listing every structural problem.
 */
export function parseInventory(data: unknown): Inventory {
  const r = new Reader();
  const top = r.obj(data, '', ['kind', 'version', 'generator', 'datasets', 'domain_report']);
  if (top.kind !== 'sourcebook-inventory' || top.version !== 1) r.issue('kind', 'bad-version');
  const datasets: InventoryDataset[] = r.list(top.datasets, 'datasets', 100_000).map((v, i) => {
    const p = `datasets[${i}]`;
    const o = r.obj(v, p, ['id', 'name', 'link', 'category', 'modalities', 'languages', 'licenses', 'sizes', 'collection_period', 'publicly_known', 'source', 'notes']);
    const cp = r.obj(o.collection_period, `${p}.collection_period`, ['start', 'end']);
    const src = r.obj(o.source, `${p}.source`, ['kind', 'reference', 'revision']);
    const sizes: DatasetSize[] = r.list(o.sizes, `${p}.sizes`, 100).map((sv, j) => {
      const sp = `${p}.sizes[${j}]`;
      const so = r.obj(sv, sp, ['modality', 'value', 'unit', 'basis', 'after_preprocessing']);
      const value = r.short(so.value, `${sp}.value`);
      if (!/^[0-9]{1,30}$/.test(value)) r.issue(`${sp}.value`, 'not-string');
      return {
        modality: r.short(so.modality, `${sp}.modality`).toLowerCase(),
        value,
        unit: r.short(so.unit, `${sp}.unit`).toLowerCase(),
        basis: r.short(so.basis, `${sp}.basis`),
        after_preprocessing: r.bool(so.after_preprocessing, `${sp}.after_preprocessing`) ?? false,
      };
    });
    const link = r.link(o.link, `${p}.link`);
    const id = r.short(o.id, `${p}.id`);
    if (id === '') r.issue(`${p}.id`, 'not-string');
    return {
      id,
      name: r.text(o.name, `${p}.name`, NAME_MAX),
      link,
      category: r.choice(o.category, `${p}.category`, CATEGORIES),
      modalities: strList(r, o.modalities, `${p}.modalities`, 20).map((m) => m.toLowerCase()),
      languages: strList(r, o.languages, `${p}.languages`),
      licenses: strList(r, o.licenses, `${p}.licenses`, 100),
      sizes,
      collection_period: { start: monthOrNull(r, cp.start, `${p}.collection_period.start`), end: monthOrNull(r, cp.end, `${p}.collection_period.end`) },
      publicly_known: r.bool(o.publicly_known, `${p}.publicly_known`),
      source: { kind: r.short(src.kind, `${p}.source.kind`), reference: r.short(src.reference, `${p}.source.reference`), revision: nullIfEmpty(r.short(src.revision, `${p}.source.revision`)) },
      notes: strList(r, o.notes, `${p}.notes`, 100),
    };
  });
  const report = top.domain_report === undefined || top.domain_report === null ? null : parseDomainReport(r, top.domain_report);
  if (r.issues.length > 0) throw new SchemaError(r.issues);
  return { kind: 'sourcebook-inventory', version: 1, generator: GENERATOR, datasets, domain_report: report };
}

function nullIfEmpty(s: string): string | null {
  return s === '' ? null : s;
}

function monthOrNull(r: Reader, v: unknown, path: string): string | null {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string' || !MONTH_RE.test(v)) {
    r.issue(path, 'bad-month');
    return null;
  }
  return v;
}

/** Reads the parts of a domain report that Sourcebook uses again (method and ranked domains). */
function parseDomainReport(r: Reader, value: unknown): DomainReport {
  const P = 'domain_report';
  const o = r.obj(value, P, ['kind', 'version', 'generator', 'method', 'records', 'collection_period', 'totals', 'groups', 'domains']);
  if (o.kind !== 'sourcebook-domain-report' || o.version !== 1) r.issue(`${P}.kind`, 'bad-version');
  const m = r.obj(o.method, `${P}.method`, ['grouping', 'public_suffix_list', 'private_suffixes', 'threshold', 'ties', 'modality_mode', 'size_unit', 'size_measure']);
  const cp = r.obj(o.collection_period, `${P}.collection_period`, ['from', 'to']);
  const domains = r.list(o.domains, `${P}.domains`, 50_000_000).map((v, i) => {
    const p = `${P}.domains[${i}]`;
    const d = r.obj(v, p, ['rank', 'domain', 'size', 'share_percent', 'records', 'modalities']);
    const domain = r.short(d.domain, `${p}.domain`);
    if (!DOMAIN_RE.test(domain)) r.issue(`${p}.domain`, 'bad-domain');
    const rank = typeof d.rank === 'number' && Number.isSafeInteger(d.rank) && d.rank > 0 ? d.rank : i + 1;
    const size = r.short(d.size, `${p}.size`);
    const records = typeof d.records === 'number' && Number.isSafeInteger(d.records) && d.records >= 0 ? d.records : 0;
    return { rank, domain, size: /^[0-9]{1,30}$/.test(size) ? size : '0', share_percent: r.short(d.share_percent, `${p}.share_percent`), records, modalities: strList(r, d.modalities, `${p}.modalities`, 20) };
  });
  const threshold = r.choice(m.threshold, `${P}.method.threshold`, ['top-10-percent', 'sme-top-5-percent-or-1000'] as const) ?? 'top-10-percent';
  return {
    kind: 'sourcebook-domain-report',
    version: 1,
    generator: r.short(o.generator, `${P}.generator`),
    method: {
      grouping: 'registrable-domain',
      public_suffix_list: r.short(m.public_suffix_list, `${P}.method.public_suffix_list`),
      private_suffixes: r.bool(m.private_suffixes, `${P}.method.private_suffixes`) ?? false,
      threshold,
      ties: r.choice(m.ties, `${P}.method.ties`, ['include', 'cut'] as const) ?? 'include',
      modality_mode: r.choice(m.modality_mode, `${P}.method.modality_mode`, ['combined', 'per-modality'] as const) ?? 'combined',
      size_unit: r.short(m.size_unit, `${P}.method.size_unit`),
      size_measure: r.short(m.size_measure, `${P}.method.size_measure`),
    },
    records: { read: 0, counted: 0, skipped: { invalid_url: 0, not_http: 0, ip_address: 0, invalid_host: 0, public_suffix_only: 0, zero_size: 0 } },
    collection_period: { from: monthOrNull(r, cp.from, `${P}.collection_period.from`), to: monthOrNull(r, cp.to, `${P}.collection_period.to`) },
    totals: { domains: domains.length, size: '0' },
    groups: [],
    domains,
  };
}

/** Result of the "large dataset" rule of Section 2.1 for one modality. */
export interface LargeDatasetResult {
  modality: string;
  /** Unit shared by all sizes, or null when not determined. */
  unit: string | null;
  total: string;
  /** False when some publicly available dataset of this modality has no comparable size. */
  determined: boolean;
  /** Ids of datasets without a comparable size. */
  missing: string[];
  /** True when any size used was not measured after pre-processing. */
  before_preprocessing: boolean;
  large: { id: string; name: string; size: string; share_percent: string }[];
}

/**
 * Section 2.1: "A dataset is considered to be “large” if the total data size
 * for any one of the modalities contained in the dataset exceeds 3% of the
 * size of all publicly available datasets for that modality used for
 * training." Applied to the datasets of category "public".
 */
export function largeDatasets(datasets: readonly InventoryDataset[]): LargeDatasetResult[] {
  const pub = datasets.filter((d) => d.category === 'public');
  const modalities = new Set<string>();
  for (const d of pub) for (const m of d.modalities) modalities.add(m);
  const results: LargeDatasetResult[] = [];
  for (const modality of [...modalities].sort()) {
    const members = pub.filter((d) => d.modalities.includes(modality));
    const sized: { d: InventoryDataset; size: bigint; unit: string; pre: boolean }[] = [];
    const missing: string[] = [];
    for (const d of members) {
      const s = d.sizes.find((x) => x.modality === modality);
      if (s === undefined || !/^[0-9]{1,30}$/.test(s.value)) missing.push(d.id);
      else sized.push({ d, size: BigInt(s.value), unit: s.unit, pre: !s.after_preprocessing });
    }
    const units = new Set(sized.map((x) => x.unit));
    let total = 0n;
    for (const x of sized) total += x.size;
    const determined = missing.length === 0 && units.size <= 1;
    const large = determined
      ? sized
          .filter((x) => x.size * 100n > total * 3n)
          .sort((a, b) => (a.size === b.size ? (a.d.id < b.d.id ? -1 : 1) : a.size > b.size ? -1 : 1))
          .map((x) => ({ id: x.d.id, name: x.d.name, size: x.size.toString(), share_percent: sharePercent(x.size, total) }))
      : [];
    results.push({
      modality,
      unit: units.size === 1 ? ([...units][0] ?? null) : null,
      total: total.toString(),
      determined,
      missing: units.size > 1 ? sized.map((x) => x.d.id).concat(missing) : missing,
      before_preprocessing: sized.some((x) => x.pre),
      large,
    });
  }
  return results;
}

function checkboxModalities(mods: Iterable<string>): { selected: CheckboxModality[]; other: string } {
  const set = new Set(mods);
  const selected = CHECKBOX_MODALITIES.filter((m) => set.has(m));
  const other = [...set].filter((m) => !(CHECKBOX_MODALITIES as readonly string[]).includes(m)).sort();
  return { selected, other: other.join(', ') };
}

/** The Section 1.3 size range for a total, when the unit matches the template's unit for the modality. */
export function sizeRangeFor(modality: StandardModality, total: bigint, unit: string): string | null {
  const b = SIZE_RANGE_BOUNDS[modality];
  if (unit !== b.unit) return null;
  const ids = { text: ['below_1b_tokens', '1b_to_10t_tokens', 'above_10t_tokens'], image: ['below_1m_images', '1m_to_1b_images', 'above_1b_images'], audio: ['below_10k_hours', '10k_to_1m_hours', 'above_1m_hours'], video: ['below_10k_hours', '10k_to_1m_hours', 'above_1m_hours'] }[modality];
  if (total < b.low) return ids[0] ?? null;
  if (total <= b.high) return ids[1] ?? null;
  return ids[2] ?? null;
}

/** Facts for narrative fields, offered as comments in the generated YAML (never as answers). */
export interface PrefillHints {
  [path: string]: string[];
}

/**
 * Fills the structured fields of `base` (or of an empty summary) from an
 * inventory. Only empty fields are filled; nothing the provider wrote is
 * changed. Narrative fields are never filled: facts that may help to write
 * them are returned as `hints`.
 */
export function prefillSummary(inventory: Inventory, base: Summary = emptySummary()): { summary: Summary; hints: PrefillHints } {
  const s = structuredClone(base);
  const hints: PrefillHints = {};
  const hint = (path: string, text: string): void => {
    (hints[path] ??= []).push(text);
  };
  const ds = inventory.datasets;
  const byCat = (c: DatasetCategory): InventoryDataset[] => ds.filter((d) => d.category === c);
  const all = new Set<string>();
  for (const d of ds) for (const m of d.modalities) all.add(m);
  const report = inventory.domain_report;
  if (report !== null) for (const d of report.domains) for (const m of d.modalities) if (m !== 'unspecified') all.add(m);

  // 1.3 Modalities and sizes.
  const gi = s.general_information;
  for (const m of STANDARD_MODALITIES) {
    const row = gi.modalities[m];
    if (all.has(m) && row.present === null) row.present = true;
    else if (all.has(m) && row.present === false) hint(`general_information.modalities.${m}.present`, `The inventory has ${m} data, but this modality is not selected.`);
    if (row.present === true && row.size_range === null) {
      const sizes = ds.map((d) => d.sizes.find((x) => x.modality === m)).filter((x) => x !== undefined);
      const withModality = ds.filter((d) => d.modalities.includes(m));
      const units = new Set(sizes.map((x) => x.unit));
      if (sizes.length === withModality.length && units.size === 1 && withModality.length > 0 && report === null) {
        let total = 0n;
        for (const x of sizes) total += BigInt(x.value);
        const range = sizeRangeFor(m, total, [...units][0] ?? '');
        if (range !== null) row.size_range = range;
      }
      if (row.size_range === null) hint(`general_information.modalities.${m}.size_range`, 'The inventory has no complete size in the template unit for this modality; estimate the range.');
    }
  }
  const otherMods = [...all].filter((m) => !(STANDARD_MODALITIES as readonly string[]).includes(m) && m !== 'unspecified').sort();
  if (otherMods.length > 0) hint('general_information.modalities.other', `Other modalities found in the inventory: ${otherMods.join(', ')}.`);
  const languages = new Set<string>();
  for (const d of ds) for (const l of d.languages) languages.add(l);
  if (languages.size > 0) hint('general_information.linguistic_characteristics', `Languages listed in dataset metadata: ${[...languages].sort().join(', ')}.`);
  const months = ds.flatMap((d) => [d.collection_period.end, d.collection_period.start]).filter((x): x is string => x !== null);
  if (report?.collection_period.to != null) months.push(report.collection_period.to);
  if (months.length > 0) hint('general_information.latest_data_collection.date', `Latest month found in the inventory: ${months.sort().at(-1) ?? ''}.`);

  // 2.1 Publicly available datasets.
  const pub = byCat('public');
  const pd = s.data_sources.public_datasets;
  if (pub.length > 0 && pd.used === false) hint('data_sources.public_datasets.used', `The inventory has ${pub.length} publicly available datasets, but the answer here is No.`);
  if (pub.length > 0 && pd.used !== false) {
    if (pd.used === null) pd.used = true;
    if (pd.modalities.selected.length === 0 && pd.modalities.other === '') pd.modalities = checkboxModalities(pub.flatMap((d) => d.modalities));
    const results = largeDatasets(ds);
    const largeIds = new Set(results.flatMap((r) => r.large.map((x) => x.id)));
    if (pd.large_datasets.length === 0) {
      for (const d of pub.filter((x) => largeIds.has(x.id))) {
        pd.large_datasets.push({
          name: d.name,
          link: d.link,
          description: '',
          collection_period: { start: d.collection_period.start, end: d.collection_period.end },
          selection_approach: '',
        });
      }
    }
    for (const r of results) {
      if (!r.determined) hint('data_sources.public_datasets.large_datasets', `Large datasets for ${r.modality} could not be determined: sizes are missing or in different units for ${r.missing.join(', ')}.`);
      if (r.before_preprocessing) hint('data_sources.public_datasets.large_datasets', `Some ${r.modality} sizes were not measured after pre-processing; the template asks for sizes after pre-processing.`);
    }
    const others = pub.filter((x) => !largeIds.has(x.id));
    if (others.length > 0) hint('data_sources.public_datasets.other_datasets_description', `Publicly available datasets not listed as large: ${others.map((d) => d.name).join(', ')}.`);
  }
  // 2.2.1 Licensed.
  const lic = byCat('licensed');
  const ld = s.data_sources.licensed_datasets;
  if (lic.length > 0 && ld.concluded === false) hint('data_sources.licensed_datasets.concluded', `The inventory has ${lic.length} licensed datasets, but the answer here is No.`);
  if (lic.length > 0 && ld.concluded !== false) {
    if (ld.concluded === null) ld.concluded = true;
    if (ld.modalities.selected.length === 0 && ld.modalities.other === '') ld.modalities = checkboxModalities(lic.flatMap((d) => d.modalities));
  }
  // 2.2.2 Other private datasets.
  const priv = byCat('private');
  const op = s.data_sources.other_private_datasets;
  if (priv.length > 0 && op.obtained === false) hint('data_sources.other_private_datasets.obtained', `The inventory has ${priv.length} private datasets from third parties, but the answer here is No.`);
  if (priv.length > 0 && op.obtained !== false) {
    if (op.obtained === null) op.obtained = true;
    if (op.modalities.selected.length === 0 && op.modalities.other === '') op.modalities = checkboxModalities(priv.flatMap((d) => d.modalities));
    if (op.publicly_known_datasets.length === 0) for (const d of priv.filter((x) => x.publicly_known === true)) op.publicly_known_datasets.push({ name: d.name, link: d.link });
    const unknown = priv.filter((x) => x.publicly_known !== true);
    if (unknown.length > 0) hint('data_sources.other_private_datasets.non_publicly_known_description', `Private datasets not marked as publicly known: ${unknown.length}.`);
  }
  // 2.3 Crawled data.
  const cd = s.data_sources.crawled_data;
  if (report !== null && cd.crawlers_used === false) hint('data_sources.crawled_data.crawlers_used', 'The inventory has a domain report from crawl logs, but the answer here is No.');
  if (report !== null && cd.crawlers_used !== false) {
    if (cd.crawlers_used === null) cd.crawlers_used = true;
    if (cd.collection_period.from === null && report.collection_period.from !== null) cd.collection_period.from = report.collection_period.from;
    if (cd.collection_period.to === null && report.collection_period.to !== null) cd.collection_period.to = report.collection_period.to;
    if (cd.modalities.selected.length === 0 && cd.modalities.other === '') {
      cd.modalities = checkboxModalities(report.domains.flatMap((d) => d.modalities).filter((m) => m !== 'unspecified'));
    }
    if (cd.top_domains.domains.length === 0) cd.top_domains.domains = report.domains.map((d) => d.domain);
    hint(
      'data_sources.crawled_data.top_domains',
      `Domain list from the crawl logs: ${report.domains.length} domains (${report.method.threshold}, ties ${report.method.ties}, sizes in ${report.method.size_unit}, Public Suffix List ${report.method.public_suffix_list}).`,
    );
  }
  // 2.5 Synthetic data.
  const syn = byCat('synthetic');
  const sd = s.data_sources.synthetic_data;
  if (syn.length > 0 && sd.created === false) hint('data_sources.synthetic_data.created', `The inventory has ${syn.length} synthetic datasets, but the answer here is No.`);
  if (syn.length > 0 && sd.created !== false) {
    if (sd.created === null) sd.created = true;
    if (sd.modalities.selected.length === 0 && sd.modalities.other === '') sd.modalities = checkboxModalities(syn.flatMap((d) => d.modalities));
    hint('data_sources.synthetic_data.market_models', `Synthetic datasets in the inventory: ${syn.map((d) => d.name).join(', ')}. Name the models used to generate them.`);
  }
  // 2.6 Other sources.
  const oth = byCat('other');
  if (oth.length > 0 && s.data_sources.other_sources.used === false) hint('data_sources.other_sources.used', `The inventory has ${oth.length} datasets of other sources, but the answer here is No.`);
  if (oth.length > 0 && s.data_sources.other_sources.used !== false) {
    if (s.data_sources.other_sources.used === null) s.data_sources.other_sources.used = true;
    hint('data_sources.other_sources.description', `Other datasets in the inventory: ${oth.map((d) => d.name).join(', ')}.`);
  }
  const unc = ds.filter((d) => d.category === null);
  if (unc.length > 0) hint('data_sources', `Datasets without a category (assign each to one Section of the template): ${unc.map((d) => d.name).join(', ')}.`);
  for (const d of ds) for (const n of d.notes) hint('data_sources', `${d.name}: ${n}`);
  return { summary: s, hints };
}

/** True when a dataset link is safe to copy into a summary. */
export function usableLink(link: string): boolean {
  return link === '' || isLink(link);
}
