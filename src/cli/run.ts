// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The `sourcebook` command line tool: init, collect, validate, render.
 * `run` takes the arguments and an output sink and returns the exit code:
 * 0 success, 1 validation failed, 2 usage or input error.
 */

import { basename, dirname, resolve } from 'node:path';
import { YamlError } from '../yaml/parse.js';
import { summaryToYaml } from '../yaml/emit.js';
import { SchemaError, type SchemaIssue } from '../schema/parse.js';
import { JsonInputError, parseJsonSafe, parseSummaryText } from '../schema/load.js';
import { emptySummary } from '../schema/empty.js';
import { isIsoDate } from '../schema/checks.js';
import type { Summary } from '../schema/types.js';
import { CATEGORIES, mergeInventories, newInventory, parseInventory, prefillSummary, type DatasetCategory, type Inventory, type InventoryDataset } from '../collect/inventory.js';
import { datasetFromHfCard, isRepoId } from '../collect/hf-card.js';
import { fetchHubDataset, HubError, type HubOptions } from '../collect/hf-hub.js';
import { datasetFromParquet, datasetsFromCsvManifest, datasetsFromJsonManifest, parquetFooterLength, parseParquetFooter, ParquetError, PARQUET_FOOTER_DEFAULT } from '../collect/manifest.js';
import { DomainRanker, LimitError, MAX_DOMAINS_LIMIT } from '../domains/rank.js';
import { CrawlLogError, DEFAULT_READER_LIMITS, readCdx, readCdxj, readCsv, readWarc, type FilterCounts } from '../domains/readers.js';
import { validateSummary, type ValidationResult } from '../validate/validate.js';
import { renderMarkdown } from '../render/markdown.js';
import { renderHtml } from '../render/html.js';
import { renderJson } from '../render/json.js';
import { insertIntoModelCard, modelCardSnippet } from '../render/model-card.js';
import { ATTRIBUTION, ATTRIBUTION_URL, GENERATOR, VERSION } from '../version.js';
import { InputError, readByteStream, readRange, readTextFile, writeTextFile } from './node-io.js';

export interface Output {
  stdout(text: string): void;
  stderr(text: string): void;
}

export interface RunOptions {
  /** Fetch implementation for `collect hf --online` (tests). */
  readonly fetch?: HubOptions['fetch'];
  /** Today's date for validation (tests). */
  readonly today?: string;
}

const MAX_SUMMARY_BYTES = 8 * 1024 * 1024;
const MAX_CARD_BYTES = 4 * 1024 * 1024;
const MAX_INVENTORY_BYTES = 256 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 64 * 1024 * 1024;

class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}

/** Replaces control, invisible and bidirectional characters before printing to a terminal. */
export function clean(s: string): string {
  // eslint-disable-next-line no-control-regex -- removing control characters is the purpose
  return s.replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u061c\u200b-\u200f\u2028\u2029\u202a-\u202e\u2060-\u2069\ufeff]/g, '?');
}

export const HELP = `Sourcebook ${VERSION}: the public summary of training content (AI Act Article 53(1)(d)).

Usage:
  sourcebook init [--out FILE] [--from INVENTORY.json ...] [--base SUMMARY] [--format yaml|json] [--force]
  sourcebook collect hf <README.md ...> [--id OWNER/NAME] [--category CAT] [--out FILE] [--force]
  sourcebook collect hf --online <OWNER/NAME ...> [--revision REV] [--timeout SECONDS] [--category CAT] [--out FILE]
  sourcebook collect manifest <FILE.json|FILE.csv ...> [--out FILE] [--force]
  sourcebook collect manifest <FILE.parquet ...> --name NAME [--category CAT] [--modality M] [--link URL] [--out FILE]
  sourcebook collect crawl <FILE ...> [--format auto|warc|cdx|cdxj|csv] [--sme] [--ties include|cut]
        [--modality-mode combined|per-modality] [--private-suffixes] [--max-domains N] [--max-records N]
        [--csv-url COL | --csv-host COL] [--csv-size COL] [--csv-modality COL] [--csv-date COL]
        [--csv-delimiter comma|tab] [--unit UNIT] [--out FILE] [--list-out FILE] [--force]
  sourcebook validate <SUMMARY> [--inventory FILE ...] [--as-of YYYY-MM-DD] [--strict] [--format text|json]
  sourcebook render <SUMMARY> [--format markdown|html|print-html|json|model-card] [--out FILE] [--force]
        [--instructions] [--allow-invalid] [--summary-url URL] [--mode link|full] [--readme README.md]

Categories: ${CATEGORIES.join(', ')}.
Network access happens only with "collect hf --online", and only to https://huggingface.co.
Exit codes: 0 success, 1 validation failed, 2 usage or input error.

${ATTRIBUTION} (${ATTRIBUTION_URL}). Licence: AGPL-3.0-only. Not legal advice.
`;

