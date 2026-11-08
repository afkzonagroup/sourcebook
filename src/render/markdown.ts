// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Markdown output (CommonMark). Every piece of text from the summary is
 * escaped so that it cannot create links, images, HTML, headings, lists,
 * tables or maths; links are printed only from validated http(s) URLs
 * (checked here again, so a summary object built in code cannot add others).
 * The Python package implements the same escaping; shared vectors keep the
 * output byte-identical.
 */

import { isLink } from '../schema/checks.js';
import type { Summary } from '../schema/types.js';
import { buildDocument, type Block, type DocumentOptions, type Inline } from './document.js';
import { BLANK, trimOf } from '../util/trim.js';

const SPECIAL = /[\\`*_[\]<>|~#!&$]/g;

function escapeChars(s: string): string {
  return s.replace(SPECIAL, (c) => `\\${c}`);
}

/** Escapes what would be a list marker or setext underline at the start of a line. */
function escapeLineStart(s: string): string {
  if (/^[-+=]/.test(s)) return `\\${s}`;
  const m = /^([0-9]{1,9})([.)])(?=[ \t]|$)/.exec(s);
  if (m !== null) return `${m[1] ?? ''}\\${s.slice((m[1] ?? '').length)}`;
  return s;
}

/** Escapes text for use inside one line. White space runs become one space. */
export function escapeInline(s: string): string {
  return escapeChars(s.replace(/[\t\n ]+/g, ' ').trim());
}

/** Escapes narrative text: paragraphs (separated by blank lines) and lines are kept. */
export function escapeText(s: string): string {
  return s
    .replace(/\r\n/g, '\n')
    .split(/\n[ \t]*\n/)
    .map((para) =>
      para
        .split('\n')
        .map((line) => trimOf(line, BLANK))
        .filter((line) => line !== '')
        .map((line) => escapeLineStart(escapeChars(line)))
        .join('\n'),
    )
    .filter((para) => para !== '')
    .join('\n\n');
}

function inline(parts: readonly Inline[]): string {
  let out = '';
  for (const part of parts) {
    switch (part.t) {
      case 'text':
        out += escapeChars(part.v.replace(/[\t\n ]+/g, ' '));
        break;
      case 'strong':
        out += `**${escapeInline(part.v)}**`;
        break;
      case 'em':
        out += `*${escapeInline(part.v)}*`;
        break;
      case 'link':
        // Only validated http(s) URLs become links, also for summaries built in code (not parsed).
        if (!isLink(part.href)) out += escapeChars(part.v.replace(/[\t\n ]+/g, ' '));
        else out += part.v === part.href ? `<${part.href}>` : `[${escapeInline(part.v)}](<${part.href}>)`;
        break;
      case 'box':
        out += part.checked ? '☒' : '☐';
        break;
    }
  }
  return escapeLineStart(out.trim());
}

function block(b: Block, headingOffset: number): string {
  switch (b.b) {
    case 'h':
      return `${'#'.repeat(Math.min(6, b.level + headingOffset))} ${escapeInline(b.text)}`;
    case 'p':
      return inline(b.inl);
    case 'text':
      return escapeText(b.v);
    case 'rule':
      return '---';
    case 'field': {
      const parts = [`**${escapeInline(b.label)}**`];
      if (b.instruction !== '') parts.push(`*${escapeInline(b.instruction)}*`);
      for (const x of b.body) parts.push(block(x, headingOffset));
      return parts.filter((x) => x !== '').join('\n\n');
    }
    case 'list':
      return b.items
        .map((item, i) => {
          const marker = b.ordered ? `${i + 1}. ` : '- ';
          const pad = ' '.repeat(marker.length);
          const lines = [`${marker}${inline(item.inl)}`];
          for (const sub of item.sub) lines.push(`${pad}- ${inline(sub)}`);
          return lines.join('\n');
        })
        .join('\n');
    case 'modalities': {
      const parts: string[] = [];
      for (const row of b.rows) {
        parts.push(`${row.checked ? '☒' : '☐'} **${escapeInline(row.label)}**${row.footnote ? '¹' : ''}`);
        if (!row.checked) continue;
        if (row.size.length > 0) {
          parts.push('Training data size:');
          parts.push(row.size.map((line) => `- ${inline(line)}`).join('\n'));
        }
        parts.push('Types of content:');
        parts.push(row.types === '' ? '*Not filled in.*' : escapeText(row.types));
      }
      parts.push(`¹ ${escapeInline(b.footnote)}`);
      return parts.join('\n\n');
    }
  }
}

export interface MarkdownOptions extends DocumentOptions {
  /** Added to every heading level (for embedding in another document). */
  readonly headingOffset?: number;
}

/** Serialises a document to Markdown. */
export function documentToMarkdown(doc: readonly Block[], headingOffset = 0): string {
  return `${doc
    .map((b) => block(b, headingOffset))
    .filter((x) => x !== '')
    .join('\n\n')}\n`;
}

/**
 * Renders a summary as Markdown in the layout of the template.
 *
 * @example renderMarkdown(summary).startsWith('# Public Summary of Training Content') // => true
 */
export function renderMarkdown(summary: Summary, options: MarkdownOptions = {}): string {
  return documentToMarkdown(buildDocument(summary, options), options.headingOffset ?? 0);
}
