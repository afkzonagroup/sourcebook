// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * A strict parser for a safe subset of YAML 1.2.
 *
 * Dataset cards and summary files are written by many people and pass through
 * many systems, so this parser accepts only plain data and fails closed:
 *
 * - Supported: block mappings and sequences, flow `[...]` and `{...}`,
 *   plain, single-quoted and double-quoted scalars, literal `|` and folded `>`
 *   block scalars, comments, one optional `---` document start.
 * - Rejected with an error: anchors (`&`), aliases (`*`), tags (`!`), merge
 *   keys (`<<`), complex keys (`?`), directives (`%`), more than one
 *   document, duplicate keys, the keys `__proto__`, `constructor` and
 *   `prototype`, tabs used for indentation, control characters, infinities
 *   and NaN.
 * - Limits on depth, number of nodes and scalar length.
 *
 * Plain scalars are resolved with the YAML 1.2 core schema, so `no` and `on`
 * stay strings (the language code of Norwegian is `no`).
 *
 * The Python package contains a line-by-line port of this parser; shared
 * vectors in `test-vectors/yaml.json` keep both identical.
 */

import { BLANK, trimEndOf, trimOf } from '../util/trim.js';

/** A parsed YAML value: JSON-compatible data. */
export type YamlValue = null | boolean | number | string | YamlValue[] | YamlMap;
/** A mapping. Created without a prototype; read it with `Object.hasOwn`. */
export interface YamlMap {
  [key: string]: YamlValue;
}

export interface YamlLimits {
  /** Maximum nesting depth of collections. */
  readonly maxDepth: number;
  /** Maximum number of nodes (scalars and collections). */
  readonly maxNodes: number;
  /** Maximum length of one scalar or key, in UTF-16 code units. */
  readonly maxScalarLength: number;
}

export const DEFAULT_YAML_LIMITS: YamlLimits = { maxDepth: 64, maxNodes: 200_000, maxScalarLength: 1_048_576 };

/** Error codes, shared with the Python implementation. */
export const YAML_ERRORS = {
  'control-character': 'Control characters are not allowed.',
  'bad-newline': 'A carriage return must be followed by a line feed.',
  'tab-indentation': 'Tabs cannot be used for indentation.',
  directive: 'YAML directives are not supported.',
  'multiple-documents': 'Only one YAML document is allowed.',
  'unexpected-content': 'Unexpected content.',
  'bad-indentation': 'Wrong indentation.',
  'expected-key': 'Expected a "key: value" entry.',
  'duplicate-key': 'Duplicate key.',
  'forbidden-key': 'This key is not allowed.',
  'merge-key': 'Merge keys (<<) are not supported.',
  'empty-key': 'Empty key.',
  'anchor-alias-tag': 'Anchors, aliases and tags are not supported.',
  'complex-key': 'Complex keys (?) are not supported.',
  'reserved-indicator': 'A plain value cannot start with this character.',
  'mapping-in-scalar': 'A plain value cannot contain ": "; quote it.',
  'unterminated-string': 'Unterminated quoted string.',
  'bad-escape': 'Invalid escape sequence.',
  'unterminated-flow': 'Unterminated flow collection.',
  'bad-flow': 'Invalid flow collection.',
  'empty-flow-entry': 'Empty entry in a flow collection.',
  'bad-block-scalar': 'Invalid block scalar header.',
  'non-finite-number': 'Infinity and NaN are not supported.',
  'too-deep': 'The document is nested too deeply.',
  'too-many-nodes': 'The document has too many values.',
  'scalar-too-long': 'A value is too long.',
  'unterminated-front-matter': 'The front matter has no closing "---" line.',
} as const;

export type YamlErrorCode = keyof typeof YAML_ERRORS;

/** A YAML syntax or limit error, with the 1-based line number. */
export class YamlError extends Error {
  readonly code: YamlErrorCode;
  readonly line: number;
  constructor(code: YamlErrorCode, line: number) {
    super(`YAML line ${line}: ${YAML_ERRORS[code]}`);
    this.name = 'YamlError';
    this.code = code;
    this.line = line;
  }
}

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
// C0 controls except TAB and LF (CR is handled separately), DEL, C1 controls
// and the Unicode line and paragraph separators (line breaks in YAML 1.1).
// eslint-disable-next-line no-control-regex -- detecting control characters is the purpose
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u2028\u2029]/;

