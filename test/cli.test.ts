// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { clean, HELP, run } from '../src/cli/run.js';
import { runAction, escapeData, escapeProperty, workspaceFile, writeOutputs } from '../src/action/run.js';
import { ROOT, fixture, tempDir } from './helpers.js';

const tmp = tempDir();
afterAll(tmp.done);

async function cli(args: string[], options = {}): Promise<{ code: number; out: string; err: string }> {
  let out = '';
  let err = '';
  const code = await run(args, { stdout: (t) => (out += t), stderr: (t) => (err += t) }, { today: '2026-11-08', ...options });
  return { code, out, err };
}

const p = (name: string): string => join(tmp.dir, name);

describe('command line tool', () => {
  it('prints help with the attribution, and the version', async () => {
    const h = await cli(['--help']);
    expect(h.code).toBe(0);
    expect(h.out).toContain('Sourcebook by AFKzona Group (https://afkzonagroup.lt)');
    expect((await cli([])).code).toBe(2);
    expect((await cli(['--version'])).out).toBe('0.1.0\n');
    expect(HELP).toContain('only to https://huggingface.co');
  });

  it('runs the whole flow: collect, init, validate, render', async () => {
    expect((await cli(['collect', 'hf', fixture('hf/rajpurkar_squad.README.md'), '--id', 'rajpurkar/squad', '--out', p('hf.json')])).code).toBe(0);
    expect((await cli(['collect', 'manifest', fixture('parquet/text.parquet'), '--name', 'Corpus', '--category', 'licensed', '--out', p('pq.json')])).code).toBe(0);
    const crawl = await cli(['collect', 'crawl', fixture('crawl/sample.warc.gz'), '--out', p('crawl.json'), '--list-out', p('domains.txt')]);
    expect(crawl.code).toBe(0);
    expect(crawl.err).toContain('domains');
    expect(readFileSync(p('domains.txt'), 'utf8')).toContain('example.net');
    expect((await cli(['init', '--from', p('hf.json'), '--from', p('pq.json'), '--from', p('crawl.json'), '--out', p('summary.yaml')])).code).toBe(0);
    const yaml = readFileSync(p('summary.yaml'), 'utf8');
    expect(yaml).toContain('        - "example.net"');
    expect(yaml).toContain('concluded: true');
    const v = await cli(['validate', p('summary.yaml')]);
    expect(v.code).toBe(1);
    expect(v.out).toContain('ERROR [missing]');
    expect((await cli(['render', p('summary.yaml')])).code).toBe(1);
    const draft = await cli(['render', p('summary.yaml'), '--allow-invalid', '--format', 'html', '--out', p('draft.html')]);
    expect(draft.code).toBe(0);
    expect(readFileSync(p('draft.html'), 'utf8')).toContain('<!doctype html>');
  });

  it('validates and renders the example in every format', async () => {
    const ex = join(ROOT, 'examples', 'summary.yaml');
    expect((await cli(['validate', ex])).out).toContain('0 errors, 0 warnings.');
    const json = await cli(['validate', ex, '--format', 'json']);
    expect(JSON.parse(json.out)).toMatchObject({ ok: true, errors: 0 });
    for (const format of ['markdown', 'html', 'print-html', 'json']) expect((await cli(['render', ex, '--format', format])).code, format).toBe(0);
    const card = await cli(['render', ex, '--format', 'model-card', '--summary-url', 'https://example.org/s']);
    expect(card.out).toContain('<!-- sourcebook:start -->');
    writeFileSync(p('README.md'), '---\nlicense: mit\n---\n# Model\n');
    const inserted = await cli(['render', ex, '--format', 'model-card', '--summary-url', 'https://example.org/s', '--readme', p('README.md'), '--mode', 'full']);
    expect(inserted.out.startsWith('---\nlicense: mit\n---\n# Model\n')).toBe(true);
    expect((await cli(['render', ex, '--format', 'model-card'])).code).toBe(2);
    expect((await cli(['init', '--format', 'json'])).out).toContain('"format": "sourcebook-summary"');
  });

  it('reads manifests and the CSV crawl options', async () => {
    writeFileSync(p('m.json'), JSON.stringify({ datasets: [{ name: 'A', category: 'public', modalities: ['text'], sizes: [{ modality: 'text', value: 10, unit: 'tokens' }] }] }));
    writeFileSync(p('m.csv'), 'name,category,modality\nB,synthetic,text\n');
    const m = await cli(['collect', 'manifest', p('m.json'), p('m.csv')]);
    expect(m.code).toBe(0);
    expect((JSON.parse(m.out) as { datasets: unknown[] }).datasets).toHaveLength(2);
    writeFileSync(p('log.tsv'), 'host\ttokens\tkind\nexample.com\t5\ttext\n');
    const c = await cli(['collect', 'crawl', p('log.tsv'), '--csv-host', 'host', '--csv-size', 'tokens', '--csv-modality', 'kind', '--unit', 'tokens', '--sme', '--ties', 'cut', '--modality-mode', 'per-modality']);
    expect(c.code).toBe(0);
    expect((JSON.parse(c.out) as { domain_report: { method: unknown } }).domain_report.method).toMatchObject({ size_unit: 'tokens', threshold: 'sme-top-5-percent-or-1000', ties: 'cut', modality_mode: 'per-modality' });
    expect((await cli(['collect', 'crawl', fixture('crawl/sample.cdx'), fixture('crawl/sample.cdxj')])).code).toBe(2);
    expect((await cli(['collect', 'crawl', fixture('crawl/sample.cdx'), '--unit', 'tokens'])).code).toBe(2);
    expect((await cli(['collect', 'crawl', fixture('crawl/sample.cdx'), '--csv-size', 'x'])).code).toBe(2);
    expect((await cli(['collect', 'crawl', p('m.json')])).code).toBe(2);
    expect((await cli(['collect', 'crawl', fixture('crawl/sample.cdx'), '--max-domains', '1'])).err).toContain('More than 1 distinct domains');
  });

  it('uses the network only with --online, and only through the Hub client', async () => {
    const calls: string[] = [];
    const fetch = (u: string): Promise<Response> => {
      calls.push(u);
      return Promise.resolve(u.includes('/api/') ? new Response(readFileSync(fixture('hf/openai_gsm8k.api.json'), 'utf8')) : new Response(readFileSync(fixture('hf/openai_gsm8k.README.md'), 'utf8')));
    };
    const offline = await cli(['collect', 'hf', fixture('hf/openai_gsm8k.README.md')], { fetch });
    expect(offline.code).toBe(0);
    expect(calls).toHaveLength(0);
    const online = await cli(['collect', 'hf', '--online', 'openai/gsm8k', '--timeout', '5'], { fetch });
    expect(online.code).toBe(0);
    expect(calls.every((u) => u.startsWith('https://huggingface.co/'))).toBe(true);
    expect((JSON.parse(online.out) as { datasets: { source: { kind: string } }[] }).datasets[0]?.source.kind).toBe('hf-hub');
    expect((await cli(['collect', 'hf', '--online', '../../etc/passwd'], { fetch })).code).toBe(2);
    expect((await cli(['collect', 'hf', fixture('hf/openai_gsm8k.README.md'), '--revision', 'x'], { fetch })).code).toBe(2);
  });

  it('never overwrites a file without --force and never writes through a symbolic link', async () => {
    writeFileSync(p('exists.yaml'), 'keep');
    const r = await cli(['init', '--out', p('exists.yaml')]);
    expect(r.code).toBe(2);
    expect(r.err).toContain('--force');
    expect(readFileSync(p('exists.yaml'), 'utf8')).toBe('keep');
    expect((await cli(['init', '--out', p('exists.yaml'), '--force'])).code).toBe(0);
    expect(statSync(p('exists.yaml')).mode & 0o777).toBe(0o644);
    writeFileSync(p('target.txt'), 'secret');
    symlinkSync(p('target.txt'), p('link.yaml'));
    const l = await cli(['init', '--out', p('link.yaml'), '--force']);
    expect(l.code).toBe(2);
    expect(readFileSync(p('target.txt'), 'utf8')).toBe('secret');
  });

  it('reports input errors without stack traces and with control characters removed', async () => {
    writeFileSync(p('bad.yaml'), 'a: &x 1\n');
    const y = await cli(['validate', p('bad.yaml')]);
    expect(y.code).toBe(2);
    expect(y.err).toContain('Anchors, aliases and tags are not supported');
    expect(y.err).not.toContain('    at ');
    writeFileSync(p('keys.yaml'), 'sourcebook: 1\n"evil\\u001b[31mkey": 1\n');
    const k = await cli(['validate', p('keys.yaml')]);
    expect(k.err).toContain('evil?[31mkey');
    expect(k.err).not.toContain('\u001b');
    expect((await cli(['validate', p('missing.yaml')])).err).toContain('Cannot open');
    writeFileSync(p('big.yaml'), 'x'.repeat(9 * 1024 * 1024));
    expect((await cli(['validate', p('big.yaml')])).err).toContain('larger than');
    writeFileSync(p('latin1.yaml'), Buffer.from([0x61, 0x3a, 0x20, 0xe9, 0x0a]));
    expect((await cli(['validate', p('latin1.yaml')])).err).toContain('not valid UTF-8');
    mkdirSync(p('dir.yaml'));
    expect((await cli(['validate', p('dir.yaml')])).err).toContain('not a regular file');
    expect(clean('a\u202eb\u0007c')).toBe('a?b?c');
  });

  it('rejects unknown commands, options and bad values', async () => {
    for (const args of [['nope'], ['collect'], ['collect', 'x'], ['init', '--bogus'], ['init', 'file'], ['validate'], ['validate', 'a', '--as-of', '2026-02-30'], ['validate', 'a', '--strict=yes'], ['render', 'a', '--format', 'pdf'], ['collect', 'crawl', 'a.warc', '--max-records', '0'], ['collect', 'manifest', 'a.txt'], ['collect', 'manifest', fixture('parquet/text.parquet')], ['init', '--out'], ['init', '--format', 'xml', '--format', 'json'], ['collect', 'hf', 'x', '--category', 'stolen']]) {
      expect((await cli(args)).code, args.join(' ')).toBe(2);
    }
  });

  it('rejects files that are not Parquet', async () => {
    writeFileSync(p('fake.parquet'), 'PAR1 not really PAR1');
    expect((await cli(['collect', 'manifest', p('fake.parquet'), '--name', 'x'])).code).toBe(2);
    copyFileSync(fixture('parquet/text.parquet'), p('copy.parquet'));
    const bytes = readFileSync(p('copy.parquet'));
    bytes[0] = 0x58;
    writeFileSync(p('copy.parquet'), bytes);
    expect((await cli(['collect', 'manifest', p('copy.parquet'), '--name', 'x'])).err).toContain('no PAR1 marker');
  });
});

