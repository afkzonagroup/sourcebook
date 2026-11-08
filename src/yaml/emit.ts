// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Writes a summary as a commented YAML file: every template field has its
 * label and instruction as a comment above it, followed by facts the
 * collectors found ("Collected: ...") and the allowed choices. The output is
 * in the safe subset that `parseYaml` reads.
 */

import { FIELDS, SECTIONS, SIZE_RANGES, TEMPLATE, type FieldSpec } from '../spec/template.js';
import type { Summary } from '../schema/types.js';
import type { PrefillHints } from '../collect/inventory.js';

const CHOICES: Record<string, string> = {
  'general_information.provider.authorised_representative.applicable': 'true (provider established outside the Union) or false',
  'general_information.provider.authorised_representative.not_applicable_reason': 'established_in_union or open_source_exemption (Article 54(6) AI Act), when applicable is false',
  'general_information.modalities.text.size_range': SIZE_RANGES.text.map((r) => r.id).join(', '),
  'general_information.modalities.image.size_range': SIZE_RANGES.image.map((r) => r.id).join(', '),
  'general_information.modalities.audio.size_range': SIZE_RANGES.audio.map((r) => r.id).join(', '),
  'general_information.modalities.video.size_range': SIZE_RANGES.video.map((r) => r.id).join(', '),
  'general_information.latest_data_collection.date': 'write YYYY-MM; it is printed as MM/YYYY',
  'data_sources.crawled_data.collection_period': 'from and to as YYYY-MM; printed as MM/YYYY',
  last_update: 'write YYYY-MM-DD; it is printed as DD/MM/YY, as in the template',
};

const SELECTION_NOTE = 'selected: any of text, image, video, audio; other: free text for "Other"';

function wrap(text: string, width: number): string[] {
  const words = text.split(/\s+/).filter((w) => w !== '');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    if (line !== '' && line.length + 1 + w.length > width) {
      lines.push(line);
      line = w;
    } else line = line === '' ? w : `${line} ${w}`;
  }
  if (line !== '') lines.push(line);
  return lines;
}

function comment(lines: string[], indent: string, text: string): void {
  for (const l of wrap(text, 96 - indent.length)) lines.push(`${indent}# ${l}`);
}

/** A YAML scalar for a string: block literal for clean multi-line text, double-quoted otherwise. */
export function yamlString(s: string, indent: string): string {
  if (s.includes('\n')) {
    const parts = s.split('\n');
    const clean = parts.every((l) => !/[ \t]$/.test(l) && !l.includes('\r')) && !/^[ \t]/.test(parts[0] ?? '');
    if (clean) return `|-\n${parts.map((l) => (l === '' ? '' : `${indent}  ${l}`)).join('\n')}`;
  }
  return JSON.stringify(s);
}

type Value = null | boolean | number | string | Value[] | { [k: string]: Value };

