// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

// The template is reproduced completely and verbatim, every field is mapped
// to the schema, rendered, and checked by the validator.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FIELDS, SECTIONS, SIZE_RANGES, MODALITY_TABLE, TEMPLATE, KEY_DATES, field, section } from '../src/spec/template.js';
import { specJsonText } from '../src/spec/export.js';
import { emptySummary } from '../src/schema/empty.js';
import { renderMarkdown } from '../src/render/markdown.js';
import { renderHtml } from '../src/render/html.js';
import { validateSummary } from '../src/validate/validate.js';
import { escapeHtml } from '../src/render/html.js';
import { parseSummary } from '../src/schema/parse.js';
import { inventoryJsonSchema, summaryJsonSchema } from '../src/spec/json-schema.js';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { exampleData, exampleSummary, fixture, ROOT, setPath } from './helpers.js';

const norm = (s: string): string => s.replace(/\s+/g, ' ').trim();
const WORD = norm(readFileSync(fixture('official/template-word-en.txt'), 'utf8'));
const ANNEX = norm(readFileSync(fixture('official/annex-pdf-en.txt'), 'utf8'));

function resolve(obj: unknown, path: string): unknown {
  let o = obj;
  for (const k of path.split('.')) {
    if (typeof o !== 'object' || o === null || !Object.hasOwn(o, k)) return undefined;
    o = (o as Record<string, unknown>)[k];
  }
  return o;
}

describe('template text is verbatim', () => {
  it('every field label is in the official Word template', () => {
    for (const f of FIELDS) {
      // The modality table heading is a column title.
      expect(WORD.includes(norm(f.label)), f.id).toBe(true);
    }
  });

  it('every field instruction is in the official Word template', () => {
    // "DD/MM/YY" for the last update is in the Annex; the Word form has a date picker there instead.
    for (const f of FIELDS) if (f.instruction !== '') expect(WORD.includes(norm(f.instruction)) || ANNEX.includes(norm(f.instruction)), f.id).toBe(true);
  });

  it('every section title and introduction is in the official Word template', () => {
    for (const s of SECTIONS) {
      expect(WORD.includes(norm(s.title)), s.number).toBe(true);
      for (const p of s.intro) expect(WORD.includes(norm(p)), `${s.number}: ${p.slice(0, 40)}`).toBe(true);
    }
  });

  it('size ranges, modality examples and the audio footnote are verbatim', () => {
    for (const ranges of Object.values(SIZE_RANGES)) for (const r of ranges) expect(WORD.includes(norm(r.label)), r.label).toBe(true);
    for (const row of Object.values(MODALITY_TABLE.rows)) expect(WORD.includes(norm(row.examples)), row.label).toBe(true);
    for (const v of Object.values(MODALITY_TABLE.instructions)) expect(WORD.includes(norm(v))).toBe(true);
    expect(WORD.includes(norm(MODALITY_TABLE.textAlternative))).toBe(true);
    expect(ANNEX.includes(norm(MODALITY_TABLE.audioFootnote))).toBe(true);
    expect(WORD.includes(norm(TEMPLATE.intro))).toBe(true);
  });

  it('the Annex of C(2025) 8311 has the same sections, in the same order', () => {
    let at = 0;
    for (const s of SECTIONS) {
      const i = ANNEX.indexOf(norm(s.title), at);
      expect(i, s.number).toBeGreaterThanOrEqual(0);
      at = i;
    }
    expect(ANNEX).toContain('C(2025) 8311 final');
  });

  it('cites the template version and the key dates of the official sources', () => {
    expect(TEMPLATE.document).toBe('Annex to Communication from the Commission C(2025) 8311 final');
    expect(TEMPLATE.documentDate).toBe('2025-12-05');
    expect(KEY_DATES).toEqual({ obligationsApply: '2025-08-02', enforcementFrom: '2026-08-02', legacyDeadline: '2027-08-02' });
  });

  it('lists the sections of the template exactly', () => {
    expect(SECTIONS.map((s) => s.number)).toEqual(['1', '1.1', '1.2', '1.3', '2', '2.1', '2.2', '2.2.1', '2.2.2', '2.3', '2.4', '2.5', '2.6', '3', '3.1', '3.2', '3.3']);
    expect(() => section('9')).toThrow();
    expect(() => field('nope')).toThrow();
  });
});

