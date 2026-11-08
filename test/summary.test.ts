// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

// Schema, validation and rendering against the shared vectors, plus
// hand-checked rules.

import { describe, expect, it } from 'vitest';
import { parseSummary, SchemaError, type SchemaIssue } from '../src/schema/parse.js';
import { parseJsonSafe, parseSummaryText, JsonInputError } from '../src/schema/load.js';
import { validateSummary, type ValidationResult } from '../src/validate/validate.js';
import { renderMarkdown, escapeInline, escapeText } from '../src/render/markdown.js';
import { renderJson } from '../src/render/json.js';
import { renderHtml, escapeHtml } from '../src/render/html.js';
import { insertIntoModelCard, modelCardSnippet, MODEL_CARD_END, MODEL_CARD_START } from '../src/render/model-card.js';
import { formatMessage, MESSAGES } from '../src/validate/messages.js';
import { addMonths, isIsoDate, isLink } from '../src/schema/checks.js';
import { GENERATOR } from '../src/version.js';
import { createHash } from 'node:crypto';
import { exampleData, exampleSummary, setPath, vectors } from './helpers.js';

interface SummaryVector {
  name: string;
  input: unknown;
  as_of: string;
  normalized: unknown;
  validation: ValidationResult;
  markdown: string;
  markdown_with_instructions: string | null;
  json: string;
  model_card: string;
}

