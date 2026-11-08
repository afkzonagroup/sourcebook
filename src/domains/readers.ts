// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Streaming readers for crawl logs: WARC (ISO 28500, versions 1.0 and 1.1),
 * CDX (the space-separated index with a " CDX" legend line), CDXJ (pywb
 * style: SURT, timestamp, JSON) and CSV. They read from any async iterable
 * of bytes, keep memory bounded (line, header and field caps) and yield
 * `CrawlRecord`s for the `DomainRanker`.
 *
 * Gzip decompression happens before these readers (see the CLI); the
 * readers themselves never allocate more than one line or header block.
 */

import { LimitError, type CrawlRecord } from './rank.js';
import { ASCII_SPACE, BLANK, trimOf } from '../util/trim.js';

export interface ReaderLimits {
  /** Longest line (CDX, CDXJ, CSV row) in bytes. */
  readonly maxLineBytes: number;
  /** Longest WARC or HTTP header block in bytes. */
  readonly maxHeaderBytes: number;
  /** Stop after this many records. */
  readonly maxRecords: number;
  /** Stop after reading this many (decompressed) bytes. */
  readonly maxBytes: number;
}

export const DEFAULT_READER_LIMITS: ReaderLimits = {
  maxLineBytes: 65_536,
  maxHeaderBytes: 65_536,
  maxRecords: 1_000_000_000,
  maxBytes: 2 ** 50,
};

/** Counts of records a reader read but did not pass on, by reason. */
export type FilterCounts = Record<string, number>;

/** A parsing error with a position, for messages to the user. */
export class CrawlLogError extends Error {
  readonly code: string;
  readonly position: string;
  constructor(code: string, position: string, message: string) {
    super(`${position}: ${message}`);
    this.name = 'CrawlLogError';
    this.code = code;
    this.position = position;
  }
}

function bump(counts: FilterCounts, reason: string): void {
  counts[reason] = (counts[reason] ?? 0) + 1;
}

/** Modality suggested by a MIME type; "other" when none fits. */
export function modalityOfMime(mime: string): string {
  const m = mime.trim().toLowerCase().split(';')[0]?.trim() ?? '';
  if (m.startsWith('text/') || ['application/xhtml+xml', 'application/json', 'application/xml', 'application/pdf'].includes(m)) return 'text';
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('audio/')) return 'audio';
  if (m.startsWith('video/')) return 'video';
  return 'other';
}

/** "YYYY-MM" from an ISO date-time ("2024-03-01T…") or a 14-digit timestamp ("20240301…"). */
export function monthOf(value: string): string | undefined {
  const iso = /^([0-9]{4})-([0-9]{2})/.exec(value);
  const ts = /^([0-9]{4})([0-9]{2})[0-9]{2}/.exec(value);
  const m = iso ?? ts;
  if (m === null) return undefined;
  const month = Number(m[2]);
  return month >= 1 && month <= 12 ? `${m[1] ?? ''}-${m[2] ?? ''}` : undefined;
}

const SIZE_RE = /^[0-9]{1,30}$/;

/** Parses a non-negative integer size; null when it is not one. */
export function parseSize(text: string): bigint | null {
  const t = trimAscii(text);
  return SIZE_RE.test(t) ? BigInt(t) : null;
}

/** Pull-based byte reader over an async iterable, with a bounded buffer. */
class ByteReader {
  private buf = new Uint8Array(0);
  private pos = 0;
  private done = false;
  private readonly it: AsyncIterator<Uint8Array>;
  private readonly limits: ReaderLimits;
  /** Bytes consumed so far. */
  offset = 0;
  private received = 0;

  constructor(source: AsyncIterable<Uint8Array>, limits: ReaderLimits) {
    this.it = source[Symbol.asyncIterator]();
    this.limits = limits;
  }

  /** Closes the underlying source (for example the file stream) early. */
  async close(): Promise<void> {
    if (!this.done) {
      this.done = true;
      await this.it.return?.();
    }
  }

  private get available(): number {
    return this.buf.length - this.pos;
  }