describe('GitHub Action', () => {
  const ws = join(tmp.dir, 'workspace');
  mkdirSync(ws, { recursive: true });
  copyFileSync(join(ROOT, 'examples', 'summary.yaml'), join(ws, 'training-content-summary.yaml'));

  async function action(env: Record<string, string>): Promise<{ code: number; out: string; output: string; summary: string }> {
    const outFile = join(tmp.dir, `out-${Math.random().toString(36).slice(2)}`);
    const sumFile = `${outFile}-summary`;
    writeFileSync(outFile, '');
    writeFileSync(sumFile, '');
    let out = '';
    const code = await runAction({ GITHUB_WORKSPACE: ws, GITHUB_OUTPUT: outFile, GITHUB_STEP_SUMMARY: sumFile, INPUT_AS_OF: '2026-11-08', ...env }, { stdout: (t) => (out += t), stderr: (t) => (out += t) });
    return { code, out, output: readFileSync(outFile, 'utf8'), summary: readFileSync(sumFile, 'utf8') };
  }

  it('passes a complete summary and writes outputs', async () => {
    const r = await action({});
    expect(r.code).toBe(0);
    expect(r.output).toBe('errors=0\nwarnings=0\nvalid=true\n');
    expect(r.summary).toContain('Sourcebook by AFKzona Group');
  });

  it('annotates problems with escaped workflow commands', async () => {
    writeFileSync(join(ws, 'bad.yaml'), 'sourcebook: 1\nsummary_version:\n  version: "1"\n');
    const r = await action({ INPUT_SUMMARY: 'bad.yaml', INPUT_STRICT: 'true' });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/^::error file=bad.yaml,title=Sourcebook Section 1.1::Section 1.1, “Provider name and contact details:”/m);
    expect(r.output).toMatch(/^errors=\d+\nwarnings=\d+\nvalid=false\n$/);
    expect(escapeData('a%b\r\nc')).toBe('a%25b%0D%0Ac');
    expect(escapeProperty('a:b,c')).toBe('a%3Ab%2Cc');
  });

  it('fails on warnings only in strict mode', async () => {
    writeFileSync(join(ws, 'warn.yaml'), readFileSync(join(ROOT, 'examples', 'summary.yaml'), 'utf8').replace(/ {2}other_characteristics: >-\n( {4}.*\n)+/, ''));
    expect((await action({ INPUT_SUMMARY: 'warn.yaml' })).code).toBe(0);
    expect((await action({ INPUT_SUMMARY: 'warn.yaml', INPUT_STRICT: 'true' })).code).toBe(1);
  });

  it('refuses files outside the workspace, symbolic links and bad inputs', async () => {
    writeFileSync(join(tmp.dir, 'outside.yaml'), 'sourcebook: 1\n');
    symlinkSync(join(tmp.dir, 'outside.yaml'), join(ws, 'link.yaml'));
    for (const [env, text] of [
      [{ INPUT_SUMMARY: '../outside.yaml' }, 'inside the repository'],
      [{ INPUT_SUMMARY: join(tmp.dir, 'outside.yaml') }, 'inside the repository'],
      [{ INPUT_SUMMARY: 'link.yaml' }, 'symbolic link'],
      [{ INPUT_SUMMARY: 'missing.yaml' }, 'does not exist'],
      [{ INPUT_STRICT: 'yes' }, 'strict must be'],
      [{ INPUT_AS_OF: 'tomorrow' }, 'as-of must be'],
      [{ INPUT_INVENTORY: '../outside.yaml' }, 'inside the repository'],
    ] as const) {
      const r = await action(env);
      expect(r.code, JSON.stringify(env)).toBe(2);
      expect(r.out).toContain(text);
      expect(r.output).toBe('');
    }
    expect(() => workspaceFile(ws, '.')).toThrow();
    expect(() => workspaceFile(ws, 'a\0b')).toThrow();
    expect((await runAction({}, { stdout: () => undefined, stderr: () => undefined }))).toBe(2);
  });

  it('cannot be tricked into writing extra outputs through a file name', async () => {
    writeFileSync(join(ws, 'x%0Avalid=true.yaml'), 'sourcebook: 1\n');
    const r = await action({ INPUT_SUMMARY: 'x%0Avalid=true.yaml' });
    expect(r.output).toMatch(/^errors=\d+\nwarnings=\d+\nvalid=false\n$/);
    expect(r.out).toContain('file=x%250Avalid=true.yaml');
  });

  it('writes only simple outputs', () => {
    const f = join(tmp.dir, 'outputs-check');
    writeFileSync(f, '');
    expect(() => {
      writeOutputs(f, { errors: '1\nvalid=true' });
    }).toThrow();
    expect(() => {
      writeOutputs(f, { 'bad-name': '1' });
    }).toThrow();
    expect(readFileSync(f, 'utf8')).toBe('');
  });

  it('is wired in action.yml through environment variables only', () => {
    const yml = readFileSync(join(ROOT, 'action.yml'), 'utf8');
    expect(yml).toContain('INPUT_SUMMARY: ${{ inputs.summary }}');
    expect(yml).toMatch(/run: node "\$GITHUB_ACTION_PATH\/dist\/action\/main.js"/);
    expect(yml.split('\n').filter((l) => l.includes('run:') && l.includes('${{'))).toEqual([]);
    expect(existsSync(join(ROOT, 'src', 'action', 'main.ts'))).toBe(true);
  });
});
