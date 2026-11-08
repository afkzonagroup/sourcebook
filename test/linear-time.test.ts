// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

// Trimming with regular expressions such as /[ \t]+$/ takes quadratic time on
// a long run of blanks inside a value: 200 000 spaces took about 30 seconds.
// Every input path that trims untrusted text must stay linear. The budgets
// below are generous for linear code and far below the quadratic cost.

import { describe, expect, it } from 'vitest';
import { parseYaml, splitFrontMatter } from '../src/yaml/parse.js';
import { parseSummaryText } from '../src/schema/load.js';
import { SchemaError } from '../src/schema/parse.js';
import { escapeText } from '../src/render/markdown.js';
import { readCsv } from '../src/domains/readers.js';
import { datasetsFromCsvManifest } from '../src/collect/manifest.js';
import { BLANK, trimEndOf, trimOf, trimStartOf } from '../src/util/trim.js';
import { chunks } from './helpers.js';

const BUDGET_MS = 2000;
const gap = ' '.repeat(200_000);

function timed(fn: () => unknown): number {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

async function timedAsync(fn: () => Promise<unknown>): Promise<number> {
  const start = performance.now();
  await fn();
  return performance.now() - start;
}

describe('trimming untrusted text takes linear time', () => {
  it('trims like the regular expressions it replaces', () => {
    for (const s of ['', ' ', '\t \t', 'a', ' a ', '\ta b\t', 'a \t', ' \tb', 'a  b']) {
      expect(trimOf(s, BLANK)).toBe(s.replace(/^[ \t]+|[ \t]+$/g, ''));
      expect(trimEndOf(s, BLANK)).toBe(s.replace(/[ \t]+$/, ''));
      expect(trimStartOf(s, BLANK)).toBe(s.replace(/^[ \t]+/, ''));
    }
  });

  it('YAML plain scalars, keys and quoted strings', () => {
    expect(timed(() => parseYaml(`a: x${gap}y\n`))).toBeLessThan(BUDGET_MS);
    expect(timed(() => parseYaml(`x${gap}y: 1\n`))).toBeLessThan(BUDGET_MS);
    expect(timed(() => parseYaml(`a: 'x${gap}y\n  z'\n`))).toBeLessThan(BUDGET_MS);
    expect(timed(() => parseYaml(`a: "x${gap}y\n  z"\n`))).toBeLessThan(BUDGET_MS);
  });

  it('front matter lines', () => {
    expect(timed(() => splitFrontMatter(`---\na: 1\nx${gap}y\n---\n`))).toBeLessThan(BUDGET_MS);
  });

  it('text values in a JSON summary', () => {
    const json = JSON.stringify({ sourcebook: 1, general_information: { other_characteristics: `x${'\u00a0'.repeat(90_000)}y` } });
    expect(
      timed(() => {
        try {
          parseSummaryText(json, 'json');
        } catch (e) {
          if (!(e instanceof SchemaError)) throw e;
        }
      }),
    ).toBeLessThan(BUDGET_MS);
  });

  it('Markdown lines', () => {
    expect(timed(() => escapeText(`x${gap}y`))).toBeLessThan(BUDGET_MS);
  });

  it('CSV crawl logs and CSV manifests', async () => {
    const row = `https://a.example.com/x${' '.repeat(60_000)}y,10\n`;
    const csv = new TextEncoder().encode(`url,size\n${row.repeat(8)}`);
    expect(
      await timedAsync(async () => {
        let n = 0;
        for await (const r of readCsv(chunks(csv, 65_536), { url: 'url', size: 'size' }, {})) n += r.size > 0n ? 1 : 0;
        expect(n).toBe(8);
      }),
    ).toBeLessThan(BUDGET_MS);
    const manifest = new TextEncoder().encode(`name,category\n${`x${' '.repeat(60_000)}y,public\n`.repeat(8)}`);
    expect(
      await timedAsync(async () => {
        try {
          await datasetsFromCsvManifest(chunks(manifest, 65_536), 'm.csv');
        } catch {
          // Only the time matters here.
        }
      }),
    ).toBeLessThan(BUDGET_MS);
  });
});