  private async fill(): Promise<boolean> {
    if (this.done) return false;
    const r = await this.it.next();
    if (r.done === true) {
      this.done = true;
      return false;
    }
    const chunk = r.value;
    this.received += chunk.length;
    if (this.received > this.limits.maxBytes) throw new LimitError('too-many-bytes', `The input is larger than ${this.limits.maxBytes} bytes.`);
    const rest = this.buf.subarray(this.pos);
    const next = new Uint8Array(rest.length + chunk.length);
    next.set(rest, 0);
    next.set(chunk, rest.length);
    this.buf = next;
    this.pos = 0;
    return true;
  }

  /** Reads one line without its line break (LF or CRLF), or null at the end. */
  async readLine(max: number, code: string): Promise<Uint8Array | null> {
    let searchFrom = this.pos;
    for (;;) {
      const nl = this.buf.indexOf(10, searchFrom);
      if (nl >= 0) {
        if (nl - this.pos > max) throw new LimitError(code, `A line is longer than ${max} bytes.`);
        let end = nl;
        if (end > this.pos && this.buf[end - 1] === 13) end--;
        const line = this.buf.slice(this.pos, end);
        this.offset += nl + 1 - this.pos;
        this.pos = nl + 1;
        return line;
      }
      if (this.available > max) throw new LimitError(code, `A line is longer than ${max} bytes.`);
      searchFrom = this.buf.length;
      const before = this.pos;
      if (!(await this.fill())) {
        if (this.available === 0) return null;
        const line = this.buf.slice(this.pos);
        this.offset += this.available;
        this.pos = this.buf.length;
        return line;
      }
      searchFrom = searchFrom - before;
    }
  }

  /** Returns up to `n` bytes from the current position without consuming them. */
  async peek(n: number): Promise<Uint8Array> {
    while (this.available < n && (await this.fill()));
    return this.buf.subarray(this.pos, this.pos + Math.min(n, this.available));
  }

  /** Discards exactly `n` bytes; false when the input ends first. */
  async skip(n: number): Promise<boolean> {
    let left = n;
    for (;;) {
      const take = Math.min(left, this.available);
      this.pos += take;
      this.offset += take;
      left -= take;
      if (left === 0) return true;
      // Drop the consumed buffer before reading more, so skipping never accumulates memory.
      this.buf = new Uint8Array(0);
      this.pos = 0;
      if (!(await this.fill())) return false;
    }
  }

  /** Skips line breaks between records; false at the end of input. */
  async skipBlankBytes(): Promise<boolean> {
    for (;;) {
      while (this.available > 0) {
        const b = this.buf[this.pos];
        if (b !== 10 && b !== 13) return true;
        this.pos++;
        this.offset++;
      }
      if (!(await this.fill())) return false;
    }
  }
}

const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

/** Trims spaces and tabs (the same characters in the Python package). */
function trimSpTab(s: string): string {
  return trimOf(s, BLANK);
}

/** Trims ASCII white space. */
function trimAscii(s: string): string {
  return trimOf(s, ASCII_SPACE);
}

function decode(bytes: Uint8Array): string | null {
  try {
    return decoder.decode(bytes);
  } catch {
    return null;
  }
}

function indexOfSeq(hay: Uint8Array, seq: number[]): number {
  outer: for (let i = 0; i + seq.length <= hay.length; i++) {
    for (let j = 0; j < seq.length; j++) if (hay[i + j] !== seq[j]) continue outer;
    return i;
  }
  return -1;
}

export interface WarcOptions {
  /** WARC-Type values that count as content (default: response, resource, conversion). */
  readonly types?: readonly string[];
  /** Count only HTTP responses with a 2xx status (default true). */
  readonly only2xx?: boolean;
}

/**
 * Reads WARC records. For `response` records with an HTTP message, the size
 * is the payload after the HTTP headers; for other counted types it is the
 * whole record block. `revisit`, `request`, `metadata` and `warcinfo`
 * records are not counted.
 */
export async function* readWarc(
  source: AsyncIterable<Uint8Array>,
  filtered: FilterCounts,
  options: WarcOptions = {},
  limits: ReaderLimits = DEFAULT_READER_LIMITS,
): AsyncGenerator<CrawlRecord> {
  const types = new Set(options.types ?? ['response', 'resource', 'conversion']);
  const only2xx = options.only2xx ?? true;
  const r = new ByteReader(source, limits);
  try {
    yield* warcRecords(r, filtered, types, only2xx, limits);
  } finally {
    await r.close();
  }
}

