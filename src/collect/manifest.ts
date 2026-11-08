// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Local dataset manifests: a JSON file or a CSV table describing the
 * datasets used for training (format in docs/manifests.md), and Parquet
 * files, whose footer metadata gives row counts and sizes.
 */

import { CATEGORIES, parseInventory, type DatasetCategory, type DatasetSize, type InventoryDataset } from './inventory.js';
import { readCsvRows, DEFAULT_READER_LIMITS, CrawlLogError } from '../domains/readers.js';
import { Reader, SchemaError } from '../schema/parse.js';
import { isLink } from '../schema/checks.js';
import { ASCII_SPACE, trimOf } from '../util/trim.js';

/**
 * Reads a JSON manifest: `{ "datasets": [ ... ] }` where each dataset uses
 * the inventory fields (`name`, `link`, `category`, `modalities`, `sizes`,
 * ...). Sizes may be given as integers.
 *
 * @throws SchemaError for structural problems.
 */
export function datasetsFromJsonManifest(data: unknown, reference: string): InventoryDataset[] {
  const r = new Reader();
  const top = r.obj(data, '', ['datasets']);
  if (r.issues.length > 0) throw new SchemaError(r.issues);
  const list = r.list(top.datasets, 'datasets', 100_000);
  if (r.issues.length > 0) throw new SchemaError(r.issues);
  const datasets = list.map((d, i) => {
    if (typeof d !== 'object' || d === null || Array.isArray(d)) return d;
    const o = d as Record<string, unknown>;
    const sizes = Array.isArray(o.sizes)
      ? (o.sizes as unknown[]).map((s) => {
          if (typeof s !== 'object' || s === null || Array.isArray(s)) return s;
          const so = s as Record<string, unknown>;
          const v = Object.hasOwn(so, 'value') ? so.value : undefined;
          return { ...so, value: typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? String(v) : v, basis: Object.hasOwn(so, 'basis') ? so.basis : 'manifest' };
        })
      : o.sizes;
    const name = Object.hasOwn(o, 'name') ? o.name : undefined;
    const id = Object.hasOwn(o, 'id') ? o.id : typeof name === 'string' ? `manifest:${name}` : `manifest:#${i + 1}`;
    return { ...o, id, sizes, source: { kind: 'manifest-json', reference: reference.slice(0, 1000), revision: null } };
  });
  return parseInventory({ kind: 'sourcebook-inventory', version: 1, datasets, domain_report: null }).datasets;
}

/** Trims ASCII white space (the same characters in the Python package). */
function trimAscii(s: string): string {
  return trimOf(s, ASCII_SPACE);
}

const CSV_COLUMNS = ['name', 'link', 'category', 'modality', 'size', 'unit', 'after_preprocessing', 'languages', 'licenses', 'collection_start', 'collection_end', 'publicly_known'] as const;

function bool(v: string): boolean | null {
  const t = trimAscii(v).toLowerCase();
  if (t === 'true' || t === 'yes') return true;
  if (t === 'false' || t === 'no') return false;
  return null;
}

/**
 * Reads a CSV manifest with a header row. Columns (only `name` is required):
 * name, link, category, modality, size, unit, after_preprocessing,
 * languages and licenses (separated by ";"), collection_start and
 * collection_end ("YYYY-MM"), publicly_known. Rows with the same name are
 * one dataset (one row per modality).
 *
 * @throws CrawlLogError for malformed CSV, SchemaError for invalid values.
 */
