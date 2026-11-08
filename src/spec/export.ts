// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The template data and message tables as one JSON document
 * (`spec/template-v1.json`), shared with the Python package.
 */

import { CHECKBOX, FIELDS, FORMAT_VERSION, KEY_DATES, MODALITY_TABLE, SECTIONS, SIZE_RANGES, SIZE_RANGE_BOUNDS, TEMPLATE } from './template.js';
import { MESSAGES } from '../validate/messages.js';
import { SCHEMA_MESSAGES } from '../schema/parse.js';
import { YAML_ERRORS } from '../yaml/parse.js';

/** Builds the shared specification document. */
export function specDocument(): Record<string, unknown> {
  const bounds: Record<string, { unit: string; low: string; high: string }> = {};
  for (const [k, v] of Object.entries(SIZE_RANGE_BOUNDS)) bounds[k] = { unit: v.unit, low: v.low.toString(), high: v.high.toString() };
  return {
    format_version: FORMAT_VERSION,
    template: TEMPLATE,
    key_dates: KEY_DATES,
    sections: SECTIONS,
    fields: FIELDS,
    size_ranges: SIZE_RANGES,
    size_range_bounds: bounds,
    modality_table: MODALITY_TABLE,
    checkbox: CHECKBOX,
    messages: MESSAGES,
    schema_messages: SCHEMA_MESSAGES,
    yaml_errors: YAML_ERRORS,
  };
}

/** The JSON text of `spec/template-v1.json`. */
export function specJsonText(): string {
  return `${JSON.stringify(specDocument(), null, 2)}\n`;
}
