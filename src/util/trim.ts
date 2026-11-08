// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Trimming in linear time. A regular expression such as `/[ \t]+$/` is
 * tried at every position of a run of blanks and backtracks through the
 * rest of the run each time, so a value with a long run of spaces in the
 * middle took seconds to minutes (quadratic time). These helpers scan from
 * the ends instead. The Python package uses `str.strip` with the same sets.
 */

/** Spaces and tabs. */
export const BLANK = ' \t';
/** ASCII white space: space, tab, line feed, carriage return, vertical tab, form feed. */
export const ASCII_SPACE = ' \t\n\r\v\f';

/** Removes the characters in `set` from the start of `s`. */
export function trimStartOf(s: string, set: string): string {
  let i = 0;
  while (i < s.length && set.includes(s.charAt(i))) i++;
  return i === 0 ? s : s.slice(i);
}

/** Removes the characters in `set` from the end of `s`. */
export function trimEndOf(s: string, set: string): string {
  let i = s.length;
  while (i > 0 && set.includes(s.charAt(i - 1))) i--;
  return i === s.length ? s : s.slice(0, i);
}

/**
 * Removes the characters in `set` from both ends of `s`.
 *
 * @example trimOf('  a b \t', BLANK) // => 'a b'
 */
export function trimOf(s: string, set: string): string {
  return trimStartOf(trimEndOf(s, set), set);
}