interface Line {
  /** 1-based line number in the input. */
  readonly no: number;
  /** Original line without the line break. */
  readonly raw: string;
  /** Number of leading spaces (may be raised for compact nested nodes). */
  indent: number;
  /** Content after the indentation. */
  text: string;
}

function makeLines(input: string): Line[] {
  let text = input.startsWith('\ufeff') ? input.slice(1) : input;
  text = text.replace(/\r\n/g, '\n');
  const lines = text.split('\n');
  const out: Line[] = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? '';
    if (raw.includes('\r')) throw new YamlError('bad-newline', i + 1);
    if (CONTROL.test(raw)) throw new YamlError('control-character', i + 1);
    let indent = 0;
    while (indent < raw.length && raw.charCodeAt(indent) === 32) indent++;
    out.push({ no: i + 1, raw, indent, text: raw.slice(indent) });
  }
  return out;
}

function isBlank(text: string): boolean {
  return /^[ \t]*(#.*)?$/.test(text);
}

function isSeqEntry(text: string): boolean {
  return text === '-' || text.startsWith('- ') || text.startsWith('-\t');
}

function isDocMarker(line: Line): boolean {
  if (line.indent !== 0) return false;
  const t = line.text;
  return t === '---' || t === '...' || t.startsWith('--- ') || t.startsWith('... ') || t.startsWith('---\t') || t.startsWith('...\t');
}

interface Pos {
  line: number;
  col: number;
}

interface MapEntryHead {
  key: string;
  /** Column (in `text`) where the value starts, after the colon and spaces. */
  valueCol: number;
}

const INT_RE = /^[-+]?[0-9]+$/;
const OCT_RE = /^0o[0-7]+$/;
const HEX_RE = /^0x[0-9a-fA-F]+$/;
const FLOAT_RE = /^[-+]?(\.[0-9]+|[0-9]+(\.[0-9]*)?)([eE][-+]?[0-9]+)?$/;
const SPECIAL_FLOAT_RE = /^[-+]?\.(inf|Inf|INF)$|^\.(nan|NaN|NAN)$/;

/** Resolves a plain scalar with the YAML 1.2 core schema. */
export function resolvePlain(text: string, line: number): YamlValue {
  if (text === '' || text === '~' || text === 'null' || text === 'Null' || text === 'NULL') return null;
  if (text === 'true' || text === 'True' || text === 'TRUE') return true;
  if (text === 'false' || text === 'False' || text === 'FALSE') return false;
  if (INT_RE.test(text) || OCT_RE.test(text) || HEX_RE.test(text)) {
    const negative = text.startsWith('-');
    const digits = text.startsWith('-') || text.startsWith('+') ? text.slice(1) : text;
    const big = BigInt(digits);
    return Number(negative ? -big : big);
  }
  if (FLOAT_RE.test(text)) {
    const n = Number(text);
    if (!Number.isFinite(n)) throw new YamlError('non-finite-number', line);
    return n;
  }
  if (SPECIAL_FLOAT_RE.test(text)) throw new YamlError('non-finite-number', line);
  return text;
}

/** Removes leading and trailing spaces and tabs. */
function trimBlank(s: string): string {
  return trimOf(s, BLANK);
}

/** Removes trailing spaces and tabs that are not escaped by a backslash (double-quoted scalars). */
function trimUnescaped(seg: string): string {
  let end = seg.length;
  while (end > 0 && (seg.charAt(end - 1) === ' ' || seg.charAt(end - 1) === '\t')) end--;
  if (end === seg.length) return seg;
  let backslashes = 0;
  for (let k = end - 1; k >= 0 && seg.charAt(k) === '\\'; k--) backslashes++;
  // An odd number of backslashes escapes the first trailing white space character: keep it.
  return backslashes % 2 === 1 ? seg.slice(0, end + 1) : seg.slice(0, end);
}

class Parser {
  private readonly lines: Line[];
  private i = 0;
  private nodes = 0;
  private readonly limits: YamlLimits;

  constructor(input: string, limits: YamlLimits) {
    this.lines = makeLines(input);
    this.limits = limits;
  }

  parseDocument(): YamlValue {
    this.skipBlank();
    let first = this.lines[this.i];
    if (first !== undefined && first.indent === 0 && first.text.startsWith('%')) throw new YamlError('directive', first.no);
    if (first !== undefined && isDocMarker(first) && first.text.startsWith('---')) {
      if (!isBlank(first.text.slice(3))) throw new YamlError('unexpected-content', first.no);
      this.i++;
      this.skipBlank();
      first = this.lines[this.i];
    }
    let value: YamlValue = null;
    if (first !== undefined && !(isDocMarker(first) && first.text.startsWith('...'))) value = this.parseBlockNode(-1, false, 0);
    this.skipBlank();
    const rest = this.lines[this.i];
    if (rest !== undefined) {
      if (isDocMarker(rest) && rest.text.startsWith('...') && isBlank(rest.text.slice(3))) {
        this.i++;
        this.skipBlank();
        const after = this.lines[this.i];
        if (after !== undefined) throw new YamlError(isDocMarker(after) ? 'multiple-documents' : 'unexpected-content', after.no);
      } else if (isDocMarker(rest)) {
        throw new YamlError('multiple-documents', rest.no);
      } else {
        throw new YamlError(rest.indent > 0 ? 'bad-indentation' : 'unexpected-content', rest.no);
      }
    }
    return value;
  }

  private count(line: number, depth: number): void {
    this.nodes++;
    if (this.nodes > this.limits.maxNodes) throw new YamlError('too-many-nodes', line);
    if (depth > this.limits.maxDepth) throw new YamlError('too-deep', line);
  }

  private checkScalar(value: string, line: number): string {
    if (value.length > this.limits.maxScalarLength) throw new YamlError('scalar-too-long', line);
    return value;
  }

  private skipBlank(): void {
    while (this.i < this.lines.length) {
      const line = this.lines[this.i];
      if (line === undefined || !isBlank(line.text)) return;
      this.i++;
    }
  }

  private current(): Line | undefined {
    return this.lines[this.i];
  }

  /** Parses the block node starting at the next content line, or returns null if there is none deeper than `parentIndent`. */
  private parseBlockNode(parentIndent: number, allowSeqAtParent: boolean, depth: number): YamlValue {
    this.skipBlank();
    const line = this.current();
    if (line === undefined || isDocMarker(line)) return null;
    if (line.text.startsWith('\t')) throw new YamlError('tab-indentation', line.no);
    const seqHere = isSeqEntry(line.text);
    if (line.indent <= parentIndent && !(allowSeqAtParent && seqHere && line.indent === parentIndent)) return null;
    if (seqHere) return this.parseBlockSeq(line.indent, depth);
    if (this.mapEntryHead(line) !== null) return this.parseBlockMap(line.indent, depth);
    return this.parseInlineValue(line, 0, parentIndent, depth);
  }

  /** Returns the key of a "key: value" line, or null when the line is not a mapping entry. */
  private mapEntryHead(line: Line): MapEntryHead | null {
    const text = line.text;
    const c = text.charAt(0);
    let keyEnd: number;
    let key: string;
    if (c === '"' || c === "'") {
      const end = this.scanQuotedOnLine(text, 0);
      if (end < 0) return null;
      let j = end;
      while (text.charAt(j) === ' ') j++;
      if (text.charAt(j) !== ':' || !(j + 1 === text.length || text.charAt(j + 1) === ' ' || text.charAt(j + 1) === '\t')) return null;
      key = c === '"' ? this.unescapeDouble(text.slice(1, end - 1), line.no) : text.slice(1, end - 1).replace(/''/g, "'");
      keyEnd = j;
    } else {
      if (c === '' || '[]{},#&*!|>%@`'.includes(c) || (c === '?' && (text.length === 1 || text.charAt(1) === ' '))) {
        if (c === '?') throw new YamlError('complex-key', line.no);
        return null;
      }
      if (c === '-' && isSeqEntry(text)) return null;
      let j = 0;
      keyEnd = -1;
      while (j < text.length) {
        const ch = text.charAt(j);
        if (ch === '#' && j > 0 && (text.charAt(j - 1) === ' ' || text.charAt(j - 1) === '\t')) break;
        if (ch === ':' && (j + 1 === text.length || text.charAt(j + 1) === ' ' || text.charAt(j + 1) === '\t')) {
          keyEnd = j;
          break;
        }
        j++;
      }
      if (keyEnd < 0) return null;
      key = trimEndOf(text.slice(0, keyEnd), BLANK);
      if (key === '') throw new YamlError('empty-key', line.no);
    }
    let v = keyEnd + 1;
    while (text.charAt(v) === ' ' || text.charAt(v) === '\t') v++;
    return { key, valueCol: v };
  }

  /** For a quoted string starting at `start` on one line, returns the index after the closing quote, or -1. */
  private scanQuotedOnLine(text: string, start: number): number {
    const q = text.charAt(start);
    let j = start + 1;
    while (j < text.length) {
      const ch = text.charAt(j);
      if (q === "'" && ch === "'") {
        if (text.charAt(j + 1) === "'") {
          j += 2;
          continue;
        }
        return j + 1;
      }
      if (q === '"' && ch === '\\') {
        j += 2;
        continue;
      }
      if (q === '"' && ch === '"') return j + 1;
      j++;
    }
    return -1;
  }

  private parseBlockMap(indent: number, depth: number): YamlMap {
    const first = this.current();
    this.count(first?.no ?? 0, depth + 1);
    const map: YamlMap = Object.create(null) as YamlMap;
    for (;;) {
      this.skipBlank();
      const line = this.current();
      if (line === undefined || isDocMarker(line) || line.indent < indent) break;
      if (line.indent > indent) throw new YamlError('bad-indentation', line.no);
      if (line.text.startsWith('\t')) throw new YamlError('tab-indentation', line.no);
      if (isSeqEntry(line.text)) throw new YamlError('bad-indentation', line.no);
      const head = this.mapEntryHead(line);
      if (head === null) throw new YamlError('expected-key', line.no);
      this.checkKey(head.key, line.no);
      if (Object.hasOwn(map, head.key)) throw new YamlError('duplicate-key', line.no);
      const rest = line.text.slice(head.valueCol);
      let value: YamlValue;
      if (isBlank(rest)) {
        this.i++;
        value = this.parseBlockNode(indent, true, depth + 1);
        if (value === null) this.count(line.no, depth + 1);
      } else {
        value = this.parseInlineValue(line, head.valueCol, indent, depth + 1);
      }
      map[head.key] = value;
    }
    return map;
  }

  private checkKey(key: string, lineNo: number): void {
    this.checkScalar(key, lineNo);
    if (key === '<<') throw new YamlError('merge-key', lineNo);
    if (FORBIDDEN_KEYS.has(key)) throw new YamlError('forbidden-key', lineNo);
  }

  private parseBlockSeq(indent: number, depth: number): YamlValue[] {
    const first = this.current();
    this.count(first?.no ?? 0, depth + 1);
    const seq: YamlValue[] = [];
    for (;;) {
      this.skipBlank();
      const line = this.current();
      if (line === undefined || isDocMarker(line) || line.indent < indent) break;
      if (line.indent > indent) throw new YamlError('bad-indentation', line.no);
      if (!isSeqEntry(line.text)) break;
      if (line.text.startsWith('-\t')) throw new YamlError('tab-indentation', line.no);
      let k = 1;
      while (line.text.charAt(k) === ' ') k++;
      const rest = line.text.slice(k);
      if (rest.startsWith('\t')) throw new YamlError('tab-indentation', line.no);
      let item: YamlValue;
      if (isBlank(rest)) {
        this.i++;
        item = this.parseBlockNode(indent, false, depth + 1);
        if (item === null) this.count(line.no, depth + 1);
      } else {
        // Compact nested node: treat the rest of the line as a line indented to its column.
        line.indent = indent + k;
        line.text = rest;
        item = this.parseBlockNode(indent, false, depth + 1);
      }
      seq.push(item);
    }
    return seq;
  }

  /** Parses a value that starts on `line` at column `col` of its text. Consumes all lines it uses. */
  private parseInlineValue(line: Line, col: number, parentIndent: number, depth: number): YamlValue {
    const text = line.text;
    const c = text.charAt(col);
    const next = text.charAt(col + 1);
    if (c === '&' || c === '*' || c === '!') throw new YamlError('anchor-alias-tag', line.no);
    if (c === '?' && (next === '' || next === ' ')) throw new YamlError('complex-key', line.no);
    if ('%@`,]}'.includes(c)) throw new YamlError('reserved-indicator', line.no);
    if (c === '|' || c === '>') return this.parseBlockScalar(line, col, parentIndent, depth);
    if (c === '"' || c === "'") {
      this.count(line.no, depth);
      const startLine = this.i;
      const { value, end } = this.readQuoted({ line: startLine, col: this.absCol(line, col) }, parentIndent);
      this.finishLine(end);
      return this.checkScalar(value, line.no);
    }
    if (c === '[' || c === '{') {
      const pos: Pos = { line: this.i, col: this.absCol(line, col) };
      const value = this.readFlow(pos, parentIndent, depth);
      this.finishLine(pos);
      return value;
    }
    this.count(line.no, depth);
    return this.readPlainBlock(line, col, parentIndent);
  }

  /** Column of `col` (in `line.text`) within `line.raw`. */
  private absCol(line: Line, col: number): number {
    return line.raw.length - line.text.length + col;
  }

  /** After a quoted scalar or flow collection, the rest of its last line must be blank or a comment. */
  private finishLine(end: Pos): void {
    const line = this.lines[end.line];
    if (line === undefined) return;
    const rest = line.raw.slice(end.col);
    if (!/^([ \t]+(#.*)?)?$/.test(rest)) throw new YamlError('unexpected-content', line.no);
    this.i = end.line + 1;
  }

  private readPlainBlock(line: Line, col: number, parentIndent: number): YamlValue {
    const firstNo = line.no;
    const firstText = this.plainLinePart(line.text.slice(col), line.no);
    const parts: string[] = [firstText.value];
    let ended = firstText.comment;
    this.i++;
    let pendingEmpty = 0;
    let multi = false;
    while (!ended && this.i < this.lines.length) {
      const l = this.lines[this.i];
      if (l === undefined) break;
      if (/^[ \t]*$/.test(l.text)) {
        pendingEmpty++;
        this.i++;
        continue;
      }
      if (isDocMarker(l) || l.indent <= parentIndent || l.text.startsWith('#')) break;
      const part = this.plainLinePart(l.text, l.no);
      parts.push(pendingEmpty > 0 ? '\n'.repeat(pendingEmpty) : ' ');
      parts.push(part.value);
      multi = true;
      pendingEmpty = 0;
      ended = part.comment;
      this.i++;
    }
    const value = this.checkScalar(parts.join(''), firstNo);
    return multi ? value : resolvePlain(value, firstNo);
  }

  /** One line of a plain scalar: the text before any comment, trimmed. */
  private plainLinePart(text: string, lineNo: number): { value: string; comment: boolean } {
    let j = 0;
    let comment = false;
    while (j < text.length) {
      const ch = text.charAt(j);
      if (ch === '#' && (j === 0 || text.charAt(j - 1) === ' ' || text.charAt(j - 1) === '\t')) {
        comment = true;
        break;
      }
      if (ch === ':' && (j + 1 === text.length || text.charAt(j + 1) === ' ' || text.charAt(j + 1) === '\t')) {
        throw new YamlError('mapping-in-scalar', lineNo);
      }
      j++;
    }
    return { value: trimOf(text.slice(0, j), BLANK), comment };
  }

  /**
   * Reads a quoted scalar starting at `pos` (on the opening quote). Handles
   * line folding across lines. Returns the value and the position after the
   * closing quote.
   */
  private readQuoted(pos: Pos, parentIndent: number): { value: string; end: Pos } {
    const startLine = this.lines[pos.line];
    if (startLine === undefined) throw new YamlError('unterminated-string', 0);
    const q = startLine.raw.charAt(pos.col);
    let li = pos.line;
    let j = pos.col + 1;
    let out = '';
    // Text of the current line segment, before folding is applied.
    let seg = '';
    for (;;) {
      const line = this.lines[li];
      if (line === undefined) throw new YamlError('unterminated-string', startLine.no);
      const raw = line.raw;
      if (j >= raw.length) {
        // Line break inside the string: fold.
        let escapedBreak = false;
        if (q === '"' && seg.endsWith('\\') && !this.endsWithEscapedBackslash(seg)) {
          seg = seg.slice(0, -1);
          escapedBreak = true;
        }
        out += q === '"' ? this.unescapeDouble(escapedBreak ? seg : trimUnescaped(seg), line.no) : trimEndOf(seg, BLANK);
        seg = '';
        // Count following empty lines.
        let empties = 0;
        li++;
        for (;;) {
          const nl = this.lines[li];
          if (nl === undefined) throw new YamlError('unterminated-string', startLine.no);
          if (/^[ \t]*$/.test(nl.raw)) {
            empties++;
            li++;
            continue;
          }
          if (isDocMarker(nl) || nl.indent <= parentIndent) throw new YamlError('unterminated-string', startLine.no);
          break;
        }
        if (!escapedBreak) out += empties > 0 ? '\n'.repeat(empties) : ' ';
        else out += '\n'.repeat(empties);
        const nl = this.lines[li];
        j = nl === undefined ? 0 : nl.raw.length - nl.raw.replace(/^[ \t]+/, '').length;
        continue;
      }
      const ch = raw.charAt(j);
      if (q === "'") {
        if (ch === "'") {
          if (raw.charAt(j + 1) === "'") {
            seg += "'";
            j += 2;
            continue;
          }
          out += seg;
          return { value: out, end: { line: li, col: j + 1 } };
        }
        seg += ch;
        j++;
      } else {
        if (ch === '\\') {
          if (j + 1 >= raw.length) {
            seg += '\\';
            j++;
            continue;
          }
          seg += ch + raw.charAt(j + 1);
          j += 2;
          continue;
        }
        if (ch === '"') {
          out += this.unescapeDouble(seg, line.no);
          return { value: out, end: { line: li, col: j + 1 } };
        }
        seg += ch;
        j++;
      }
    }
  }

  private endsWithEscapedBackslash(seg: string): boolean {
    // True when the trailing backslash is itself escaped ("\\\\" at the end).
    let n = 0;
    for (let k = seg.length - 1; k >= 0 && seg.charAt(k) === '\\'; k--) n++;
    return n % 2 === 0;
  }

  private unescapeDouble(s: string, lineNo: number): string {
    let out = '';
    for (let j = 0; j < s.length; j++) {
      const ch = s.charAt(j);
      if (ch !== '\\') {
        out += ch;
        continue;
      }
      const e = s.charAt(++j);
      const simple: Record<string, string> = {
        '0': '\u0000',
        a: '\u0007',
        b: '\b',
        t: '\t',
        '\t': '\t',
        n: '\n',
        v: '\u000b',
        f: '\f',
        r: '\r',
        e: '\u001b',
        ' ': ' ',
        '"': '"',
        '/': '/',
        '\\': '\\',
        N: '\u0085',
        _: '\u00a0',
        L: '\u2028',
        P: '\u2029',
      };
      if (Object.hasOwn(simple, e)) {
        out += simple[e] ?? '';
        continue;
      }
      const len = e === 'x' ? 2 : e === 'u' ? 4 : e === 'U' ? 8 : 0;
      if (len === 0) throw new YamlError('bad-escape', lineNo);
      const hex = s.slice(j + 1, j + 1 + len);
      if (hex.length !== len || !/^[0-9a-fA-F]+$/.test(hex)) throw new YamlError('bad-escape', lineNo);
      const cp = parseInt(hex, 16);
      if (cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) throw new YamlError('bad-escape', lineNo);
      out += String.fromCodePoint(cp);
      j += len;
    }
    return out;
  }

  private parseBlockScalar(line: Line, col: number, parentIndent: number, depth: number): string {
    this.count(line.no, depth);
    const header = line.text.slice(col);
    const m = /^([|>])([+-]?)([1-9]?)([+-]?)([ \t]+#.*|[ \t]*)$/.exec(header);
    if (m === null || ((m[2] ?? '') !== '' && (m[4] ?? '') !== '')) throw new YamlError('bad-block-scalar', line.no);
    const folded = m[1] === '>';
    const chomp = (m[2] ?? '') || (m[4] ?? '');
    const indicator = m[3] ?? '';
    const base = parentIndent < 0 ? 0 : parentIndent;
    this.i++;
    let contentIndent = indicator === '' ? -1 : base + Number(indicator);
    const contents: string[] = [];
    for (; this.i < this.lines.length; this.i++) {
      const l = this.lines[this.i];
      if (l === undefined) break;
      const ws = /^[ ]*$/.test(l.raw);
      if (ws) {
        contents.push(contentIndent >= 0 && l.raw.length > contentIndent ? l.raw.slice(contentIndent) : '');
        continue;
      }
      if (contentIndent < 0) {
        if (l.indent <= parentIndent) break;
        contentIndent = l.indent;
      }
      if (l.indent < contentIndent || isDocMarker(l)) break;
      contents.push(l.raw.slice(contentIndent));
    }
    // Trailing empty lines belong to chomping, not content.
    let trailing = 0;
    while (contents.length > 0 && contents[contents.length - 1] === '') {
      contents.pop();
      trailing++;
    }
    let out = '';
    let prev: 'none' | 'normal' | 'more' = 'none';
    let pending = 0;
    for (const c of contents) {
      if (c === '') {
        pending++;
        continue;
      }
      const more = c.startsWith(' ') || c.startsWith('\t');
      if (prev === 'none') out += '\n'.repeat(pending);
      else if (folded && prev === 'normal' && !more) out += pending === 0 ? ' ' : '\n'.repeat(pending);
      else out += '\n'.repeat(pending + 1);
      out += c;
      prev = more ? 'more' : 'normal';
      pending = 0;
    }
    if (prev === 'none') out = chomp === '+' ? '\n'.repeat(trailing) : '';
    else if (chomp === '+') out += '\n'.repeat(trailing + 1);
    else if (chomp === '') out += '\n';
    return this.checkScalar(out, line.no);
  }

  /** Reads a flow collection starting at `pos` (on the opening bracket). Advances `pos` past the closing bracket. */
  private readFlow(pos: Pos, parentIndent: number, depth: number): YamlValue {
    const startNo = this.lines[pos.line]?.no ?? 0;
    const peek = (): string => {
      const l = this.lines[pos.line];
      if (l === undefined) throw new YamlError('unterminated-flow', startNo);
      return pos.col < l.raw.length ? l.raw.charAt(pos.col) : '\n';
    };
    const skipWs = (): void => {
      for (;;) {
        const l = this.lines[pos.line];
        if (l === undefined) throw new YamlError('unterminated-flow', startNo);
        const ch = peek();
        if (ch === ' ' || ch === '\t') {
          pos.col++;
        } else if (ch === '#' && (pos.col === 0 || /[ \t]/.test(l.raw.charAt(pos.col - 1)))) {
          pos.col = l.raw.length;
        } else if (ch === '\n') {
          pos.line++;
          pos.col = 0;
          const nl = this.lines[pos.line];
          if (nl === undefined) throw new YamlError('unterminated-flow', startNo);
          if (!/^[ \t]*$/.test(nl.raw) && !/^[ \t]*#/.test(nl.raw) && (isDocMarker(nl) || nl.indent <= parentIndent)) {
            throw new YamlError('unterminated-flow', startNo);
          }
        } else {
          return;
        }
      }
    };
    const lineNo = (): number => this.lines[pos.line]?.no ?? startNo;
    const readScalar = (isKey: boolean): YamlValue => {
      const ch = peek();
      if (ch === '"' || ch === "'") {
        const { value, end } = this.readQuoted({ line: pos.line, col: pos.col }, parentIndent);
        pos.line = end.line;
        pos.col = end.col;
        return this.checkScalar(value, lineNo());
      }
      if (ch === '&' || ch === '*' || ch === '!') throw new YamlError('anchor-alias-tag', lineNo());
      if ('%@`|>'.includes(ch)) throw new YamlError('reserved-indicator', lineNo());
      if (ch === '?') throw new YamlError('complex-key', lineNo());
      // Plain flow scalar, possibly over several lines.
      const parts: string[] = [];
      const no = lineNo();
      let cur = '';
      for (;;) {
        const c = peek();
        if (c === '\n') {
          parts.push(trimBlank(cur));
          cur = '';
          skipWs();
          continue;
        }
        if (c === ',' || c === '[' || c === ']' || c === '{' || c === '}') break;
        if (c === '#') {
          const l = this.lines[pos.line];
          if (l !== undefined && pos.col > 0 && /[ \t]/.test(l.raw.charAt(pos.col - 1))) {
            parts.push(trimBlank(cur));
            cur = '';
            skipWs();
            continue;
          }
        }
        if (c === ':') {
          const l = this.lines[pos.line];
          const after = l === undefined ? '' : pos.col + 1 < l.raw.length ? l.raw.charAt(pos.col + 1) : '\n';
          if (after === ' ' || after === '\t' || after === '\n' || after === ',' || after === ']' || after === '}' || after === '[' || after === '{') {
            if (isKey) break;
            throw new YamlError('bad-flow', lineNo());
          }
        }
        cur += c;
        pos.col++;
      }
      parts.push(trimBlank(cur));
      const text = this.checkScalar(parts.filter((p) => p !== '').join(' '), no);
      if (text === '') throw new YamlError('empty-flow-entry', no);
      return isKey ? text : resolvePlain(text, no);
    };
    const readValue = (d: number): YamlValue => {
      const ch = peek();
      if (ch === '[' || ch === '{') return readCollection(d);
      this.count(lineNo(), d);
      return readScalar(false);
    };
    const readCollection = (d: number): YamlValue => {
      this.count(lineNo(), d);
      const open = peek();
      const close = open === '[' ? ']' : '}';
      pos.col++;
      const seq: YamlValue[] = [];
      const map: YamlMap = Object.create(null) as YamlMap;
      for (;;) {
        skipWs();
        if (peek() === close) {
          pos.col++;
          return open === '[' ? seq : map;
        }
        if (peek() === ',') throw new YamlError('empty-flow-entry', lineNo());
        if (open === '[') {
          const v = readValue(d + 1);
          skipWs();
          if (peek() === ':') throw new YamlError('bad-flow', lineNo());
          seq.push(v);
        } else {
          const keyNo = lineNo();
          const kc = peek();
          if (kc === '[' || kc === '{') throw new YamlError('complex-key', keyNo);
          const keyVal = readScalar(true);
          if (typeof keyVal !== 'string') throw new YamlError('empty-key', keyNo);
          const key = keyVal;
          this.checkKey(key, keyNo);
          if (Object.hasOwn(map, key)) throw new YamlError('duplicate-key', keyNo);
          skipWs();
          let v: YamlValue = null;
          if (peek() === ':') {
            pos.col++;
            skipWs();
            const nc = peek();
            if (nc === ',' || nc === close) {
              this.count(lineNo(), d + 1);
              v = null;
            } else {
              v = readValue(d + 1);
            }
          } else {
            this.count(lineNo(), d + 1);
          }
          map[key] = v;
        }
        skipWs();
        const sep = peek();
        if (sep === ',') {
          pos.col++;
          continue;
        }
        if (sep !== close) throw new YamlError('bad-flow', lineNo());
      }
    };
    return readCollection(depth);
  }
}

/**
 * Parses YAML text (one document of the safe subset) into plain data.
 *
 * @example
 * parseYaml('language:\n- en\n- "no"\n') // => { language: ['en', 'no'] }
 * @throws YamlError for syntax errors, unsupported features and exceeded limits.
 */
export function parseYaml(text: string, limits: YamlLimits = DEFAULT_YAML_LIMITS): YamlValue {
  return new Parser(text, limits).parseDocument();
}

/** The front matter of a Markdown file, and the text after it. */
export interface FrontMatter {
  /** The YAML text between the `---` lines, or null when there is none. */
  yaml: string | null;
  /** 1-based line number where the YAML text starts. */
  firstLine: number;
  /** The Markdown after the front matter. */
  body: string;
}

/**
 * Splits a Markdown file (such as a dataset card README.md) into front matter
 * and body. The front matter starts with a `---` line at the very top and ends
 * at the next `---` or `...` line.
 */
export function splitFrontMatter(markdown: string): FrontMatter {
  const text = (markdown.startsWith('\ufeff') ? markdown.slice(1) : markdown).replace(/\r\n/g, '\n');
  const lines = text.split('\n');
  if (trimEndOf(lines[0] ?? '', BLANK) !== '---') return { yaml: null, firstLine: 1, body: text };
  for (let i = 1; i < lines.length; i++) {
    const l = trimEndOf(lines[i] ?? '', BLANK);
    if (l === '---' || l === '...') {
      return { yaml: lines.slice(1, i).join('\n'), firstLine: 2, body: lines.slice(i + 1).join('\n') };
    }
  }
  throw new YamlError('unterminated-front-matter', 1);
}
