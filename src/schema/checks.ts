// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/** Small, shared checks for values in summary and inventory files. */

/** Control characters other than tab and line feed. */
// eslint-disable-next-line no-control-regex -- detecting control characters is the purpose
export const CONTROL_CHARS = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/;

/**
 * Invisible and bidirectional formatting characters that can make published
 * text read differently from what it says ("Trojan Source").
 */
export const HIDDEN_CHARS = /[\u061c\u200b-\u200f\u2028\u2029\u202a-\u202e\u2060-\u2069\ufeff]/;

/**
 * Accepted links: absolute http or https URLs with an ASCII host (use the
 * "xn--" form for international names), no spaces, quotes or angle brackets,
 * no control, invisible or bidirectional characters. The character class is
 * explicit because JavaScript's and Python's `\s` differ (U+0085, U+FEFF).
 */
// eslint-disable-next-line no-control-regex -- the class excludes control characters from links
export const LINK_RE = /^https?:\/\/[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?(?::[0-9]{1,5})?(?:[/?#][^\s<>"'`{}|\\^\u0000-\u001f\u007f-\u00a0\u061c\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]*)?$/;

/** A registrable domain name as Sourcebook writes it (lower case, A-labels). */
export const DOMAIN_RE = /^(?=.{1,253}$)(?:[a-z0-9_-]{1,63}\.)+[a-z0-9-]{1,63}$/;

export const DATE_RE = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/;
export const MONTH_RE = /^([0-9]{4})-(0[1-9]|1[0-2])$/;

export const MAX_TEXT = 100_000;
export const MAX_SHORT = 1_000;
export const MAX_LINK = 2_048;
export const MAX_LIST = 10_000;
export const MAX_DOMAINS_IN_SUMMARY = 100_000;

/** True for a real calendar date "YYYY-MM-DD" between 1900 and 2999. */
export function isIsoDate(value: string): boolean {
  const m = DATE_RE.exec(value);
  if (m === null) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < 1900 || y > 2999 || mo < 1 || mo > 12 || d < 1) return false;
  const days = [31, y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1] ?? 0;
  return d <= days;
}

/** True for "YYYY-MM" between 1900 and 2999. */
export function isIsoMonth(value: string): boolean {
  const m = MONTH_RE.exec(value);
  if (m === null) return false;
  const y = Number(m[1]);
  return y >= 1900 && y <= 2999;
}

/** True when a link passes LINK_RE and its port, if any, is at most 65535. */
export function isLink(value: string): boolean {
  if (value.length > MAX_LINK || !LINK_RE.test(value)) return false;
  const port = /^https?:\/\/[^/?#:]+:([0-9]+)/.exec(value);
  return port === null || Number(port[1]) <= 65535;
}

/** Days between two ISO dates (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** Adds months to an ISO date, clamping the day to the end of the month. */
export function addMonths(date: string, months: number): string {
  const m = DATE_RE.exec(date);
  if (m === null) throw new RangeError('Not an ISO date.');
  const total = Number(m[1]) * 12 + (Number(m[2]) - 1) + months;
  const y = Math.floor(total / 12);
  const mo = (total % 12) + 1;
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const d = Math.min(Number(m[3]), last);
  return `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
