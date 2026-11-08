// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/** Parsing of summary and inventory files from text (YAML or JSON). */

import { parseYaml, DEFAULT_YAML_LIMITS } from '../yaml/parse.js';
import { parseSummary } from './parse.js';
import type { Summary } from './types.js';

/** Maximum nesting depth accepted in JSON input. */
export const MAX_JSON_DEPTH = 64;

/** Raised for JSON that is malformed or nested too deeply. */
export class JsonInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JsonInputError';
  }
}

/**
 * Parses JSON after checking its nesting depth, so that hostile input cannot
 * exhaust the stack.
 *
 * @throws JsonInputError
 */
export function parseJsonSafe(text: string, maxDepth = MAX_JSON_DEPTH): unknown {
  let depth = 0;
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (inString) {
      if (c === 92) i++;
      else if (c === 34) inString = false;
      continue;
    }
    if (c === 34) inString = true;
    else if (c === 91 || c === 123) {
      depth++;
      if (depth > maxDepth) throw new JsonInputError(`The JSON is nested more than ${maxDepth} levels deep.`);
    } else if (c === 93 || c === 125) depth--;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new JsonInputError('The file is not valid JSON.');
  }
}

/**
 * Parses the text of a summary file. JSON when `format` is "json" (or the
 * text starts with "{"), YAML otherwise.
 *
 * @throws YamlError, JsonInputError or SchemaError
 */
export function parseSummaryText(text: string, format: 'yaml' | 'json' | 'auto' = 'auto'): Summary {
  const isJson = format === 'json' || (format === 'auto' && text.trimStart().startsWith('{'));
  const data = isJson ? parseJsonSafe(text) : parseYaml(text, DEFAULT_YAML_LIMITS);
  return parseSummary(data);
}
