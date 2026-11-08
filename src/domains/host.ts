// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Strict, dependency-free extraction and normalisation of host names from
 * URLs found in crawl logs. Both the TypeScript and the Python package use
 * this exact algorithm (shared vectors in `test-vectors/hosts.json`), so a
 * crawl log gives the same domain list in both.
 *
 * It is deliberately narrower than a browser URL parser: anything unusual is
 * reported as invalid and counted, never guessed.
 */

/** Maximum URL length accepted from a crawl log. */
export const MAX_URL_LENGTH = 8192;

/** Why a URL produced no host name. */
export type HostRejection = 'invalid_url' | 'not_http' | 'ip_address' | 'invalid_host';

export type HostResult = { ok: true; host: string } | { ok: false; reason: HostRejection };

const BASE = 36;
const T_MIN = 1;
const T_MAX = 26;
const SKEW = 38;
const DAMP = 700;
const INITIAL_BIAS = 72;
const INITIAL_N = 128;

function adapt(delta: number, numPoints: number, firstTime: boolean): number {
  let d = firstTime ? Math.floor(delta / DAMP) : delta >> 1;
  d += Math.floor(d / numPoints);
  let k = 0;
  while (d > ((BASE - T_MIN) * T_MAX) >> 1) {
    d = Math.floor(d / (BASE - T_MIN));
    k += BASE;
  }
  return k + Math.floor(((BASE - T_MIN + 1) * d) / (d + SKEW));
}

function digit(d: number): string {
  // 0..25 -> a..z, 26..35 -> 0..9
  return String.fromCharCode(d < 26 ? d + 97 : d + 22);
}

/**
 * Punycode encoding of one label (RFC 3492, section 6.3), without the
 * "xn--" prefix. Input is a string of Unicode code points.
 *
 * @example punycodeEncode('bücher') // => 'bcher-kva'
 */
export function punycodeEncode(input: string): string {
  const cps = Array.from(input, (c) => c.codePointAt(0) ?? 0);
  let n = INITIAL_N;
  let delta = 0;
  let bias = INITIAL_BIAS;
  let out = '';
  for (const c of cps) if (c < 0x80) out += String.fromCharCode(c);
  const basic = out.length;
  let h = basic;
  if (basic > 0) out += '-';
  while (h < cps.length) {
    let m = Number.MAX_SAFE_INTEGER;
    for (const c of cps) if (c >= n && c < m) m = c;
    delta += (m - n) * (h + 1);
    n = m;
    for (const c of cps) {
      if (c < n) delta++;
      if (c === n) {
        let q = delta;
        for (let k = BASE; ; k += BASE) {
          const t = k <= bias ? T_MIN : k >= bias + T_MAX ? T_MAX : k - bias;
          if (q < t) break;
          out += digit(t + ((q - t) % (BASE - t)));
          q = Math.floor((q - t) / (BASE - t));
        }
        out += digit(q);
        bias = adapt(delta, h + 1, h === basic);
        delta = 0;
        h++;
      }
    }
    delta++;
    n++;
  }
  return out;
}

const ASCII_LABEL = /^[a-z0-9_-]{1,63}$/;
const UNICODE_LABEL = /^[\p{L}\p{M}\p{N}-]+$/u;
const DOTS = /[。．｡]/g;

/**
 * Normalises a host name: lower case, without a trailing dot, each label
 * either ASCII (letters, digits, hyphen, underscore) or converted to its
 * "xn--" form. Returns null for anything else, including IP addresses and
 * labels that change under NFKC normalisation (such as fullwidth letters).
 *
 * @example normaliseHost('WWW.Bücher.DE.') // => 'www.xn--bcher-kva.de'
 */
export function normaliseHost(raw: string): string | null {
  if (raw.length === 0 || raw.length > 1024) return null;
  let host = raw.normalize('NFC').toLowerCase().replace(DOTS, '.');
  if (host.endsWith('.')) host = host.slice(0, -1);
  if (host.length === 0) return null;
  const labels = host.split('.');
  const out: string[] = [];
  for (const label of labels) {
    if (ASCII_LABEL.test(label)) {
      out.push(label);
      continue;
    }
    if (!UNICODE_LABEL.test(label)) return null;
    // Compatibility characters (fullwidth letters, ligatures) are mapped by browsers (UTS #46) to
    // other letters; such a label is reported as invalid rather than guessed.
    if (label.normalize('NFKC') !== label) return null;
    const encoded = `xn--${punycodeEncode(label)}`;
    if (encoded.length > 63) return null;
    out.push(encoded);
  }
  const result = out.join('.');
  if (result.length > 253) return null;
  return result;
}

/** True when the host is an IPv4 address in any form a browser would accept (last label numeric). */
export function looksLikeIpv4(host: string): boolean {
  const labels = host.split('.');
  const last = labels[labels.length - 1] ?? '';
  return /^(0x[0-9a-f]*|[0-9]+)$/.test(last);
}

/**
 * Extracts and normalises the host of an http or https URL.
 *
 * @example hostOfUrl('https://user@News.Example.co.uk:8443/a?b#c') // => { ok: true, host: 'news.example.co.uk' }
 */
export function hostOfUrl(url: string): HostResult {
  if (url.length === 0 || url.length > MAX_URL_LENGTH) return { ok: false, reason: 'invalid_url' };
  const m = /^([A-Za-z][A-Za-z0-9+.-]*):\/\/([^/?#]*)/.exec(url);
  if (m === null) {
    return /^[A-Za-z][A-Za-z0-9+.-]*:/.test(url) ? { ok: false, reason: 'not_http' } : { ok: false, reason: 'invalid_url' };
  }
  const scheme = (m[1] ?? '').toLowerCase();
  if (scheme !== 'http' && scheme !== 'https') return { ok: false, reason: 'not_http' };
  let authority = m[2] ?? '';
  const at = authority.lastIndexOf('@');
  if (at >= 0) authority = authority.slice(at + 1);
  if (authority.startsWith('[')) return { ok: false, reason: 'ip_address' };
  let host = authority;
  const colon = authority.lastIndexOf(':');
  if (colon >= 0) {
    const port = authority.slice(colon + 1);
    if (!/^[0-9]{0,5}$/.test(port) || (port !== '' && Number(port) > 65535)) return { ok: false, reason: 'invalid_url' };
    host = authority.slice(0, colon);
  }
  return checkHost(host);
}

/**
 * Normalises a bare host name or domain (for crawl logs that list domains
 * instead of URLs).
 */
export function checkHost(host: string): HostResult {
  if (host.includes('%') || /[\s/\\?#@:[\]]/.test(host)) return { ok: false, reason: 'invalid_host' };
  const normal = normaliseHost(host);
  if (normal === null) return { ok: false, reason: 'invalid_host' };
  if (looksLikeIpv4(normal)) return { ok: false, reason: 'ip_address' };
  return { ok: true, host: normal };
}