async function* warcRecords(r: ByteReader, filtered: FilterCounts, types: ReadonlySet<string>, only2xx: boolean, limits: ReaderLimits): AsyncGenerator<CrawlRecord> {
  let records = 0;
  for (;;) {
    if (!(await r.skipBlankBytes())) return;
    const start = r.offset;
    const first = await r.readLine(limits.maxHeaderBytes, 'header-too-long');
    if (first === null) return;
    const version = decode(first) ?? '';
    if (!/^WARC\/1\.[01]$/.test(version)) throw new CrawlLogError('not-warc', `byte ${start}`, 'Expected a WARC/1.0 or WARC/1.1 record.');
    const headers = new Map<string, string>();
    let headerBytes = first.length;
    for (;;) {
      const line = await r.readLine(limits.maxHeaderBytes, 'header-too-long');
      if (line === null) throw new CrawlLogError('truncated', `byte ${start}`, 'The WARC record header is incomplete.');
      if (line.length === 0) break;
      headerBytes += line.length;
      if (headerBytes > limits.maxHeaderBytes) throw new LimitError('header-too-long', `A WARC header is longer than ${limits.maxHeaderBytes} bytes.`);
      const text = decode(line);
      if (text === null) throw new CrawlLogError('bad-header', `byte ${start}`, 'A WARC header is not valid UTF-8.');
      const colon = text.indexOf(':');
      if (colon <= 0) continue;
      headers.set(trimSpTab(text.slice(0, colon)).toLowerCase(), trimSpTab(text.slice(colon + 1)));
    }
    const lengthText = headers.get('content-length') ?? '';
    if (!/^[0-9]{1,15}$/.test(lengthText)) throw new CrawlLogError('bad-length', `byte ${start}`, 'The WARC record has no valid Content-Length.');
    const length = Number(lengthText);
    records++;
    if (records > limits.maxRecords) throw new LimitError('too-many-records', `More than ${limits.maxRecords} records.`);
    const type = (headers.get('warc-type') ?? '').toLowerCase();
    const uri = (headers.get('warc-target-uri') ?? '').replace(/^<([\s\S]*)>$/, '$1');
    let record: CrawlRecord | null = null;
    if (!types.has(type)) {
      bump(filtered, `warc_${type === '' ? 'untyped' : type.replace(/[^a-z0-9_-]/g, '_').slice(0, 32)}`);
    } else if (uri === '') {
      bump(filtered, 'no_target_uri');
    } else {
      let size = BigInt(length);
      let modality: string | undefined;
      const contentType = (headers.get('content-type') ?? '').toLowerCase();
      let keep = true;
      if (type === 'response' && contentType.startsWith('application/http')) {
        const head = await r.peek(Math.min(length, limits.maxHeaderBytes));
        let end = indexOfSeq(head, [13, 10, 13, 10]);
        let sep = 4;
        if (end < 0) {
          end = indexOfSeq(head, [10, 10]);
          sep = 2;
        }
        if (end >= 0) {
          size = BigInt(length - end - sep);
          const httpHead = decode(head.subarray(0, end)) ?? '';
          const status = /^HTTP\/[0-9.]+ ([0-9]{3})/.exec(httpHead);
          if (only2xx && (status === null || !(status[1] ?? '').startsWith('2'))) {
            keep = false;
            bump(filtered, status === null ? 'http_status_unknown' : 'http_not_2xx');
          }
          const ct = /\r?\ncontent-type:[ \t]*([^\r\n]*)/i.exec(httpHead);
          if (ct !== null) modality = modalityOfMime(ct[1] ?? '');
        } else {
          bump(filtered, 'http_headers_not_found');
          keep = false;
        }
      } else if (contentType !== '') {
        modality = modalityOfMime(contentType);
      }
      if (keep) {
        const month = monthOf(headers.get('warc-date') ?? '');
        record = { url: uri, size, ...(modality === undefined ? {} : { modality }), ...(month === undefined ? {} : { month }) };
      }
    }
    if (!(await r.skip(length))) throw new CrawlLogError('truncated', `byte ${start}`, 'The WARC record block is incomplete.');
    if (record !== null) yield record;
  }
}