export async function datasetsFromCsvManifest(source: AsyncIterable<Uint8Array>, reference: string): Promise<InventoryDataset[]> {
  let header: string[] | null = null;
  const byName = new Map<string, Record<string, unknown>>();
  for await (const { row, fields } of readCsvRows(source, ',', { ...DEFAULT_READER_LIMITS, maxRecords: 1_000_000 })) {
    if (header === null) {
      header = fields.map((f) => trimAscii(f).toLowerCase());
      for (const h of header) if (!(CSV_COLUMNS as readonly string[]).includes(h)) throw new CrawlLogError('unknown-column', `row ${row}`, `Unknown column "${h.slice(0, 64)}".`);
      if (!header.includes('name')) throw new CrawlLogError('missing-column', `row ${row}`, 'The header has no "name" column.');
      continue;
    }
    if (fields.length === 1 && fields[0] === '') continue;
    const cell = (c: string): string => {
      const i = (header ?? []).indexOf(c);
      return i < 0 ? '' : trimAscii(fields[i] ?? '');
    };
    const name = cell('name');
    if (name === '') throw new CrawlLogError('missing-name', `row ${row}`, 'A row has no name.');
    let d = byName.get(name);
    if (d === undefined) {
      const category = cell('category').toLowerCase();
      d = {
        id: `manifest:${name}`,
        name,
        link: cell('link'),
        category: category === '' ? null : category,
        modalities: [],
        languages: cell('languages').split(';').map(trimAscii).filter((x) => x !== ''),
        licenses: cell('licenses').split(';').map(trimAscii).filter((x) => x !== ''),
        sizes: [],
        collection_period: { start: cell('collection_start') === '' ? null : cell('collection_start'), end: cell('collection_end') === '' ? null : cell('collection_end') },
        publicly_known: bool(cell('publicly_known')),
        source: { kind: 'manifest-csv', reference: reference.slice(0, 1000), revision: null },
        notes: [],
      };
      byName.set(name, d);
    }
    const modality = cell('modality').toLowerCase();
    if (modality !== '') {
      const mods = d.modalities as string[];
      if (!mods.includes(modality)) mods.push(modality);
      if (cell('size') !== '') {
        (d.sizes as unknown[]).push({ modality, value: cell('size'), unit: cell('unit').toLowerCase() || 'bytes', basis: 'manifest', after_preprocessing: bool(cell('after_preprocessing')) ?? false });
      }
    }
  }
  return parseInventory({ kind: 'sourcebook-inventory', version: 1, datasets: [...byName.values()], domain_report: null }).datasets;
}

/** Facts read from a Parquet file footer. */
export interface ParquetFacts {
  rows: bigint;
  rowGroups: number;
  /** Sum of `total_byte_size` (uncompressed) over row groups. */
  uncompressedBytes: bigint;
  columns: string[];
  createdBy: string;
  /** Modalities implied by the Hugging Face "huggingface" key-value metadata, if present. */
  modalities: string[];
}

export class ParquetError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'ParquetError';
    this.code = code;
  }
}

/** Limits for the Thrift footer decoder. */
const MAX_LIST = 1_000_000;
const MAX_DEPTH = 32;

/** A minimal Thrift Compact Protocol reader for the Parquet FileMetaData struct. */
class Compact {
  private pos = 0;
  private budget = 5_000_000;
  constructor(private readonly buf: Uint8Array) {}

  private byte(): number {
    if (this.pos >= this.buf.length) throw new ParquetError('truncated', 'The Parquet footer is truncated.');
    if (--this.budget < 0) throw new ParquetError('too-complex', 'The Parquet footer is too complex.');
    return this.buf[this.pos++] ?? 0;
  }

  varint(): bigint {
    let result = 0n;
    let shift = 0n;
    for (let i = 0; i < 10; i++) {
      const b = this.byte();
      result |= BigInt(b & 0x7f) << shift;
      if ((b & 0x80) === 0) return result;
      shift += 7n;
    }
    throw new ParquetError('bad-varint', 'Invalid varint in the Parquet footer.');
  }

  zigzag(): bigint {
    const v = this.varint();
    return (v >> 1n) ^ -(v & 1n);
  }

  binary(): Uint8Array {
    const len = this.varint();
    if (len > BigInt(this.buf.length - this.pos)) throw new ParquetError('truncated', 'The Parquet footer is truncated.');
    const n = Number(len);
    const out = this.buf.subarray(this.pos, this.pos + n);
    this.pos += n;
    this.budget -= n;
    return out;
  }

  listHeader(): { size: number; type: number } {
    const h = this.byte();
    let size = h >> 4;
    if (size === 15) {
      const big = this.varint();
      if (big > BigInt(MAX_LIST)) throw new ParquetError('too-large', 'A list in the Parquet footer is too long.');
      size = Number(big);
    }
    return { size, type: h & 0x0f };
  }

