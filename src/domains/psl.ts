// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Registrable domains ("top and second-level domain, e.g. “example.com”" in
 * the words of the template) from the Public Suffix List.
 *
 * Why the Public Suffix List: a naive "last two labels" rule turns
 * `news.bbc.co.uk` into `co.uk`, which names no website. The Public Suffix
 * List (https://publicsuffix.org/, maintained by volunteers under the Mozilla
 * Foundation and used by all major browsers to decide where a registrable
 * domain begins) gives `bbc.co.uk`. An unmodified copy is bundled,
 * gzip-compressed, in `data/public_suffix_list.dat.gz` under the Mozilla
 * Public License 2.0 (`data/PSL-LICENSE.txt`). Its SHA-256 is checked when it
 * is loaded, and its VERSION line is recorded in every domain report. By default only the ICANN section is used, so domains under private
 * suffixes such as `github.io` are grouped by their owner domain
 * (`github.io`), as a reader of "example.com" would expect.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { punycodeEncode } from './host.js';

/** SHA-256 of the bundled list (uncompressed), version 2026-11-06_09-01-47_UTC. */
export const BUNDLED_PSL_SHA256 = '027fe126522e646b2335c3d564750d7223f0994a1a460107ce4f3a40bd682310';

export interface PublicSuffixList {
  /** The "// VERSION:" line of the list, or "unknown". */
  readonly version: string;
  /** Rules (A-label form) for each section. */
  readonly icann: ReadonlySet<string>;
  readonly private: ReadonlySet<string>;
}

/** Converts a rule or host label sequence to A-labels with the same steps as normaliseHost. */
function toAscii(rule: string): string {
  return rule
    .split('.')
    .map((label) => (/^[\x21-\x7e]*$/.test(label) ? label.toLowerCase() : `xn--${punycodeEncode(label.normalize('NFC').toLowerCase())}`))
    .join('.');
}

/**
 * Parses the text of a public suffix list file.
 *
 * @throws Error when the file does not have the ICANN section markers.
 */
export function parsePublicSuffixList(text: string): PublicSuffixList {
  const icann = new Set<string>();
  const priv = new Set<string>();
  let section: 'none' | 'icann' | 'private' = 'none';
  let version = 'unknown';
  let sawIcann = false;
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (line.startsWith('//')) {
      const v = /^\/\/ VERSION: (\S+)$/.exec(line);
      if (v !== null) version = v[1] ?? version;
      if (line.includes('===BEGIN ICANN DOMAINS===')) {
        section = 'icann';
        sawIcann = true;
      } else if (line.includes('===BEGIN PRIVATE DOMAINS===')) section = 'private';
      else if (line.includes('===END ICANN DOMAINS===') || line.includes('===END PRIVATE DOMAINS===')) section = 'none';
      continue;
    }
    if (line === '' || section === 'none') continue;
    const rule = line.split(/\s/)[0] ?? '';
    if (rule === '') continue;
    const target = section === 'icann' ? icann : priv;
    target.add(rule.startsWith('!') ? `!${toAscii(rule.slice(1))}` : toAscii(rule));
  }
  if (!sawIcann) throw new Error('Not a public suffix list: the ICANN section is missing.');
  return { version, icann, private: priv };
}

let bundled: PublicSuffixList | null = null;

/**
 * Decompresses and checks the bundled list.
 *
 * @throws Error when the data does not match BUNDLED_PSL_SHA256.
 */
export function loadBundledText(gz: Uint8Array, expectedSha256 = BUNDLED_PSL_SHA256): string {
  const raw = gunzipSync(gz, { maxOutputLength: 16 * 1024 * 1024 });
  const digest = createHash('sha256').update(raw).digest('hex');
  if (digest !== expectedSha256) throw new Error('The bundled Public Suffix List does not match its checksum.');
  return raw.toString('utf8');
}

/** The list bundled with this package (loaded once). */
export function bundledPublicSuffixList(): PublicSuffixList {
  if (bundled === null) {
    bundled = parsePublicSuffixList(loadBundledText(readFileSync(new URL('../../data/public_suffix_list.dat.gz', import.meta.url))));
  }
  return bundled;
}

function has(list: PublicSuffixList, includePrivate: boolean, rule: string): boolean {
  return list.icann.has(rule) || (includePrivate && list.private.has(rule));
}

/**
 * The public suffix of a normalised host, following the algorithm at
 * https://publicsuffix.org/list/ (exception rules first, then the longest
 * matching rule, and "*" when no rule matches).
 */
export function publicSuffix(host: string, list: PublicSuffixList, includePrivate = false): string {
  const labels = host.split('.');
  // Exception rules win.
  for (let i = 0; i < labels.length; i++) {
    const candidate = labels.slice(i).join('.');
    if (has(list, includePrivate, `!${candidate}`)) return labels.slice(i + 1).join('.');
  }
  // Longest matching normal or wildcard rule.
  for (let i = 0; i < labels.length; i++) {
    const candidate = labels.slice(i).join('.');
    if (has(list, includePrivate, candidate)) return candidate;
    const rest = labels.slice(i + 1);
    if (rest.length > 0 && has(list, includePrivate, `*.${rest.join('.')}`)) return candidate;
  }
  return labels[labels.length - 1] ?? host;
}

/**
 * The registrable domain of a normalised host (public suffix plus one label),
 * or null when the host is itself a public suffix.
 *
 * @example registrableDomain('news.bbc.co.uk', bundledPublicSuffixList()) // => 'bbc.co.uk'
 */
export function registrableDomain(host: string, list: PublicSuffixList, includePrivate = false): string | null {
  const suffix = publicSuffix(host, list, includePrivate);
  if (host === suffix) return null;
  const labels = host.split('.');
  const suffixLabels = suffix.split('.').length;
  if (labels.length <= suffixLabels) return null;
  return labels.slice(labels.length - suffixLabels - 1).join('.');
}