async function* readLines(source: AsyncIterable<Uint8Array>, limits: ReaderLimits): AsyncGenerator<{ no: number; text: string | null }> {
  const r = new ByteReader(source, limits);
  try {
    let no = 0;
    for (;;) {
      const line = await r.readLine(limits.maxLineBytes, 'line-too-long');
      if (line === null) return;
      no++;
      if (no > limits.maxRecords) throw new LimitError('too-many-records', `More than ${limits.maxRecords} lines.`);
      const text = decode(line);
      yield { no, text: no === 1 && text !== null && text.startsWith('\ufeff') ? text.slice(1) : text };
    }
  } finally {
    await r.close();
  }
}

/**
 * Reads a CDX index. The first line must be the legend (" CDX N b a m s k r
 * M S V g" or similar); the fields used are `a` (original URL) or `N`
 * (SURT), `S` (compressed record size), `m` (MIME type), `s` (status) and
 * `b` (timestamp).
 */
export async function* readCdx(source: AsyncIterable<Uint8Array>, filtered: FilterCounts, limits: ReaderLimits = DEFAULT_READER_LIMITS): AsyncGenerator<CrawlRecord> {
  let fields: string[] | null = null;
  for await (const { no, text } of readLines(source, limits)) {
    if (text === null) {
      if (fields === null) throw new CrawlLogError('bad-legend', `line ${no}`, 'The CDX legend is not valid UTF-8.');
      bump(filtered, 'invalid_encoding');
      continue;
    }
    if (fields === null) {
      const legend = trimAscii(text).split(/[ \t]+/);
      if (legend[0] !== 'CDX') throw new CrawlLogError('bad-legend', `line ${no}`, 'A CDX file must start with a " CDX" legend line.');
      fields = legend.slice(1);
      if (!fields.includes('S')) throw new CrawlLogError('no-size', `line ${no}`, 'The CDX legend has no S (record size) field.');
      if (!fields.includes('a') && !fields.includes('N')) throw new CrawlLogError('no-url', `line ${no}`, 'The CDX legend has no a (URL) or N (SURT) field.');
      continue;
    }
    if (trimAscii(text) === '') continue;
    const parts = trimAscii(text).split(' ');
    const get = (f: string): string => {
      const i = (fields ?? []).indexOf(f);
      return i >= 0 ? (parts[i] ?? '') : '';
    };
    const mime = get('m');
    const status = get('s');
    if (mime.toLowerCase() === 'warc/revisit') {
      bump(filtered, 'revisit');
      continue;
    }
    if (status !== '' && status !== '-' && !status.startsWith('2')) {
      bump(filtered, 'http_not_2xx');
      continue;
    }
    const size = parseSize(get('S'));
    if (size === null) {
      bump(filtered, 'invalid_size');
      continue;
    }
    const a = get('a');
    const month = monthOf(get('b'));
    const modality = mime === '' || mime === '-' ? undefined : modalityOfMime(mime);
    const extra = { ...(modality === undefined ? {} : { modality }), ...(month === undefined ? {} : { month }) };
    if (a !== '' && a !== '-') yield { url: a, size, ...extra };
    else {
      const host = hostOfSurt(get('N'));
      if (host === null) bump(filtered, 'invalid_surt');
      else yield { host, size, ...extra };
    }
  }
}

/** Host of a SURT ("com,example,www)/path" -> "www.example.com"); null when malformed. */
export function hostOfSurt(surt: string): string | null {
  const m = /^([^)/\s]+)\)/.exec(surt.replace(/^https?:\/\/\(?/, ''));
  if (m === null) return null;
  const parts = (m[1] ?? '').split(':')[0]?.split(',').filter((p) => p !== '') ?? [];
  if (parts.length === 0) return null;
  return parts.reverse().join('.');
}

