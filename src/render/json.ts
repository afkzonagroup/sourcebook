// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/** Machine-readable JSON output: the complete summary in canonical form. */

import { TEMPLATE } from '../spec/template.js';
import type { Summary } from '../schema/types.js';
import { GENERATOR } from '../version.js';

/** Envelope of the JSON output. */
export interface SummaryJson {
  format: 'sourcebook-summary';
  format_version: 1;
  template: { id: string; document: string; document_date: string; source: string };
  generator: string;
  summary: Summary;
}

/** Builds the JSON envelope. */
export function summaryToJson(summary: Summary): SummaryJson {
  return {
    format: 'sourcebook-summary',
    format_version: 1,
    template: { id: TEMPLATE.id, document: TEMPLATE.document, document_date: TEMPLATE.documentDate, source: TEMPLATE.sourceUrl },
    generator: GENERATOR,
    summary,
  };
}

/**
 * Renders the summary as JSON text (two-space indentation, keys in template
 * order). Identical to the Python package's output for the same summary.
 */
export function renderJson(summary: Summary): string {
  return `${JSON.stringify(summaryToJson(summary), null, 2)}\n`;
}