describe('template completeness: every field is mapped', () => {
  it('has unique ids and paths, and every path exists in the summary structure', () => {
    expect(new Set(FIELDS.map((f) => f.id)).size).toBe(FIELDS.length);
    expect(new Set(FIELDS.map((f) => f.path)).size).toBe(FIELDS.length);
    const empty = emptySummary();
    for (const f of FIELDS) expect(resolve(empty, f.path), f.path).not.toBeUndefined();
    for (const f of FIELDS) expect(resolve(empty, f.box), f.box).not.toBeUndefined();
  });

  it('counts the fields of the template: 51 fields in 17 sections', () => {
    expect(FIELDS).toHaveLength(51);
    expect(FIELDS.filter((f) => f.requirement === 'optional').map((f) => f.id)).toEqual([
      'general_additional_comments',
      'public_datasets_additional_comments',
      'other_private_datasets_additional_comments',
      'crawled_additional_comments',
      'user_data_additional_comments',
      'synthetic_additional_comments',
      'other_sources_additional_comments',
      'tdm_additional_comments',
      'other_information',
    ]);
  });

  it('renders every label of the template in Markdown and HTML', () => {
    const md = renderMarkdown(exampleSummary(), { instructions: true });
    const html = renderHtml(exampleSummary(), { instructions: true });
    for (const f of FIELDS) {
      if (f.id === 'modalities') continue;
      expect(md.includes(`**${f.label.replace(/[\\`*_[\]<>|~#!&$]/g, (c) => `\\${c}`)}**`), f.id).toBe(true);
      expect(html.includes(escapeHtml(f.label)), f.id).toBe(true);
    }
    for (const s of SECTIONS) expect(md).toContain(`${s.number}. ${s.title}`);
    expect(html).toContain('<th scope="col">Modality</th>');
  });

  it('reports every required field as missing in an empty summary', () => {
    const result = validateSummary(emptySummary(), { asOf: '2026-11-08' });
    const paths = result.issues.filter((i) => i.severity === 'error').map((i) => i.path);
    for (const f of FIELDS.filter((x) => x.requirement === 'required')) {
      expect(paths.some((p) => p === f.path || p.startsWith(`${f.path}.`)), f.id).toBe(true);
    }
    for (const f of FIELDS.filter((x) => x.requirement === 'where-applicable')) {
      expect(result.issues.some((i) => i.severity === 'warning' && i.path === f.path), f.id).toBe(true);
    }
  });

  it('reports every conditional field once its condition holds', () => {
    // Each case: answer that makes the field required, the field emptied.
    const cases: [string, Record<string, unknown>][] = [
      ['authorised_representative', { 'general_information.provider.authorised_representative': { applicable: true } }],
      ['model_dependencies', { 'general_information.model.model_dependencies': { is_modification: true, models: [] } }],
      ['public_datasets_modalities', { 'data_sources.public_datasets.modalities': { selected: [] } }],
      ['large_public_datasets', { 'data_sources.public_datasets.large_datasets': [], 'data_sources.public_datasets.other_datasets_description': '' }],
      ['other_public_datasets', { 'data_sources.public_datasets.large_datasets': [], 'data_sources.public_datasets.other_datasets_description': '' }],
      ['licensed_datasets_modalities', { 'data_sources.licensed_datasets.modalities': { selected: [] } }],
      ['other_private_datasets_modalities', { 'data_sources.other_private_datasets': { obtained: true, publicly_known_datasets: [{ name: 'X' }] } }],
      ['publicly_known_private_datasets', { 'data_sources.other_private_datasets': { obtained: true, modalities: { selected: ['text'] } } }],
      ['non_publicly_known_private_datasets', { 'data_sources.other_private_datasets': { obtained: true, modalities: { selected: ['text'] } } }],
      ['crawler_names', { 'data_sources.crawled_data.crawler_names': [] }],
      ['crawler_purposes', { 'data_sources.crawled_data.purposes': '' }],
      ['crawler_behaviour', { 'data_sources.crawled_data.crawler_behaviour': '' }],
      ['crawl_period', { 'data_sources.crawled_data.collection_period': { from: null, to: '2025-01' } }],
      ['crawled_content', { 'data_sources.crawled_data.content_description': '' }],
      ['crawled_modalities', { 'data_sources.crawled_data.modalities': { selected: [] } }],
      ['top_domains', { 'data_sources.crawled_data.top_domains': { domains: [] } }],
      ['user_data_services', { 'data_sources.user_data.from_other_services': true, 'data_sources.user_data.modalities': { selected: ['text'] } }],
      ['user_data_modalities', { 'data_sources.user_data.from_model_interactions': true }],
      ['synthetic_data_modalities', { 'data_sources.synthetic_data.modalities': { selected: [] } }],
      ['synthetic_market_models', { 'data_sources.synthetic_data.other_models_information': '' }],
      ['synthetic_other_models', { 'data_sources.synthetic_data.other_models_information': '' }],
      ['other_sources_description', { 'data_sources.other_sources.description': '' }],
    ];
    expect(new Set(cases.map(([id]) => id))).toEqual(new Set(FIELDS.filter((f) => f.requirement === 'conditional').map((f) => f.id)));
    for (const [id, changes] of cases) {
      const data = exampleData();
      for (const [p, v] of Object.entries(changes)) setPath(data, p, v);
      const result = validateSummary(parseSummary(data), { asOf: '2026-11-08' });
      const f = field(id);
      const prefix = f.path.split('.').slice(0, -1).join('.');
      expect(result.issues.some((i) => i.severity === 'error' && (i.path.startsWith(f.path) || i.path.startsWith(prefix))), id).toBe(true);
    }
  });
});

describe('shared specification file', () => {
  it('spec/template-v1.json and the Python copy match the TypeScript source', () => {
    const text = specJsonText();
    expect(readFileSync(join(ROOT, 'spec', 'template-v1.json'), 'utf8')).toBe(text);
    expect(readFileSync(join(ROOT, 'python', 'src', 'sourcebook', 'data', 'template-v1.json'), 'utf8')).toBe(text);
  });

  it('the Python package bundles the same Public Suffix List and licence', () => {
    for (const f of ['public_suffix_list.dat.gz', 'PSL-LICENSE.txt']) {
      expect(readFileSync(join(ROOT, 'python', 'src', 'sourcebook', 'data', f))).toEqual(readFileSync(join(ROOT, 'data', f)));
    }
  });
});

describe('JSON Schemas for editors', () => {
  it('are up to date and accept the example, rejecting unknown keys', () => {
    const summarySchema = summaryJsonSchema();
    expect(JSON.parse(readFileSync(join(ROOT, 'schema', 'summary-v1.schema.json'), 'utf8'))).toEqual(summarySchema);
    expect(JSON.parse(readFileSync(join(ROOT, 'schema', 'inventory-v1.schema.json'), 'utf8'))).toEqual(inventoryJsonSchema());
    const ajv = new Ajv2020({ strict: true, allErrors: true });
    const validate = ajv.compile(summarySchema);
    expect(validate(JSON.parse(JSON.stringify(exampleSummary())))).toBe(true);
    const bad = JSON.parse(JSON.stringify(exampleSummary())) as Record<string, unknown>;
    bad.unexpected = 1;
    expect(validate(bad)).toBe(false);
  });
});
