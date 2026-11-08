// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseYaml } from '../src/yaml/parse.js';
import { parseSummary } from '../src/schema/parse.js';
import type { Summary } from '../src/schema/types.js';

export const ROOT = join(import.meta.dirname, '..');

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- callers name the shape of the vector file they read
export function vectors<T>(name: string): T {
  return JSON.parse(readFileSync(join(ROOT, 'test-vectors', name), 'utf8')) as T;
}

export function fixture(name: string): string {
  return join(ROOT, 'test', 'fixtures', name);
}

export function exampleData(): Record<string, unknown> {
  return parseYaml(readFileSync(join(ROOT, 'examples', 'summary.yaml'), 'utf8')) as Record<string, unknown>;
}

export function exampleSummary(): Summary {
  return parseSummary(exampleData());
}

export function tempDir(): { dir: string; done: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'sourcebook-test-'));
  return {
    dir,
    done: () => {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** Yields a buffer in chunks of the given size. */
// eslint-disable-next-line @typescript-eslint/require-await -- an async iterable over data already in memory
export async function* chunks(buf: Uint8Array, size: number): AsyncGenerator<Uint8Array> {
  for (let i = 0; i < buf.length; i += size) yield buf.subarray(i, i + size);
}

/** Sets a value at a dotted path inside a plain object (creating objects on the way). */
export function setPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.');
  let o: Record<string, unknown> = obj;
  for (const k of keys.slice(0, -1)) {
    const next = o[k];
    if (typeof next !== 'object' || next === null) o[k] = {};
    o = o[k] as Record<string, unknown>;
  }
  o[keys[keys.length - 1] ?? ''] = value;
}