  /** Skips a value of the given compact type. */
  skip(type: number, depth: number): void {
    if (depth > MAX_DEPTH) throw new ParquetError('too-deep', 'The Parquet footer is nested too deeply.');
    switch (type) {
      case 1:
      case 2:
        return;
      case 3:
        this.byte();
        return;
      case 4:
      case 5:
      case 6:
        this.varint();
        return;
      case 7:
        for (let i = 0; i < 8; i++) this.byte();
        return;
      case 8:
        this.binary();
        return;
      case 9:
      case 10: {
        const { size, type: et } = this.listHeader();
        for (let i = 0; i < size; i++) this.skipElement(et, depth + 1);
        return;
      }
      case 11: {
        const size = this.varint();
        if (size > BigInt(MAX_LIST)) throw new ParquetError('too-large', 'A map in the Parquet footer is too large.');
        if (size === 0n) return;
        const kv = this.byte();
        for (let i = 0n; i < size; i++) {
          this.skipElement(kv >> 4, depth + 1);
          this.skipElement(kv & 0x0f, depth + 1);
        }
        return;
      }
      case 12:
        this.struct(depth + 1, () => false);
        return;
      default:
        throw new ParquetError('bad-type', 'Unknown type in the Parquet footer.');
    }
  }

  /** Skips one list element (booleans take one byte inside lists). */
  skipElement(type: number, depth: number): void {
    if (type === 1 || type === 2) this.byte();
    else this.skip(type, depth);
  }

  /** Reads a struct; `onField` returns true when it consumed the field's value. */
  struct(depth: number, onField: (id: number, type: number) => boolean): void {
    if (depth > MAX_DEPTH) throw new ParquetError('too-deep', 'The Parquet footer is nested too deeply.');
    let last = 0;
    for (;;) {
      const h = this.byte();
      const type = h & 0x0f;
      if (type === 0) return;
      const delta = h >> 4;
      const id = delta === 0 ? Number(this.zigzag()) : last + delta;
      last = id;
      if (!onField(id, type)) this.skip(type, depth);
    }
  }
}

const utf8 = new TextDecoder('utf-8', { fatal: false });

/**
 * Parses the footer (FileMetaData) of a Parquet file.
 *
 * @param footer the Thrift-encoded footer bytes (between the data and the trailing length).
 */
export function parseParquetFooter(footer: Uint8Array): ParquetFacts {
  const c = new Compact(footer);
  let rows = 0n;
  let rowGroups = 0;
  let bytes = 0n;
  let createdBy = '';
  const columns: string[] = [];
  const kv = new Map<string, string>();
  c.struct(0, (id, type) => {
    if (id === 2 && type === 9) {
      const { size, type: et } = c.listHeader();
      for (let i = 0; i < size; i++) {
        if (et !== 12) {
          c.skipElement(et, 1);
          continue;
        }
        c.struct(1, (fid, ft) => {
          if (fid === 4 && ft === 8) {
            if (i > 0 && columns.length < 10_000) columns.push(utf8.decode(c.binary()).slice(0, 200));
            else c.binary();
            return true;
          }
          return false;
        });
      }
      return true;
    }
    if (id === 3 && type === 6) {
      rows = c.zigzag();
      return true;
    }
    if (id === 4 && type === 9) {
      const { size, type: et } = c.listHeader();
      rowGroups = size;
      for (let i = 0; i < size; i++) {
        if (et !== 12) {
          c.skipElement(et, 1);
          continue;
        }
        c.struct(1, (fid, ft) => {
          if (fid === 2 && ft === 6) {
            const v = c.zigzag();
            if (v > 0n) bytes += v;
            return true;
          }
          return false;
        });
      }
      return true;
    }
    if (id === 5 && type === 9) {
      const { size, type: et } = c.listHeader();
      for (let i = 0; i < size; i++) {
        if (et !== 12) {
          c.skipElement(et, 1);
          continue;
        }
        let key = '';
        let value = '';
        c.struct(1, (fid, ft) => {
          if (ft !== 8) return false;
          const b = c.binary();
          if (fid === 1) key = utf8.decode(b.subarray(0, 256));
          else if (fid === 2) value = b.length <= 4 * 1024 * 1024 ? utf8.decode(b) : '';
          else return true;
          return true;
        });
        if (key !== '' && kv.size < 1000) kv.set(key, value);
      }
      return true;
    }
    if (id === 6 && type === 8) {
      createdBy = utf8.decode(c.binary()).slice(0, 200);
      return true;
    }
    return false;
  });
  if (rows < 0n) throw new ParquetError('bad-rows', 'The Parquet footer has a negative row count.');
  return { rows, rowGroups, uncompressedBytes: bytes, columns, createdBy, modalities: modalitiesFromHfMetadata(kv.get('huggingface')) };
}