describe('summary vectors (shared with Python)', () => {
  it.each(vectors<SummaryVector[]>('summaries.json').map((v) => [v.name, v] as const))('%s', (_n, v) => {
    const s = parseSummary(v.input);
    expect(JSON.parse(JSON.stringify(s))).toEqual(v.normalized);
    expect(validateSummary(s, { asOf: v.as_of })).toEqual(v.validation);
    expect(renderMarkdown(s)).toBe(v.markdown);
    if (v.markdown_with_instructions !== null) expect(renderMarkdown(s, { instructions: true })).toBe(v.markdown_with_instructions);
    expect(renderJson(s).replace(GENERATOR, '(generator)')).toBe(v.json);
    expect(modelCardSnippet(s, { summaryUrl: 'https://example.org/summary' })).toBe(v.model_card);
  });

  it.each(vectors<{ name: string; input: unknown; issues: SchemaIssue[] }[]>('schema-errors.json').map((v) => [v.name, v] as const))('schema errors: %s', (_n, v) => {
    let err: unknown;
    try {
      parseSummary(v.input);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(SchemaError);
    expect((err as SchemaError).issues).toEqual(v.issues);
  });
});

describe('validation rules', () => {
  const asOf = '2026-11-08';
  const codes = (r: ValidationResult): string[] => r.issues.map((i) => `${i.severity}:${i.code}`);

  it('accepts the complete example', () => {
    const r = validateSummary(exampleSummary(), { asOf });
    expect(r).toMatchObject({ ok: true, errors: 0, warnings: 0, legacy_model: false });
  });

  it('allows stated information gaps only for models placed on the market before 2 August 2025', () => {
    const data = exampleData();
    setPath(data, 'data_sources.crawled_data.top_domains', { domains: [] });
    setPath(data, 'information_gaps', [{ field: 'top_domains', justification: 'Old logs were deleted.' }]);
    const recent = validateSummary(parseSummary(data), { asOf });
    expect(codes(recent)).toEqual(expect.arrayContaining(['error:top-domains-empty', 'warning:gap-not-allowed']));
    setPath(data, 'general_information.model.placement_dates', [
      { model: 'Nimbus-7B-v1.1', date: '2025-08-01' },
      { model: 'Nimbus-7B-Instruct-v1.1', date: '2025-08-01' },
    ]);
    const legacy = validateSummary(parseSummary(data), { asOf });
    expect(legacy.ok).toBe(true);
    expect(legacy.legacy_model).toBe(true);
    expect(codes(legacy)).toEqual(['info:legacy-model', 'info:gap-stated']);
    // 2 August 2025 itself is not "before 2 August 2025".
    setPath(data, 'general_information.model.placement_dates', [
      { model: 'Nimbus-7B-v1.1', date: '2025-08-02' },
      { model: 'Nimbus-7B-Instruct-v1.1', date: '2025-08-02' },
    ]);
    expect(validateSummary(parseSummary(data), { asOf }).legacy_model).toBe(false);
    // A summary that also covers a later model, or one not yet placed, may not use gap statements.
    setPath(data, 'general_information.model.placement_dates', [
      { model: 'Nimbus-7B-v1.1', date: '2025-08-01' },
      { model: 'Nimbus-7B-Instruct-v1.1', date: '2025-09-15' },
    ]);
    const mixed = validateSummary(parseSummary(data), { asOf });
    expect(mixed.legacy_model).toBe(false);
    expect(codes(mixed)).toEqual(expect.arrayContaining(['error:top-domains-empty', 'warning:gap-not-allowed']));
    setPath(data, 'general_information.model.placement_dates', [
      { model: 'Nimbus-7B-v1.1', date: '2025-08-01' },
      { model: 'Nimbus-7B-Instruct-v1.1', date: null },
    ]);
    expect(validateSummary(parseSummary(data), { asOf }).legacy_model).toBe(false);
  });

  it('does not let a gap statement replace a required answer for a new model', () => {
    const data = exampleData();
    setPath(data, 'data_processing.tdm_reservations.measures', '');
    setPath(data, 'information_gaps', [{ field: 'tdm_measures', justification: 'Not documented.' }]);
    const r = validateSummary(parseSummary(data), { asOf });
    expect(codes(r)).toEqual(['error:missing', 'warning:gap-not-allowed']);
  });

  it('asks for an update six months after the last one when the model keeps training', () => {
    const data = exampleData();
    setPath(data, 'general_information.latest_data_collection.continuous_training', true);
    setPath(data, 'last_update', '2026-05-07');
    expect(codes(validateSummary(parseSummary(data), { asOf }))).toContain('warning:update-due');
    setPath(data, 'last_update', '2026-05-08');
    expect(codes(validateSummary(parseSummary(data), { asOf }))).not.toContain('warning:update-due');
    setPath(data, 'last_update', '2026-12-01');
    expect(codes(validateSummary(parseSummary(data), { asOf }))).toContain('warning:last-update-future');
  });

  it('accepts a text size in another unit instead of a range', () => {
    const data = exampleData();
    setPath(data, 'general_information.modalities.text', { present: true, size_other_unit: 'about 2 TB of UTF-8 text', types_of_content: 'Web text.' });
    expect(validateSummary(parseSummary(data), { asOf }).ok).toBe(true);
  });

  it('requires the reason when no authorised representative is needed', () => {
    const data = exampleData();
    setPath(data, 'general_information.provider.authorised_representative', { applicable: false });
    expect(codes(validateSummary(parseSummary(data), { asOf }))).toContain('error:authorised-representative-reason');
  });

  it('checks that modalities in Section 2 appear in Section 1.3', () => {
    const data = exampleData();
    setPath(data, 'data_sources.public_datasets.modalities', { selected: ['text', 'image'], other: 'point clouds' });
    const r = validateSummary(parseSummary(data), { asOf });
    expect(r.issues.filter((i) => i.code === 'modality-not-in-overview').map((i) => i.message)).toEqual([
      'Section 2.1: modality Image is ticked here but not selected in Section 1.3.',
      'Section 2.1: modality Other is ticked here but not selected in Section 1.3.',
    ]);
  });

  it('rejects an invalid as-of date', () => {
    expect(() => validateSummary(exampleSummary(), { asOf: '2026-02-30' })).toThrow(RangeError);
  });

  it('fills message placeholders', () => {

    expect(formatMessage('missing', { section: '2.3', label: 'X:' })).toBe('Section 2.3, “X:”: required by the template but not filled in.');
    expect(Object.keys(MESSAGES).length).toBeGreaterThan(30);
  });
});

describe('Markdown output is safe', () => {
  const hostile = vectors<SummaryVector[]>('summaries.json').find((v) => v.name === 'hostile-text')?.markdown ?? '';

  it('cannot inject HTML, links, images, headings or lists', () => {
    expect(hostile).not.toContain('<script>');
    expect(hostile).toContain('\\<script\\>');
    expect(hostile).not.toMatch(/(^|[^\\])\[click\]\(/);
    expect(hostile).not.toMatch(/(^|[^\\])!\[img\]/);
    expect(hostile).toContain('\\# Heading?');
    expect(hostile).toContain('\\- list item');
    expect(hostile).toContain('1\\. ordered');
    expect(hostile).toContain('\\$x^2\\$');
    expect(hostile).not.toContain('\n    indented');
  });

  it('escapes inline text and keeps paragraphs', () => {
    expect(escapeInline('a *b* [c](d) <e> | f')).toBe('a \\*b\\* \\[c\\](d) \\<e\\> \\| f');
    expect(escapeText('one\ntwo\n\n\n- three')).toBe('one\ntwo\n\n\\- three');
    expect(escapeText('1.5 million')).toBe('1.5 million');
    expect(escapeText('2) item')).toBe('2\\) item');
  });
});

describe('HTML output is safe and self-contained', () => {
  const data = exampleData();
  setPath(data, 'general_information.provider.name_and_contact_details', '<img src=x onerror=alert(1)> "quotes" & \'single\'');
  setPath(data, 'data_sources.public_datasets.large_datasets', [{ name: '<b>x</b>', link: 'https://example.org/?a=1&b=2' }]);
  const html = renderHtml(parseSummary(data));

  it('escapes every text and attribute', () => {
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt; &quot;quotes&quot; &amp; &#39;single&#39;');
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(html).toContain('href="https://example.org/?a=1&amp;b=2"');
    expect(escapeHtml('<>&"\'')).toBe('&lt;&gt;&amp;&quot;&#39;');
  });

  it('has no scripts and a CSP that allows only its own stylesheet', () => {
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<[^>]*\son[a-z]+=/i);
    expect(html).not.toMatch(/style="/);
    const css = /<style>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? '';
    const hash = createHash('sha256').update(css, 'utf8').digest('base64');
    expect(html).toContain(`default-src 'none'; style-src 'sha256-${hash}'; img-src 'none'; base-uri 'none'; form-action 'none'`);
  });

  it('never links a URL that is not http(s), even if a caller skips parseSummary', () => {
    const s = exampleSummary();
    const first = s.data_sources.public_datasets.large_datasets[0];
    if (first !== undefined) first.link = 'javascript:alert(1)';
    const out = renderHtml(s);
    expect(out).not.toContain('href="javascript');
    expect(out).toContain('javascript:alert(1)');
  });

  it('never makes a Markdown link of a URL that is not http(s), even if a caller skips parseSummary', () => {
    const s = exampleSummary();
    const first = s.data_sources.public_datasets.large_datasets[0];
    const model = s.general_information.model.versioned_model_names[0];
    if (first === undefined || model === undefined) throw new Error('example changed');
    first.link = 'javascript:alert(1)';
    model.documentation_links = ['https://a.example/x> [y](javascript:alert(2)'];
    const out = renderMarkdown(s);
    expect(out).not.toContain('<javascript:');
    expect(out).not.toMatch(/(?<!\\)\]\(<?javascript/);
    expect(out).toContain('javascript:alert(1)');
    expect(out).toContain('https://a.example/x\\> \\[y\\](javascript:alert(2)');
  });

  it('only links validated http(s) URLs, without referrer', () => {
    expect([...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]).every((h) => /^https?:\/\//.test(h ?? ''))).toBe(true);
    expect(html).toContain('rel="noopener noreferrer"');
    expect(isLink('javascript:alert(1)')).toBe(false);
    expect(isLink('https://example.com:99999/')).toBe(false);
  });

  it('carries the attribution footer and the template citation', () => {
    expect(html).toContain('<a href="https://afkzonagroup.lt" rel="noopener noreferrer">Sourcebook by AFKzona Group</a>');
    expect(html).toContain('C(2025) 8311 final');
    expect(html).toContain('<title>Public Summary of Training Content: Nimbus-7B-v1.1, Nimbus-7B-Instruct-v1.1</title>');
  });

  it('has a print variant with an A4 page and the same content', () => {
    const print = renderHtml(exampleSummary(), { variant: 'print' });
    expect(print).toContain('@page{size:A4');
    expect(print.replace(/<style>[\s\S]*?<\/style>/, '').replace(/sha256-[^']+/, '')).toBe(renderHtml(exampleSummary()).replace(/<style>[\s\S]*?<\/style>/, '').replace(/sha256-[^']+/, ''));
    expect(renderHtml(exampleSummary(), { lang: 'x"><script>' })).toContain('<html lang="en">');
  });
});

describe('model card', () => {
  it('links to the full summary and can embed it', () => {
    const s = exampleSummary();
    const link = modelCardSnippet(s, { summaryUrl: 'https://example.org/s' });
    expect(link.startsWith(MODEL_CARD_START)).toBe(true);
    expect(link.trimEnd().endsWith(MODEL_CARD_END)).toBe(true);
    expect(link).toContain('- Full summary: <https://example.org/s>');
    const full = modelCardSnippet(s, { summaryUrl: 'https://example.org/s', mode: 'full' });
    expect(full).toContain('### 1. General information');
    expect(() => modelCardSnippet(s, { summaryUrl: 'javascript:alert(1)' })).toThrow(RangeError);
  });

  it('replaces an existing section and keeps the front matter', () => {
    const snippet = modelCardSnippet(exampleSummary(), { summaryUrl: 'https://example.org/s' });
    const card = '---\nlicense: apache-2.0\n---\n# Model\n';
    const once = insertIntoModelCard(card, snippet);
    expect(once.startsWith('---\nlicense: apache-2.0\n---\n# Model\n\n<!-- sourcebook:start -->')).toBe(true);
    expect(insertIntoModelCard(once, snippet)).toBe(once);
    expect(insertIntoModelCard('no newline', snippet)).toBe(`no newline\n\n${snippet}`);
    expect(() => insertIntoModelCard(`${MODEL_CARD_START}\n`, snippet)).toThrow(RangeError);
    expect(() => insertIntoModelCard(`${MODEL_CARD_END}\n${MODEL_CARD_START}\n`, snippet)).toThrow(RangeError);
  });
});

describe('loading summary files', () => {
  it('reads YAML and JSON', () => {
    expect(parseSummaryText(renderJson(exampleSummary()).replace(/^[\s\S]*?"summary": /, '').replace(/\n}\n$/, ''))).toEqual(exampleSummary());
    expect(parseSummaryText('sourcebook: 1\n').sourcebook).toBe(1);
  });

  it('rejects deeply nested and malformed JSON before parsing it', () => {
    expect(() => parseJsonSafe('['.repeat(10_000) + ']'.repeat(10_000))).toThrow(JsonInputError);
    expect(() => parseJsonSafe('{"a": "[[[[" }')).not.toThrow();
    expect(() => parseJsonSafe('{bad')).toThrow(JsonInputError);
  });

  it('rejects unknown keys such as __proto__ from JSON', () => {
    expect(() => parseSummaryText('{"sourcebook": 1, "__proto__": {"x": 1}}', 'json')).toThrow(SchemaError);
    expect(({} as Record<string, unknown>).x).toBeUndefined();
  });

  it('checks dates', () => {
    expect([isIsoDate('2024-02-29'), isIsoDate('2023-02-29'), isIsoDate('2026-13-01'), isIsoDate('1899-01-01')]).toEqual([true, false, false, false]);
    expect([addMonths('2026-08-31', 6), addMonths('2026-01-31', 1), addMonths('2024-08-29', 6)]).toEqual(['2027-02-28', '2026-02-28', '2025-02-28']);
  });
});

describe('information gaps for each kind of required answer (models placed before 2 August 2025)', () => {
  const legacyDates = [
    { model: 'Nimbus-7B-v1.1', date: '2024-05-01' },
    { model: 'Nimbus-7B-Instruct-v1.1', date: '2024-05-01' },
  ];
  const cases: [string, Record<string, unknown>][] = [
    ['modalities', { 'general_information.modalities': { text: { present: false } } }],
    ['large_public_datasets', { 'data_sources.public_datasets.large_datasets': [], 'data_sources.public_datasets.other_datasets_description': '' }],
    ['non_publicly_known_private_datasets', { 'data_sources.other_private_datasets': { obtained: true, modalities: { selected: ['text'] } } }],
    ['synthetic_other_models', { 'data_sources.synthetic_data.other_models_information': '' }],
    ['synthetic_market_models', { 'data_sources.synthetic_data.other_models_information': '' }],
    ['linguistic_characteristics', { 'general_information.linguistic_characteristics': '' }],
    ['tdm_measures', { 'data_processing.tdm_reservations.measures': '' }],
    ['placement_dates', { 'general_information.model.placement_dates': [{ model: 'Nimbus-7B-v1.1', date: '2024-05-01' }] }],
  ];
  it.each(cases)('%s', (id, changes) => {
    const data = exampleData();
    setPath(data, 'general_information.model.placement_dates', legacyDates);
    for (const [k, v] of Object.entries(changes)) setPath(data, k, v);
    const without = validateSummary(parseSummary(data), { asOf: '2026-11-08' });
    expect(without.ok, 'fails without a gap statement').toBe(id === 'linguistic_characteristics');
    setPath(data, 'information_gaps', [{ field: id, justification: 'Not available for this older model.' }]);
    const r = validateSummary(parseSummary(data), { asOf: '2026-11-08' });
    expect(r.errors).toBe(0);
    // With no modality in Section 1.3, the ticks in Section 2 are still flagged as warnings.
    expect(r.warnings).toBe(id === 'modalities' ? 4 : 0);
    if (id !== 'placement_dates') expect(r.issues.some((i) => i.code === 'gap-stated')).toBe(true);
  });

  it('prints gap statements in the box of their section', () => {
    const data = exampleData();
    setPath(data, 'general_information.model.placement_dates', legacyDates);
    setPath(data, 'general_information.linguistic_characteristics', '');
    setPath(data, 'data_processing.illegal_content.measures', '');
    setPath(data, 'information_gaps', [
      { field: 'linguistic_characteristics', justification: 'Language identification was not run.' },
      { field: 'illegal_content_measures', justification: 'Records were not kept.' },
    ]);
    const md = renderMarkdown(parseSummary(data));
    const box13 = md.slice(md.indexOf('### 1.3.'), md.indexOf('## 2.'));
    expect(box13).toContain('Information gaps (Explanatory Notice, point 33):');
    expect(box13).toContain('Language identification was not run.');
    const box33 = md.slice(md.indexOf('### 3.3.'));
    expect(box33).toContain('Records were not kept.');
  });
});