function emit(value: Value, path: string, indent: string, lines: string[], key: string, hints: PrefillHints, fieldsByPath: Map<string, FieldSpec>, sectionsBefore: Map<string, string>): void {
  const section = sectionsBefore.get(path);
  if (section !== undefined) {
    if (lines.length > 0 && lines[lines.length - 1] !== '') lines.push('');
    lines.push(`${indent}# ${section}`);
  }
  const f = fieldsByPath.get(path);
  if (f !== undefined) {
    comment(lines, indent, `${f.section === '0' ? '' : `${f.section} `}${f.label}${f.requirement === 'optional' ? '' : f.requirement === 'where-applicable' ? ' [where applicable]' : f.requirement === 'conditional' ? ` [if ${f.condition ?? 'applicable'}]` : ' [required]'}`);
    if (f.instruction !== '') comment(lines, indent, f.instruction);
  }
  const choice = CHOICES[path];
  if (choice !== undefined) comment(lines, indent, /^(write|from) /.test(choice) ? `Format: ${choice}` : `Choices: ${choice}`);
  if (path.endsWith('.modalities') && path.startsWith('data_sources.')) comment(lines, indent, SELECTION_NOTE);
  for (const h of hints[path] ?? []) comment(lines, indent, `Collected: ${h}`);
  const head = `${indent}${key}:`;
  if (value === null || typeof value === 'boolean' || typeof value === 'number') {
    lines.push(`${head} ${value === null ? 'null' : String(value)}`);
    return;
  }
  if (typeof value === 'string') {
    lines.push(`${head} ${yamlString(value, indent)}`);
    return;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      lines.push(`${head} []`);
      return;
    }
    lines.push(head);
    for (const item of value) {
      if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
        const entries = Object.entries(item);
        if (entries.length === 0) {
          lines.push(`${indent}  - {}`);
          continue;
        }
        const sub: string[] = [];
        for (const [k, v] of entries) emit(v, `${path}[].${k}`, `${indent}    `, sub, k, {}, new Map(), new Map());
        const first = sub[0] ?? '';
        lines.push(`${indent}  - ${first.slice(indent.length + 4)}`);
        lines.push(...sub.slice(1));
      } else {
        lines.push(`${indent}  - ${typeof item === 'string' ? yamlString(item, `${indent}    `) : item === null ? 'null' : JSON.stringify(item)}`);
      }
    }
    return;
  }
  lines.push(head);
  for (const [k, v] of Object.entries(value)) emit(v, path === '' ? k : `${path}.${k}`, `${indent}  `, lines, k, hints, fieldsByPath, sectionsBefore);
}

/** Paths before which a section heading comment is written. */
const SECTION_AT: Record<string, string> = {
  general_information: '1',
  'general_information.provider': '1.1',
  'general_information.model': '1.2',
  'general_information.modalities': '1.3',
  data_sources: '2',
  'data_sources.public_datasets': '2.1',
  'data_sources.licensed_datasets': '2.2.1',
  'data_sources.other_private_datasets': '2.2.2',
  'data_sources.crawled_data': '2.3',
  'data_sources.user_data': '2.4',
  'data_sources.synthetic_data': '2.5',
  'data_sources.other_sources': '2.6',
  data_processing: '3',
  'data_processing.tdm_reservations': '3.1',
  'data_processing.illegal_content': '3.2',
  'data_processing.other_information': '3.3',
};

/**
 * Writes a summary as commented YAML.
 *
 * @example summaryToYaml(emptySummary()).startsWith('# Public summary of training content') // => true
 */
export function summaryToYaml(summary: Summary, hints: PrefillHints = {}): string {
  const fieldsByPath = new Map<string, FieldSpec>(FIELDS.map((f) => [f.path, f]));
  const sectionsBefore = new Map<string, string>();
  for (const [path, num] of Object.entries(SECTION_AT)) {
    const s = SECTIONS.find((x) => x.number === num);
    if (s !== undefined) sectionsBefore.set(path, `${num}. ${s.title}`);
  }
  const lines: string[] = [];
  comment(lines, '', `Public summary of training content: Article 53(1)(d) of Regulation (EU) 2024/1689 (AI Act). Structure: ${TEMPLATE.title} (${TEMPLATE.document}, ${TEMPLATE.sourceUrl}).`);
  comment(lines, '', 'Write narrative answers in plain text; leave a value empty ("", null or []) until you have the answer. Validate with: sourcebook validate <file>');
  lines.push('');
  const data = summary as unknown as { [k: string]: Value };
  for (const [k, v] of Object.entries(data)) {
    if (k === 'information_gaps') {
      lines.push('');
      comment(lines, '', 'Information gaps: only for models placed on the market before 2 August 2025, when information is not available or its retrieval would impose a disproportionate burden (Explanatory Notice, point 33). Each entry: field (a field id, see docs/template-mapping.md) and justification.');
    }
    emit(v, k, '', lines, k, hints, fieldsByPath, sectionsBefore);
  }
  return `${lines.join('\n')}\n`;
}