/** Modalities from the "huggingface" key-value metadata written by the datasets library. */
function modalitiesFromHfMetadata(value: string | undefined): string[] {
  if (value === undefined || value.length > 4 * 1024 * 1024) return [];
  let data: unknown;
  try {
    data = JSON.parse(value);
  } catch {
    return [];
  }
  const found = new Set<string>();
  let budget = 10_000;
  const walk = (v: unknown, depth: number): void => {
    if (budget-- <= 0 || depth > 20 || typeof v !== 'object' || v === null) return;
    if (Array.isArray(v)) {
      for (const x of v) walk(x, depth + 1);
      return;
    }
    const o = v as Record<string, unknown>;
    const t = Object.hasOwn(o, '_type') ? o._type : undefined;
    if (t === 'Image') found.add('image');
    if (t === 'Audio') found.add('audio');
    if (t === 'Video') found.add('video');
    if (t === 'Value' && Object.hasOwn(o, 'dtype') && (o.dtype === 'string' || o.dtype === 'large_string')) found.add('text');
    for (const k of Object.keys(o)) walk(o[k], depth + 1);
  };
  const info = typeof data === 'object' && data !== null && Object.hasOwn(data, 'info') ? (data as Record<string, unknown>).info : undefined;
  if (typeof info === 'object' && info !== null && Object.hasOwn(info, 'features')) walk((info as Record<string, unknown>).features, 0);
  return [...found].sort();
}

/** Default and hard limits for the Parquet footer size. */
export const PARQUET_FOOTER_DEFAULT = 16 * 1024 * 1024;
export const PARQUET_FOOTER_MAX = 256 * 1024 * 1024;

/** Locates the footer in the last bytes of a file: returns its length, or throws. */
export function parquetFooterLength(tail: Uint8Array, fileSize: number, maxFooter = PARQUET_FOOTER_DEFAULT): number {
  if (fileSize < 12 || tail.length < 8) throw new ParquetError('not-parquet', 'Not a Parquet file (too small).');
  const magic = String.fromCharCode(...tail.subarray(tail.length - 4));
  if (magic === 'PARE') throw new ParquetError('encrypted', 'The Parquet footer is encrypted; Sourcebook cannot read it.');
  if (magic !== 'PAR1') throw new ParquetError('not-parquet', 'Not a Parquet file (no PAR1 marker).');
  const view = new DataView(tail.buffer, tail.byteOffset + tail.length - 8, 4);
  const len = view.getUint32(0, true);
  if (len > maxFooter) throw new ParquetError('too-large', `The Parquet footer is larger than ${maxFooter} bytes.`);
  if (len + 12 > fileSize) throw new ParquetError('truncated', 'The Parquet footer length does not fit the file.');
  return len;
}

/** Builds an inventory entry from the facts of one or more Parquet files of one dataset. */
export function datasetFromParquet(
  facts: readonly ParquetFacts[],
  meta: { name: string; reference: string; category: DatasetCategory | null; modalities?: readonly string[]; link?: string },
): InventoryDataset {
  let rows = 0n;
  let bytes = 0n;
  const mods = new Set<string>(meta.modalities ?? []);
  if (mods.size === 0) for (const f of facts) for (const m of f.modalities) mods.add(m);
  for (const f of facts) {
    rows += f.rows;
    bytes += f.uncompressedBytes;
  }
  const modalities = [...mods].sort();
  const notes: string[] = [];
  const sizes: DatasetSize[] = [];
  if (modalities.length === 1) {
    const m = modalities[0] ?? 'text';
    sizes.push({ modality: m, value: bytes.toString(), unit: 'bytes', basis: 'Parquet row groups total_byte_size (uncompressed)', after_preprocessing: false });
    sizes.push({ modality: m, value: rows.toString(), unit: 'examples', basis: 'Parquet num_rows', after_preprocessing: false });
  } else if (modalities.length === 0) notes.push('The Parquet metadata does not show the modalities; add them.');
  else notes.push('The Parquet files hold several modalities; add a size per modality.');
  notes.push('Sizes come from the Parquet metadata. If these files are what you trained on after pre-processing, mark the sizes as after pre-processing.');
  if (meta.category !== null && !(CATEGORIES as readonly string[]).includes(meta.category)) throw new RangeError('Unknown category.');
  const link = meta.link ?? '';
  if (link !== '' && !isLink(link)) throw new RangeError('The link must be an http or https URL.');
  return {
    id: `parquet:${meta.name}`,
    name: meta.name,
    link,
    category: meta.category,
    modalities,
    languages: [],
    licenses: [],
    sizes,
    collection_period: { start: null, end: null },
    publicly_known: null,
    source: { kind: 'parquet', reference: meta.reference.slice(0, 1000), revision: null },
    notes,
  };
}