interface Parsed {
  positional: string[];
  flags: Map<string, string[]>;
}

const BOOLEAN_FLAGS = new Set(['force', 'online', 'sme', 'private-suffixes', 'strict', 'instructions', 'allow-invalid', 'help', 'version']);

function parseArgs(args: readonly string[], allowed: readonly string[]): Parsed {
  const positional: string[] = [];
  const flags = new Map<string, string[]>();
  for (let i = 0; i < args.length; i++) {
    const a = args[i] ?? '';
    if (a === '--') {
      positional.push(...args.slice(i + 1));
      break;
    }
    if (!a.startsWith('--')) {
      positional.push(a);
      continue;
    }
    const eq = a.indexOf('=');
    const name = eq < 0 ? a.slice(2) : a.slice(2, eq);
    if (!allowed.includes(name)) throw new UsageError(`Unknown option --${clean(name.slice(0, 40))}.`);
    let value: string;
    if (BOOLEAN_FLAGS.has(name)) {
      if (eq >= 0) throw new UsageError(`--${name} takes no value.`);
      value = 'true';
    } else if (eq >= 0) value = a.slice(eq + 1);
    else {
      const next = args[i + 1];
      if (next === undefined) throw new UsageError(`--${name} needs a value.`);
      value = next;
      i++;
    }
    const list = flags.get(name) ?? [];
    list.push(value);
    flags.set(name, list);
  }
  return { positional, flags };
}

function one(p: Parsed, name: string): string | undefined {
  const v = p.flags.get(name);
  if (v === undefined) return undefined;
  if (v.length > 1) throw new UsageError(`--${name} is given more than once.`);
  return v[0];
}

function flag(p: Parsed, name: string): boolean {
  return p.flags.has(name);
}

function choice<T extends string>(p: Parsed, name: string, choices: readonly T[], fallback: T): T {
  const v = one(p, name);
  if (v === undefined) return fallback;
  if (!(choices as readonly string[]).includes(v)) throw new UsageError(`--${name} must be one of: ${choices.join(', ')}.`);
  return v as T;
}

function positiveInt(p: Parsed, name: string, fallback: number, max: number): number {
  const v = one(p, name);
  if (v === undefined) return fallback;
  if (!/^[0-9]{1,12}$/.test(v) || Number(v) < 1 || Number(v) > max) throw new UsageError(`--${name} must be a whole number from 1 to ${max}.`);
  return Number(v);
}

function category(p: Parsed): DatasetCategory | null | undefined {
  const v = one(p, 'category');
  if (v === undefined) return undefined;
  if (v === 'none') return null;
  if (!(CATEGORIES as readonly string[]).includes(v)) throw new UsageError(`--category must be one of: ${CATEGORIES.join(', ')}, none.`);
  return v as DatasetCategory;
}

async function emit(out: Output, p: Parsed, text: string): Promise<void> {
  const file = one(p, 'out');
  if (file === undefined) out.stdout(text);
  else await writeTextFile(file, text, flag(p, 'force'));
}

async function loadSummary(path: string): Promise<Summary> {
  const text = await readTextFile(path, MAX_SUMMARY_BYTES);
  return parseSummaryText(text, path.toLowerCase().endsWith('.json') ? 'json' : 'auto');
}

async function loadInventories(paths: readonly string[]): Promise<Inventory> {
  const list: Inventory[] = [];
  for (const path of paths) list.push(parseInventory(parseJsonSafe(await readTextFile(path, MAX_INVENTORY_BYTES))));
  return mergeInventories(list);
}

function inventoryText(inv: Inventory): string {
  return `${JSON.stringify(inv, null, 2)}\n`;
}

