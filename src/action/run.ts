// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The GitHub Action: validates the summary file of a model repository.
 * Inputs arrive only as environment variables (never interpolated into a
 * shell script). The file must be a regular file inside the workspace (no
 * symbolic links, no "..") and its messages are escaped before they become
 * workflow commands. Outputs are written from this run's in-memory result
 * and are checked before they reach $GITHUB_OUTPUT.
 */

import { appendFileSync, lstatSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { parseSummaryText, parseJsonSafe } from '../schema/load.js';
import { SchemaError } from '../schema/parse.js';
import { YamlError } from '../yaml/parse.js';
import { validateSummary, type ValidationResult } from '../validate/validate.js';
import { mergeInventories, parseInventory } from '../collect/inventory.js';
import { isIsoDate } from '../schema/checks.js';
import { escapeInline } from '../render/markdown.js';
import { readTextFile, InputError } from '../cli/node-io.js';
import { clean, type Output } from '../cli/run.js';
import { ATTRIBUTION, ATTRIBUTION_URL } from '../version.js';

/** Escapes the message part of a workflow command. */
export function escapeData(s: string): string {
  return s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

/** Escapes a property value of a workflow command. */
export function escapeProperty(s: string): string {
  return escapeData(s).replace(/:/g, '%3A').replace(/,/g, '%2C');
}

/** Resolves a path given as input to a regular file inside the workspace, or throws. */
export function workspaceFile(workspace: string, input: string): string {
  if (input === '' || input.length > 1024 || input.includes('\0')) throw new InputError('The summary path is empty or invalid.');
  const root = realpathSync(workspace);
  const target = resolve(root, input);
  const rel = relative(root, target);
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel) || rel.split(sep).includes('..')) throw new InputError('The file must be inside the repository workspace.');
  let info;
  try {
    info = lstatSync(target);
  } catch {
    throw new InputError(`${rel} does not exist.`);
  }
  if (info.isSymbolicLink()) throw new InputError(`${rel} is a symbolic link; refusing to read it.`);
  if (!info.isFile()) throw new InputError(`${rel} is not a regular file.`);
  const real = realpathSync(target);
  const realRel = relative(root, real);
  if (realRel.startsWith('..') || isAbsolute(realRel)) throw new InputError('The file must be inside the repository workspace.');
  return target;
}

/** Appends outputs to $GITHUB_OUTPUT; refuses anything but simple names and numbers or booleans. */
export function writeOutputs(file: string | undefined, values: Record<string, string>): void {
  if (file === undefined || file === '') return;
  let text = '';
  for (const [k, v] of Object.entries(values)) {
    if (!/^[a-z]+$/.test(k) || !/^(true|false|[0-9]{1,9})$/.test(v)) throw new Error('Refusing to write an unexpected output value.');
    text += `${k}=${v}\n`;
  }
  appendFileSync(file, text);
}

function stepSummary(file: string | undefined, path: string, result: ValidationResult): void {
  if (file === undefined || file === '') return;
  const rows = result.issues.slice(0, 200).map((i) => `| ${i.severity} | ${escapeInline(i.section)} | ${escapeInline(i.message)} |`);
  const text = [
    `### Training content summary: ${escapeInline(path)}`,
    '',
    `${result.errors} errors, ${result.warnings} warnings.`,
    '',
    ...(rows.length === 0 ? [] : ['| Severity | Section | Message |', '|---|---|---|', ...rows, '']),
    `Checked with [${ATTRIBUTION}](${ATTRIBUTION_URL}) against the AI Office template (Annex to Communication C(2025) 8311 final).`,
    '',
  ].join('\n');
  appendFileSync(file, text);
}

/** Runs the action. Returns the exit code. */
export async function runAction(env: Readonly<Record<string, string | undefined>>, out: Output): Promise<number> {
  try {
    const workspace = env.GITHUB_WORKSPACE;
    if (workspace === undefined || workspace === '') throw new InputError('GITHUB_WORKSPACE is not set.');
    const input = (env.INPUT_SUMMARY ?? '').trim() || 'training-content-summary.yaml';
    const path = workspaceFile(workspace, input);
    const rel = relative(realpathSync(workspace), path);
    const asOf = (env.INPUT_AS_OF ?? '').trim();
    if (asOf !== '' && !isIsoDate(asOf)) throw new InputError('as-of must be a date as YYYY-MM-DD.');
    const strictText = (env.INPUT_STRICT ?? 'false').trim();
    if (strictText !== 'true' && strictText !== 'false') throw new InputError('strict must be "true" or "false".');
    const summary = parseSummaryText(await readTextFile(path, 8 * 1024 * 1024), path.toLowerCase().endsWith('.json') ? 'json' : 'auto');
    const invPaths = (env.INPUT_INVENTORY ?? '').split('\n').map((s) => s.trim()).filter((s) => s !== '');
    const inventories = [];
    for (const p of invPaths.slice(0, 50)) inventories.push(parseInventory(parseJsonSafe(await readTextFile(workspaceFile(workspace, p), 256 * 1024 * 1024))));
    const result = validateSummary(summary, { ...(asOf === '' ? {} : { asOf }), ...(inventories.length === 0 ? {} : { inventory: mergeInventories(inventories) }) });
    for (const i of result.issues) {
      const command = i.severity === 'error' ? 'error' : i.severity === 'warning' ? 'warning' : 'notice';
      out.stdout(`::${command} file=${escapeProperty(rel)},title=${escapeProperty(`Sourcebook ${i.section === '0' ? 'header' : `Section ${i.section}`}`)}::${escapeData(clean(i.message))}\n`);
    }
    out.stdout(`${result.errors} errors, ${result.warnings} warnings (${ATTRIBUTION}, ${ATTRIBUTION_URL}).\n`);
    const fail = result.errors > 0 || (strictText === 'true' && result.warnings > 0);
    writeOutputs(env.GITHUB_OUTPUT, { errors: String(result.errors), warnings: String(result.warnings), valid: String(!fail) });
    stepSummary(env.GITHUB_STEP_SUMMARY, rel, result);
    return fail ? 1 : 0;
  } catch (e) {
    let message = 'Unexpected error.';
    if (e instanceof SchemaError) message = `${e.message} ${e.issues.slice(0, 20).map((i) => `${i.path.slice(0, 200)}: ${i.message}`).join(' ')}`;
    else if (e instanceof InputError || e instanceof YamlError || e instanceof Error) message = e.message;
    out.stdout(`::error title=Sourcebook::${escapeData(clean(message))}\n`);
    return 2;
  }
}