/** Reads a CDXJ index (pywb): "SURT TIMESTAMP {json}" with `url`, `length`, `mime` and `status`. */
export async function* readCdxj(source: AsyncIterable<Uint8Array>, filtered: FilterCounts, limits: ReaderLimits = DEFAULT_READER_LIMITS): AsyncGenerator<CrawlRecord> {
  for await (const { text } of readLines(source, limits)) {
    if (text === null) {
      bump(filtered, 'invalid_encoding');
      continue;
    }
    if (trimAscii(text) === '' || text.startsWith('!')) continue;
    const m = /^([^ \t]+) ([^ \t]+) (\{[\s\S]*\})[ \t]*$/.exec(text);
    if (m === null) {
      bump(filtered, 'invalid_line');
      continue;
    }
    let data: unknown;
    try {
      data = JSON.parse(m[3] ?? '');
    } catch {
      bump(filtered, 'invalid_json');
      continue;
    }
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      bump(filtered, 'invalid_json');
      continue;
    }
    const obj = data as Record<string, unknown>;
    const str = (k: string): string => {
      const v = Object.hasOwn(obj, k) ? obj[k] : undefined;
      return typeof v === 'string' ? v : typeof v === 'number' && Number.isSafeInteger(v) ? String(v) : '';
    };
    const mime = str('mime');
    const status = str('status');
    if (mime.toLowerCase() === 'warc/revisit') {
      bump(filtered, 'revisit');
      continue;
    }
    if (status !== '' && status !== '-' && !status.startsWith('2')) {
      bump(filtered, 'http_not_2xx');
      continue;
    }
    const size = parseSize(str('length'));
    if (size === null) {
      bump(filtered, 'invalid_size');
      continue;
    }
    const url = str('url');
    const month = monthOf(m[2] ?? '');
    const modality = mime === '' || mime === '-' ? undefined : modalityOfMime(mime);
    const extra = { ...(modality === undefined ? {} : { modality }), ...(month === undefined ? {} : { month }) };
    if (url !== '') yield { url, size, ...extra };
    else {
      const host = hostOfSurt(m[1] ?? '');
      if (host === null) bump(filtered, 'invalid_surt');
      else yield { host, size, ...extra };
    }
  }
}

export interface CsvColumns {
  /** Column with URLs; or use `host`. */
  readonly url?: string;
  /** Column with host or domain names. */
  readonly host?: string;
  /** Column with sizes (non-negative integers). */
  readonly size: string;
  readonly modality?: string;
  /** Column with a date ("YYYY-MM", ISO date-time or 14-digit timestamp). */
  readonly date?: string;
  /** Field delimiter: "," (default) or "\t". */
  readonly delimiter?: ',' | '\t';
}

/**
 * Splits CSV text into rows (RFC 4180: fields may be quoted, quotes doubled
 * inside quoted fields, line breaks allowed inside quoted fields).
 */