async function cmdInit(args: readonly string[], out: Output): Promise<number> {
  const p = parseArgs(args, ['out', 'from', 'base', 'format', 'force']);
  if (p.positional.length > 0) throw new UsageError('init takes no file arguments; use --from and --base.');
  const format = choice(p, 'format', ['yaml', 'json'] as const, 'yaml');
  const base = one(p, 'base');
  let summary = base === undefined ? emptySummary() : await loadSummary(base);
  let hints = {};
  const from = p.flags.get('from') ?? [];
  if (from.length > 0) {
    const r = prefillSummary(await loadInventories(from), summary);
    summary = r.summary;
    hints = r.hints;
  }
  await emit(out, p, format === 'json' ? renderJson(summary) : summaryToYaml(summary, hints));
  return 0;
}

async function cmdCollectHf(args: readonly string[], out: Output, options: RunOptions): Promise<number> {
  const p = parseArgs(args, ['online', 'revision', 'timeout', 'id', 'category', 'out', 'force']);
  if (p.positional.length === 0) throw new UsageError('collect hf needs at least one dataset id or README.md file.');
  const cat = category(p);
  const inv = newInventory();
  const datasets: InventoryDataset[] = [];
  if (flag(p, 'online')) {
    const timeout = positiveInt(p, 'timeout', 15, 120);
    const revision = one(p, 'revision');
    for (const id of p.positional) {
      if (!isRepoId(id)) throw new UsageError(`Not a Hugging Face dataset id: ${clean(id.slice(0, 100))}.`);
      const hub = await fetchHubDataset(id, { timeoutMs: timeout * 1000, ...(revision === undefined ? {} : { revision }), ...(options.fetch === undefined ? {} : { fetch: options.fetch }) });
      datasets.push(datasetFromHfCard({ id, api: hub.api, readme: hub.readme, reference: hub.reference }));
    }
  } else {
    if (one(p, 'revision') !== undefined || one(p, 'timeout') !== undefined) throw new UsageError('--revision and --timeout need --online.');
    const id = one(p, 'id');
    if (id !== undefined && (!isRepoId(id) || p.positional.length !== 1)) throw new UsageError('--id needs one README.md file and a valid "owner/name" id.');
    for (const path of p.positional) {
      const text = await readTextFile(path, MAX_CARD_BYTES);
      datasets.push(datasetFromHfCard({ readme: text, reference: `${basename(dirname(resolve(path)))}/${basename(path)}`, ...(id === undefined ? {} : { id }) }));
    }
  }
  if (cat !== undefined) for (const d of datasets) d.category = cat;
  inv.datasets = datasets;
  await emit(out, p, inventoryText(inv));
  return 0;
}

async function cmdCollectManifest(args: readonly string[], out: Output): Promise<number> {
  const p = parseArgs(args, ['out', 'force', 'name', 'category', 'modality', 'link']);
  if (p.positional.length === 0) throw new UsageError('collect manifest needs at least one file.');
  const parquet = p.positional.filter((f) => f.toLowerCase().endsWith('.parquet'));
  const others = p.positional.filter((f) => !f.toLowerCase().endsWith('.parquet'));
  const datasets: InventoryDataset[] = [];
  for (const path of others) {
    const lower = path.toLowerCase();
    if (lower.endsWith('.json')) datasets.push(...datasetsFromJsonManifest(parseJsonSafe(await readTextFile(path, MAX_MANIFEST_BYTES)), basename(path)));
    else if (lower.endsWith('.csv')) datasets.push(...(await datasetsFromCsvManifest(readByteStream(path), basename(path))));
    else throw new UsageError(`Unknown manifest type: ${clean(basename(path).slice(0, 100))} (use .json, .csv or .parquet).`);
  }
  if (parquet.length > 0) {
    const name = one(p, 'name');
    if (name === undefined || name.trim() === '' || name.length > 200) throw new UsageError('Parquet files need --name (the dataset they belong to).');
    const facts = [];
    for (const path of parquet) {
      const tail = await readRange(path, 8, 8);
      const len = parquetFooterLength(tail.bytes, tail.size, PARQUET_FOOTER_DEFAULT);
      const head = await readRange(path, tail.size, 4);
      if (String.fromCharCode(...head.bytes) !== 'PAR1') throw new ParquetError('not-parquet', 'Not a Parquet file (no PAR1 marker at the start).');
      const footer = await readRange(path, len + 8, len);
      facts.push(parseParquetFooter(footer.bytes));
    }
    const modalities = p.flags.get('modality');
    const link = one(p, 'link');
    datasets.push(
      datasetFromParquet(facts, {
        name: name.trim(),
        reference: parquet.map((f) => basename(f)).join(', '),
        category: category(p) ?? null,
        ...(modalities === undefined ? {} : { modalities: modalities.map((m) => m.toLowerCase()) }),
        ...(link === undefined ? {} : { link }),
      }),
    );
  } else if (one(p, 'name') !== undefined || p.flags.has('modality') || one(p, 'link') !== undefined) {
    throw new UsageError('--name, --modality and --link apply to Parquet files only.');
  }
  const inv = newInventory();
  inv.datasets = datasets;
  await emit(out, p, inventoryText(inv));
  return 0;
}

