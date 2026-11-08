// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * A section for a Hugging Face model card (README.md). The Explanatory
 * Notice (point 32) says the summary "should also be made publicly available
 * together with the model across all its public distribution channels (e.g.
 * online platforms)". The snippet either links to the full summary or
 * embeds it.
 */

import { isLink } from '../schema/checks.js';
import type { Summary } from '../schema/types.js';
import { TEMPLATE } from '../spec/template.js';
import { formatShortDate } from './document.js';
import { escapeInline, renderMarkdown } from './markdown.js';

export const MODEL_CARD_START = '<!-- sourcebook:start -->';
export const MODEL_CARD_END = '<!-- sourcebook:end -->';

export interface ModelCardOptions {
  /** Where the full summary is published (the provider's website). */
  readonly summaryUrl: string;
  /** "link" (default): a short section with the link; "full": the whole summary. */
  readonly mode?: 'link' | 'full';
}

/**
 * Builds the model card section, wrapped in marker comments so that it can
 * be replaced on the next update.
 *
 * @throws RangeError when `summaryUrl` is not an http(s) link.
 */
export function modelCardSnippet(summary: Summary, options: ModelCardOptions): string {
  if (!isLink(options.summaryUrl)) throw new RangeError('The summary URL must be an http or https link.');
  const models = summary.general_information.model.versioned_model_names.map((m) => m.name).filter((n) => n !== '');
  const lines = [
    MODEL_CARD_START,
    '## Training content summary (EU AI Act)',
    '',
    `Public summary of the content used to train this model, drawn up under Article 53(1)(d) of Regulation (EU) 2024/1689 (AI Act) using the AI Office template (${escapeInline(TEMPLATE.document)}).`,
    '',
    `- Full summary: <${options.summaryUrl}>`,
    `- Version of the Summary: ${summary.summary_version.version === '' ? 'not filled in' : escapeInline(summary.summary_version.version)}`,
    `- Last update: ${summary.last_update === null ? 'not filled in' : formatShortDate(summary.last_update)}`,
    `- Models covered: ${models.length === 0 ? 'not filled in' : models.map(escapeInline).join(', ')}`,
  ];
  if (options.mode === 'full') {
    lines.push('', '<details>', '<summary>Full summary</summary>', '', renderMarkdown(summary, { headingOffset: 2 }).trimEnd(), '', '</details>');
  }
  lines.push(MODEL_CARD_END);
  return `${lines.join('\n')}\n`;
}

/**
 * Inserts the snippet into a model card README: replaces an existing
 * Sourcebook section, or appends it at the end. The YAML front matter of the
 * card is left untouched.
 *
 * @throws RangeError when the README has unbalanced or repeated markers.
 */
export function insertIntoModelCard(readme: string, snippet: string): string {
  const starts = readme.split(MODEL_CARD_START).length - 1;
  const ends = readme.split(MODEL_CARD_END).length - 1;
  if (starts !== ends || starts > 1) throw new RangeError('The README has unbalanced or repeated Sourcebook markers.');
  if (starts === 1) {
    const a = readme.indexOf(MODEL_CARD_START);
    const b = readme.indexOf(MODEL_CARD_END);
    if (b < a) throw new RangeError('The README has unbalanced or repeated Sourcebook markers.');
    let after = readme.slice(b + MODEL_CARD_END.length);
    if (after.startsWith('\n')) after = after.slice(1);
    return readme.slice(0, a) + snippet + after;
  }
  const base = readme.endsWith('\n') || readme === '' ? readme : `${readme}\n`;
  return `${base}${base === '' ? '' : '\n'}${snippet}`;
}