export async function* readCsvRows(
  source: AsyncIterable<Uint8Array>,
  delimiter: ',' | '\t',
  limits: ReaderLimits = DEFAULT_READER_LIMITS,
): AsyncGenerator<{ row: number; fields: string[] }> {
  const dec = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  let fields: string[] = [];
  let field = '';
  let rowChars = 0;
  // Assigned inside process(), so declared without narrowing.
  let state = 'start' as 'start' | 'unquoted' | 'quoted' | 'quote-in-quoted' | 'cr-after-quote';
  let row = 1;
  let total = 0;
  let firstChunk = true;
  const endField = (): void => {
    fields.push(field);
    field = '';
    if (fields.length > 256) throw new LimitError('too-many-fields', `Row ${row} has more than 256 fields.`);
  };
  const add = (ch: string): void => {
    field += ch;
    rowChars++;
    if (rowChars > limits.maxLineBytes) throw new LimitError('line-too-long', `Row ${row} is longer than ${limits.maxLineBytes} characters.`);
  };
  const out: { row: number; fields: string[] }[] = [];
  const process = (text: string): void => {
    for (let i = 0; i < text.length; i++) {
      const ch = text.charAt(i);
      switch (state) {
        case 'start':
        case 'unquoted':
          if (ch === '"') {
            if (state === 'unquoted') throw new CrawlLogError('bad-csv', `row ${row}`, 'A quote inside an unquoted field.');
            state = 'quoted';
          } else if (ch === delimiter) {
            endField();
            state = 'start';
          } else if (ch === '\n') {
            if (field.endsWith('\r')) field = field.slice(0, -1);
            endField();
            out.push({ row, fields });
            fields = [];
            rowChars = 0;
            row++;
            if (row > limits.maxRecords) throw new LimitError('too-many-records', `More than ${limits.maxRecords} rows.`);
            state = 'start';
          } else {
            add(ch);
            state = 'unquoted';
          }
          break;
        case 'quoted':
          if (ch === '"') state = 'quote-in-quoted';
          else add(ch);
          break;
        case 'quote-in-quoted':
          if (ch === '"') {
            add('"');
            state = 'quoted';
          } else if (ch === delimiter) {
            endField();
            state = 'start';
          } else if (ch === '\r') {
            state = 'cr-after-quote';
          } else if (ch === '\n') {
            endField();
            out.push({ row, fields });
            fields = [];
            rowChars = 0;
            row++;
            state = 'start';
          } else {
            throw new CrawlLogError('bad-csv', `row ${row}`, 'Unexpected character after a closing quote.');
          }
          break;
        case 'cr-after-quote':
          if (ch !== '\n') throw new CrawlLogError('bad-csv', `row ${row}`, 'Unexpected character after a closing quote.');
          endField();
          out.push({ row, fields });
          fields = [];
          rowChars = 0;
          row++;
          state = 'start';
          break;
      }
    }
  };
  for await (const chunk of source) {
    total += chunk.length;
    if (total > limits.maxBytes) throw new LimitError('too-many-bytes', `The input is larger than ${limits.maxBytes} bytes.`);
    let text: string;
    try {
      text = dec.decode(chunk, { stream: true });
    } catch {
      throw new CrawlLogError('bad-encoding', `row ${row}`, 'The CSV file is not valid UTF-8.');
    }
    if (firstChunk && text !== '') {
      if (text.startsWith('\ufeff')) text = text.slice(1);
      firstChunk = false;
    }
    process(text);
    yield* out.splice(0, out.length);
  }
  try {
    process(dec.decode());
  } catch (e) {
    if (e instanceof CrawlLogError || e instanceof LimitError) throw e;
    throw new CrawlLogError('bad-encoding', `row ${row}`, 'The CSV file is not valid UTF-8.');
  }
  if (state === 'quoted') throw new CrawlLogError('bad-csv', `row ${row}`, 'Unterminated quoted field.');
  if (state !== 'start' || fields.length > 0) {
    if (field.endsWith('\r')) field = field.slice(0, -1);
    endField();
    out.push({ row, fields });
  }
  yield* out.splice(0, out.length);
}

/** Reads crawl records from a CSV file with a header row. */
export async function* readCsv(
  source: AsyncIterable<Uint8Array>,
  columns: CsvColumns,
  filtered: FilterCounts,
  limits: ReaderLimits = DEFAULT_READER_LIMITS,
): AsyncGenerator<CrawlRecord> {
  if ((columns.url === undefined) === (columns.host === undefined)) throw new RangeError('Give exactly one of the url and host columns.');
  let index: { url: number; host: number; size: number; modality: number; date: number } | null = null;
  for await (const { row, fields } of readCsvRows(source, columns.delimiter ?? ',', limits)) {
    if (index === null) {
      const find = (name: string | undefined): number => {
        if (name === undefined) return -1;
        const i = fields.findIndex((f) => trimSpTab(f) === name);
        if (i < 0) throw new CrawlLogError('missing-column', `row ${row}`, `The header has no column named "${name.slice(0, 64)}".`);
        return i;
      };
      index = { url: find(columns.url), host: find(columns.host), size: find(columns.size), modality: find(columns.modality), date: find(columns.date) };
      continue;
    }
    if (fields.length === 1 && fields[0] === '') continue;
    const size = parseSize(fields[index.size] ?? '');
    if (size === null) {
      bump(filtered, 'invalid_size');
      continue;
    }
    const modality = index.modality >= 0 ? trimAscii(fields[index.modality] ?? '').toLowerCase() : '';
    const month = index.date >= 0 ? monthOf(trimAscii(fields[index.date] ?? '')) : undefined;
    const extra = { ...(modality === '' ? {} : { modality: modality.slice(0, 32) }), ...(month === undefined ? {} : { month }) };
    if (index.url >= 0) yield { url: trimAscii(fields[index.url] ?? ''), size, ...extra };
    else yield { host: trimAscii(fields[index.host] ?? ''), size, ...extra };
  }
}