type CrawlFormat = 'warc' | 'cdx' | 'cdxj' | 'csv';

function detectFormat(path: string): CrawlFormat | null {
  const n = path.toLowerCase().replace(/\.gz$/, '');
  if (n.endsWith('.warc') || n.endsWith('.wet')) return 'warc';
  if (n.endsWith('.cdxj')) return 'cdxj';
  if (n.endsWith('.cdx')) return 'cdx';
  if (n.endsWith('.csv') || n.endsWith('.tsv')) return 'csv';
  return null;
}

async function cmdCollectCrawl(args: readonly string[], out: Output): Promise<number> {
  const p = parseArgs(args, [
    'format',
    'sme',
    'ties',
    'modality-mode',
    'private-suffixes',
    'max-domains',
    'max-records',
    'csv-url',
    'csv-host',
    'csv-size',
    'csv-modality',
    'csv-date',
    'csv-delimiter',
    'unit',
    'out',
    'list-out',
    'force',
  ]);
  if (p.positional.length === 0) throw new UsageError('collect crawl needs at least one crawl log.');
  const forced = choice(p, 'format', ['auto', 'warc', 'cdx', 'cdxj', 'csv'] as const, 'auto');
  const formats = p.positional.map((f) => {
    const fmt = forced === 'auto' ? detectFormat(f) : forced;
    if (fmt === null) throw new UsageError(`Cannot tell the format of ${clean(basename(f).slice(0, 100))}; use --format.`);
    return fmt;
  });
  const kinds = new Set(formats);
  if (kinds.size > 1) throw new UsageError('All crawl logs of one run must have the same format (their sizes must be comparable).');
  const format = formats[0] ?? 'warc';
  const unit = one(p, 'unit') ?? 'bytes';
  if (!/^[a-z][a-z0-9 _-]{0,31}$/.test(unit)) throw new UsageError('--unit must be a short lower-case word, such as bytes or tokens.');
  if (format !== 'csv' && one(p, 'unit') !== undefined) throw new UsageError('--unit applies to CSV logs only (WARC and CDX sizes are bytes).');
  const csvFlags = ['csv-url', 'csv-host', 'csv-size', 'csv-modality', 'csv-date', 'csv-delimiter'];
  if (format !== 'csv' && csvFlags.some((f) => p.flags.has(f))) throw new UsageError('The --csv-* options apply to CSV logs only.');
  const measure = {
    warc: 'WARC record payload bytes (HTTP headers excluded; 2xx responses, resource and conversion records)',
    cdx: 'compressed WARC record length (CDX field S; 2xx or unknown status, revisits excluded)',
    cdxj: 'compressed WARC record length (CDXJ field length; 2xx or unknown status, revisits excluded)',
    csv: `${unit} as given in the CSV`,
  }[format];
  const ranker = new DomainRanker({
    sme: flag(p, 'sme'),
    ties: choice(p, 'ties', ['include', 'cut'] as const, 'include'),
    modalityMode: choice(p, 'modality-mode', ['combined', 'per-modality'] as const, 'combined'),
    includePrivateSuffixes: flag(p, 'private-suffixes'),
    sizeUnit: format === 'csv' ? unit : 'bytes',
    sizeMeasure: measure,
    maxDomains: positiveInt(p, 'max-domains', 5_000_000, MAX_DOMAINS_LIMIT),
  });
  const limits = { ...DEFAULT_READER_LIMITS, maxRecords: positiveInt(p, 'max-records', DEFAULT_READER_LIMITS.maxRecords, 10_000_000_000) };
  const filtered: FilterCounts = {};
  const urlCol = one(p, 'csv-url');
  const hostCol = one(p, 'csv-host');
  if (format === 'csv' && urlCol !== undefined && hostCol !== undefined) throw new UsageError('Give --csv-url or --csv-host, not both.');
  for (const path of p.positional) {
    const bytes = readByteStream(path);
    const records =
      format === 'warc'
        ? readWarc(bytes, filtered, {}, limits)
        : format === 'cdx'
          ? readCdx(bytes, filtered, limits)
          : format === 'cdxj'
            ? readCdxj(bytes, filtered, limits)
            : readCsv(
                bytes,
                {
                  ...(hostCol !== undefined ? { host: hostCol } : { url: urlCol ?? 'url' }),
                  size: one(p, 'csv-size') ?? 'size',
                  ...(one(p, 'csv-modality') === undefined ? {} : { modality: one(p, 'csv-modality') ?? '' }),
                  ...(one(p, 'csv-date') === undefined ? {} : { date: one(p, 'csv-date') ?? '' }),
                  delimiter: choice(p, 'csv-delimiter', ['comma', 'tab'] as const, path.toLowerCase().replace(/\.gz$/, '').endsWith('.tsv') ? 'tab' : 'comma') === 'tab' ? '\t' : ',',
                },
                filtered,
                limits,
              );
    for await (const r of records) ranker.add(r);
  }
  const report = ranker.report();
  const reportWithFiltered = { ...report, records: { ...report.records, filtered: Object.fromEntries(Object.entries(filtered).sort(([a], [b]) => (a < b ? -1 : 1))) } };
  const inv = { ...newInventory(), domain_report: reportWithFiltered };
  await emit(out, p, `${JSON.stringify(inv, null, 2)}\n`);
  const listOut = one(p, 'list-out');
  if (listOut !== undefined) {
    const header = `# Most relevant domain names crawled (${report.method.threshold === 'top-10-percent' ? 'top 10 %' : 'top 5 % or 1 000, whichever is lower'} of ${report.totals.domains} domains by ${report.method.size_measure}).\n# ${GENERATOR}\n`;
    await writeTextFile(listOut, `${header}${report.domains.map((d) => d.domain).join('\n')}\n`, flag(p, 'force'));
  }
  out.stderr(`Read ${report.records.read} records, counted ${report.records.counted}; ${report.totals.domains} domains; ${report.domains.length} listed.\n`);
  return 0;
}

