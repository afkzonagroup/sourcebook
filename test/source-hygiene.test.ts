// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

// Repository-wide checks: dangerous APIs, network code, hidden characters,
// licence headers, package hygiene.

import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { VERSION } from '../src/version.js';
import { ROOT } from './helpers.js';

function files(dir: string, ext: RegExp): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if ((name.startsWith('.') && name !== '.github') || ['__pycache__', 'node_modules', 'dist', 'coverage', '.venv', 'build'].includes(name) || name.endsWith('.egg-info')) continue;
    const p = join(dir, name);
    const info = lstatSync(p);
    if (info.isDirectory()) out.push(...files(p, ext));
    else if (info.isFile() && ext.test(name)) out.push(p);
  }
  return out;
}

const SOURCES = files(join(ROOT, 'src'), /\.ts$/);
const PY = files(join(ROOT, 'python'), /\.py$/);
const PY_SRC = files(join(ROOT, 'python', 'src'), /\.py$/);
const ALL_CODE = [...SOURCES, ...files(join(ROOT, 'test'), /\.ts$/), ...files(join(ROOT, 'scripts'), /\.mjs$/), ...PY];
const NETWORK_MODULE = join(ROOT, 'src', 'collect', 'hf-hub.ts');
const PY_NETWORK_MODULE = join(ROOT, 'python', 'src', 'sourcebook', 'hub.py');

