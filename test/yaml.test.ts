// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_YAML_LIMITS, parseYaml, splitFrontMatter, YamlError, type YamlLimits } from '../src/yaml/parse.js';
import { summaryToYaml, yamlString } from '../src/yaml/emit.js';
import { emptySummary } from '../src/schema/empty.js';
import { parseSummary } from '../src/schema/parse.js';
import { exampleSummary, fixture, vectors } from './helpers.js';

interface YamlVector {
  name: string;
  input: string;
  limits?: YamlLimits;
  expect?: unknown;
  error?: string;
  line?: number;
}

describe('YAML vectors (shared with Python)', () => {
  it.each(vectors<YamlVector[]>('yaml.json').map((v) => [v.name, v] as const))('%s', (_name, v) => {
    if (v.error === undefined) {
      expect(JSON.parse(JSON.stringify(parseYaml(v.input, v.limits ?? DEFAULT_YAML_LIMITS)))).toEqual(v.expect);
    } else {
      let err: unknown;
      try {
        parseYaml(v.input, v.limits ?? DEFAULT_YAML_LIMITS);
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(YamlError);
      expect((err as YamlError).code).toBe(v.error);
      expect((err as YamlError).line).toBe(v.line);
    }
  });
});

describe('YAML semantics checked by hand', () => {
  it('reads the core schema: "no" stays a string, numbers and booleans are typed', () => {
    expect(parseYaml('a: no\nb: true\nc: 1.5\nd: "true"\ne: 007\n')).toEqual({ a: 'no', b: true, c: 1.5, d: 'true', e: 7 });
  });

  it('keeps folded and literal block scalars as YAML 1.2 defines them', () => {
    expect(parseYaml('a: >-\n  one\n  two\n')).toEqual({ a: 'one two' });
    expect(parseYaml('a: |\n  one\n  two\n')).toEqual({ a: 'one\ntwo\n' });
  });

  it('builds mappings without a prototype, so keys cannot reach Object.prototype', () => {
    const v = parseYaml('a: 1') as Record<string, unknown>;
    expect(Object.getPrototypeOf(v)).toBeNull();
    expect(() => parseYaml('__proto__:\n  polluted: yes\n')).toThrow(YamlError);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('hostile YAML', () => {
  it('rejects a billion-laughs document at the first anchor', () => {
    const bomb = ['a: &a ["lol","lol","lol","lol","lol","lol","lol","lol","lol"]', ...Array.from({ length: 8 }, (_, i) => `${String.fromCharCode(98 + i)}: &${String.fromCharCode(98 + i)} [*${String.fromCharCode(97 + i)},*${String.fromCharCode(97 + i)},*${String.fromCharCode(97 + i)},*${String.fromCharCode(97 + i)}]`)].join('\n');
    expect(() => parseYaml(bomb)).toThrow(expect.objectContaining({ code: 'anchor-alias-tag' }) as Error);
  });

  it('stops deep nesting in flow and block style at the depth limit', () => {
    expect(() => parseYaml(`a: ${'['.repeat(100_000)}${']'.repeat(100_000)}`)).toThrow(expect.objectContaining({ code: 'too-deep' }) as Error);
    expect(() => parseYaml(`${Array.from({ length: 100 }, (_, i) => '- '.padStart(2 * i + 2, ' ')).join('\n')}x`)).toThrow(YamlError);
  });

  it('stops documents with too many values', () => {
    const many = `a: [${Array.from({ length: 300_000 }, () => '1').join(',')}]`;
    expect(() => parseYaml(many)).toThrow(expect.objectContaining({ code: 'too-many-nodes' }) as Error);
  });

  it('rejects long scalars and long keys', () => {
    const limits = { ...DEFAULT_YAML_LIMITS, maxScalarLength: 10 };
    expect(() => parseYaml('a: "01234567890"', limits)).toThrow(expect.objectContaining({ code: 'scalar-too-long' }) as Error);
    expect(() => parseYaml('abcdefghijklmnop: 1', limits)).toThrow(expect.objectContaining({ code: 'scalar-too-long' }) as Error);
  });

  it('parses a large real card in reasonable time (no quadratic behaviour)', () => {
    const text = readFileSync(fixture('hf/wikimedia_wikipedia.README.md'), 'utf8');
    const start = performance.now();
    for (let i = 0; i < 5; i++) parseYaml(splitFrontMatter(text).yaml ?? '');
    expect(performance.now() - start).toBeLessThan(2000);
  });
});

describe('real Hugging Face dataset cards', () => {
  it('parses every card fixture exactly as the Hub did (cardData in the API response)', () => {
    const names = readdirSync(fixture('hf')).filter((f) => f.endsWith('.README.md')).map((f) => f.slice(0, -10));
    expect(names.length).toBeGreaterThanOrEqual(14);
    for (const name of names) {
      const api = JSON.parse(readFileSync(fixture(`hf/${name}.api.json`), 'utf8')) as { cardData?: unknown };
      const fm = splitFrontMatter(readFileSync(fixture(`hf/${name}.README.md`), 'utf8'));
      expect(JSON.parse(JSON.stringify(parseYaml(fm.yaml ?? ''))), name).toEqual(api.cardData);
    }
  });

  it('splits front matter, and rejects an unterminated one', () => {
    expect(splitFrontMatter('# Title\n')).toEqual({ yaml: null, firstLine: 1, body: '# Title\n' });
    expect(splitFrontMatter('---\na: 1\n---\nbody').yaml).toBe('a: 1');
    expect(splitFrontMatter('\ufeff---\r\na: 1\r\n...\r\nbody').body).toBe('body');
    expect(() => splitFrontMatter('---\na: 1\n')).toThrow(expect.objectContaining({ code: 'unterminated-front-matter' }) as Error);
  });
});

describe('YAML writer', () => {
  it('round-trips the example and the empty summary', () => {
    for (const s of [exampleSummary(), emptySummary()]) expect(parseSummary(parseYaml(summaryToYaml(s)))).toEqual(s);
  });

  it('writes awkward strings so that they read back unchanged', () => {
    for (const s of ['plain', ' leading', 'trailing ', 'a\nb', 'a \nb', '  indented\nx', 'quote " and \\ backslash', '# hash', '- dash', 'key: value', 'tab\there', 'é中']) {
      expect(parseYaml(`k: ${yamlString(s, '')}\n`), JSON.stringify(s)).toEqual({ k: s });
    }
  });

  it('writes the template instructions as comments', () => {
    const y = summaryToYaml(emptySummary(), { 'data_sources.crawled_data.top_domains': ['Domain list: 3 domains.'] });
    expect(y).toContain('# 2.3 Summary of the most relevant domain names crawled:');
    expect(y).toContain('# Collected: Domain list: 3 domains.');
    expect(y).toContain('# Choices: below_1b_tokens, 1b_to_10t_tokens, above_10t_tokens');
  });
});