function printIssues(out: Output, result: ValidationResult): void {
  for (const i of result.issues) out.stdout(`${i.severity.toUpperCase()} [${i.code}] ${clean(i.message)} (${clean(i.path.slice(0, 200))})\n`);
  out.stdout(`${result.errors} error${result.errors === 1 ? '' : 's'}, ${result.warnings} warning${result.warnings === 1 ? '' : 's'}.${result.ok ? ' The summary answers every required field of the template.' : ''}\n`);
}

async function cmdValidate(args: readonly string[], out: Output, options: RunOptions): Promise<number> {
  const p = parseArgs(args, ['inventory', 'as-of', 'strict', 'format']);
  if (p.positional.length !== 1) throw new UsageError('validate needs exactly one summary file.');
  const asOf = one(p, 'as-of') ?? options.today;
  if (asOf !== undefined && !isIsoDate(asOf)) throw new UsageError('--as-of must be a date as YYYY-MM-DD.');
  const format = choice(p, 'format', ['text', 'json'] as const, 'text');
  const summary = await loadSummary(p.positional[0] ?? '');
  const invPaths = p.flags.get('inventory') ?? [];
  const inventory = invPaths.length > 0 ? await loadInventories(invPaths) : undefined;
  const result = validateSummary(summary, { ...(asOf === undefined ? {} : { asOf }), ...(inventory === undefined ? {} : { inventory }) });
  if (format === 'json') out.stdout(`${JSON.stringify({ generator: GENERATOR, ...result }, null, 2)}\n`);
  else printIssues(out, result);
  return result.errors > 0 || (flag(p, 'strict') && result.warnings > 0) ? 1 : 0;
}