describe('source hygiene', () => {
  it('uses no eval, Function constructor, dynamic import, child processes or HTML sinks', () => {
    const forbidden = [/\beval\s*\(/, /new\s+Function\s*\(/, /\bimport\s*\(/, /child_process/, /\.innerHTML\b/, /\.outerHTML\b/, /insertAdjacentHTML/, /document\.write/];
    for (const file of SOURCES) {
      const text = readFileSync(file, 'utf8');
      for (const re of forbidden) expect(re.test(text), `${relative(ROOT, file)} matches ${re}`).toBe(false);
    }
    const pyForbidden = [/\beval\s*\(/, /\bexec\s*\(/, /\bsubprocess\b/, /os\.system/, /\bpickle\b/, /yaml\.load\b/, /__import__/, /importlib\.import_module/];
    for (const file of PY_SRC) {
      const text = readFileSync(file, 'utf8');
      for (const re of pyForbidden) expect(re.test(text), `${relative(ROOT, file)} matches ${re}`).toBe(false);
    }
  });

  it('has network code only in the Hugging Face Hub client', () => {
    const network = [/\bfetch\s*\(/, /XMLHttpRequest/, /WebSocket/, /node:https?\b/, /node:net\b/, /node:dgram/, /node:tls/, /node:dns/, /\brequire\s*\(/, /process\.binding/];
    for (const file of SOURCES) {
      const text = readFileSync(file, 'utf8');
      for (const re of network) {
        const allowed = file === NETWORK_MODULE && re.source === '\\bfetch\\s*\\(';
        if (!allowed) expect(re.test(text), `${relative(ROOT, file)} matches ${re}`).toBe(false);
      }
    }
    expect(readFileSync(NETWORK_MODULE, 'utf8')).toContain("const HUB_HOST = 'huggingface.co';");
    const pyNetwork = [/\burllib\.request\b|from urllib import request/, /\bhttp\.client\b/, /\bsocket\b/, /\brequests\b/, /\bhttpx\b/, /\baiohttp\b/];
    expect(PY_SRC.length).toBeGreaterThan(8);
    for (const file of PY_SRC) {
      const text = readFileSync(file, 'utf8');
      for (const re of pyNetwork) if (file !== PY_NETWORK_MODULE) expect(re.test(text), `${relative(ROOT, file)} matches ${re}`).toBe(false);
    }
  });

  it('contains no invisible or bidirectional control characters (Trojan Source) in any text file', () => {
    // Dot files and files without an extension are listed by name, because files() skips dot directories.
    const named = ['.editorconfig', '.gitignore', '.npmrc', 'LICENSE', 'NOTICE', join('python', 'LICENSE')].map((f) => join(ROOT, f));
    const text = [...ALL_CODE, ...named, ...files(ROOT, /\.(md|json|ya?ml|csv|html|css|toml|txt|cdx|cdxj|mjs|js)$/)];
    expect(text.length).toBeGreaterThan(60);
    // eslint-disable-next-line no-control-regex -- detecting control characters is the purpose
    const forbidden = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u00a0\u061c\u200b-\u200f\u2028\u2029\u202a-\u202e\u2060-\u2069\ufeff]/;
    for (const file of text) expect(forbidden.test(readFileSync(file, 'utf8')), relative(ROOT, file)).toBe(false);
  });

  it('has a copyright and licence header in every source file', () => {
    for (const file of SOURCES) expect(readFileSync(file, 'utf8'), relative(ROOT, file)).toMatch(/Copyright 2026 MB AFKzona Group\n\/\/ SPDX-License-Identifier: AGPL-3\.0-only/);
    for (const file of PY) expect(readFileSync(file, 'utf8'), relative(ROOT, file)).toMatch(/# Copyright 2026 MB AFKzona Group\n# SPDX-License-Identifier: AGPL-3\.0-only/);
  });

  it('has no eslint-disable or ts-expect-error without a written reason, no ts-ignore and no any', () => {
    // This file is excluded: it necessarily spells out the patterns it looks for.
    for (const file of ALL_CODE.filter((f) => f.endsWith('.ts') && f !== import.meta.filename)) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(/\/[/*]\s*eslint-disable[^\n]*/g)) expect(m[0], relative(ROOT, file)).toMatch(/ -- \S/);
      for (const m of text.matchAll(/\/\/\s*@ts-expect-error[^\n]*/g)) expect(m[0], relative(ROOT, file)).toMatch(/ -- \S/);
      expect(/\/\/\s*@ts-ignore/.test(text), relative(ROOT, file)).toBe(false);
      expect(/(:\s*any|\bas any)\s*[,;)=>\]|}]|<any>/.test(text), relative(ROOT, file)).toBe(false);
    }
  });
});

describe('package', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as Record<string, unknown>;

  it('has zero runtime dependencies and no install scripts', () => {
    expect(pkg.dependencies).toBeUndefined();
    expect(pkg.optionalDependencies).toBeUndefined();
    const scripts = pkg.scripts as Record<string, string>;
    for (const hook of ['preinstall', 'install', 'postinstall', 'prepare']) expect(scripts[hook]).toBeUndefined();
  });

  it('pins every development dependency exactly', () => {
    for (const [name, version] of Object.entries(pkg.devDependencies as Record<string, string>)) expect(version, name).toMatch(/^[0-9]+\.[0-9]+\.[0-9]+$/);
  });

  it('declares licence, engines, exports and a files allow-list', () => {
    expect(pkg).toMatchObject({ name: '@afkzona/sourcebook', license: 'AGPL-3.0-only', type: 'module', engines: { node: '>=22' } });
    expect(pkg.files).toEqual(expect.arrayContaining(['dist/', 'data/', 'spec/', 'LICENSE', 'LICENSE-ADDITIONAL-TERMS.md', 'NOTICE']));
    expect(pkg.exports).toHaveProperty('.');
    expect(pkg.version).toBe(VERSION);
    const py = readFileSync(join(ROOT, 'python', 'pyproject.toml'), 'utf8');
    expect(py).toContain(`version = "${VERSION}"`);
    expect(py).toContain('dependencies = []');
  });

  it('builds before packing and checks the tarball in CI and before publishing', () => {
    // .npmrc sets ignore-scripts=true, so "prepack" never runs: a workflow that packs or publishes
    // without "npm run build" ships a package without dist/.
    expect(readFileSync(join(ROOT, '.npmrc'), 'utf8')).toMatch(/^ignore-scripts=true$/m);
    for (const name of ['ci.yml', 'release.yml']) {
      const text = readFileSync(join(ROOT, '.github', 'workflows', name), 'utf8');
      const build = text.indexOf('run: npm run build');
      const pack = text.indexOf('run: npm pack --dry-run --json > "$RUNNER_TEMP/pack.json"');
      const check = text.indexOf('run: node scripts/check-pack.mjs "$RUNNER_TEMP/pack.json"');
      expect(build, name).toBeGreaterThan(0);
      expect(pack, name).toBeGreaterThan(build);
      expect(check, name).toBeGreaterThan(pack);
      const publish = text.indexOf('run: npm publish');
      if (publish >= 0) expect(publish, name).toBeGreaterThan(check);
    }
    expect(readFileSync(join(ROOT, '.github', 'workflows', 'release.yml'), 'utf8')).toContain('run: npm publish');
  });

  it('runs CI only on pull requests and on demand, with pinned actions and read-only permissions', () => {
    for (const file of files(join(ROOT, '.github', 'workflows'), /\.ya?ml$/)) {
      const text = readFileSync(file, 'utf8');
      expect(text, relative(ROOT, file)).not.toMatch(/^\s*(push|schedule):/m);
      expect(text).toMatch(/permissions:\n\s+contents: read/);
      for (const m of text.matchAll(/uses:\s*(\S+)/g)) expect(m[1], relative(ROOT, file)).toMatch(/@[0-9a-f]{40}$|^\.\/$/);
    }
  });
});