async function cmdRender(args: readonly string[], out: Output, options: RunOptions): Promise<number> {
  const p = parseArgs(args, ['format', 'out', 'force', 'instructions', 'allow-invalid', 'summary-url', 'mode', 'readme', 'lang']);
  if (p.positional.length !== 1) throw new UsageError('render needs exactly one summary file.');
  const format = choice(p, 'format', ['markdown', 'html', 'print-html', 'json', 'model-card'] as const, 'markdown');
  const summary = await loadSummary(p.positional[0] ?? '');
  const result = validateSummary(summary, options.today === undefined ? {} : { asOf: options.today });
  if (!result.ok && !flag(p, 'allow-invalid')) {
    printIssues(out, result);
    out.stderr('The summary is incomplete. Fix the errors, or use --allow-invalid to render a draft.\n');
    return 1;
  }
  if (!result.ok) out.stderr(`Rendering a draft: ${result.errors} error${result.errors === 1 ? '' : 's'} remain.\n`);
  const instructions = flag(p, 'instructions');
  let text: string;
  if (format === 'markdown') text = renderMarkdown(summary, { instructions });
  else if (format === 'html' || format === 'print-html') {
    const lang = one(p, 'lang');
    text = renderHtml(summary, { instructions, variant: format === 'html' ? 'screen' : 'print', ...(lang === undefined ? {} : { lang }) });
  } else if (format === 'json') text = renderJson(summary);
  else {
    const url = one(p, 'summary-url');
    if (url === undefined) throw new UsageError('--format model-card needs --summary-url (where the full summary is published).');
    const snippet = modelCardSnippet(summary, { summaryUrl: url, mode: choice(p, 'mode', ['link', 'full'] as const, 'link') });
    const readme = one(p, 'readme');
    text = readme === undefined ? snippet : insertIntoModelCard(await readTextFile(readme, MAX_CARD_BYTES), snippet);
  }
  await emit(out, p, text);
  return 0;
}

function describe(e: unknown): string {
  if (e instanceof SchemaError) {
    const shown = e.issues.slice(0, 50).map((i: SchemaIssue) => `  ${clean(i.path.slice(0, 200)) || '(top level)'}: ${i.message}`);
    const more = e.issues.length > 50 ? `\n  ... and ${e.issues.length - 50} more.` : '';
    return `${e.message}\n${shown.join('\n')}${more}`;
  }
  if (e instanceof YamlError || e instanceof JsonInputError || e instanceof InputError || e instanceof UsageError || e instanceof HubError || e instanceof CrawlLogError || e instanceof LimitError || e instanceof ParquetError) {
    return clean(e.message);
  }
  if (e instanceof RangeError) return clean(e.message);
  return 'Unexpected error.';
}

/**
 * Runs the command line tool.
 *
 * @returns the exit code.
 */
export async function run(argv: readonly string[], out: Output, options: RunOptions = {}): Promise<number> {
  const [command, ...rest] = argv;
  try {
    if (command === undefined || command === '--help' || command === 'help' || command === '-h') {
      out.stdout(HELP);
      return command === undefined ? 2 : 0;
    }
    if (command === '--version') {
      out.stdout(`${VERSION}\n`);
      return 0;
    }
    switch (command) {
      case 'init':
        return await cmdInit(rest, out);
      case 'collect': {
        const [kind, ...args] = rest;
        if (kind === 'hf') return await cmdCollectHf(args, out, options);
        if (kind === 'manifest') return await cmdCollectManifest(args, out);
        if (kind === 'crawl') return await cmdCollectCrawl(args, out);
        throw new UsageError('collect needs one of: hf, manifest, crawl.');
      }
      case 'validate':
        return await cmdValidate(rest, out, options);
      case 'render':
        return await cmdRender(rest, out, options);
      default:
        throw new UsageError(`Unknown command: ${clean(command.slice(0, 40))}. Run "sourcebook --help".`);
    }
  } catch (e) {
    out.stderr(`sourcebook: ${describe(e)}\n`);
    return 2;
  }
}
