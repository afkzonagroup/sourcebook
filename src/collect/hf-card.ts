// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Hugging Face dataset cards: the YAML front matter of a dataset's
 * README.md (metadata fields documented at
 * https://huggingface.co/docs/hub/datasets-cards and
 * https://github.com/huggingface/hub-docs/blob/main/datasetcard.md) and,
 * when fetched online, the Hub API's `cardData`, `tags`, `gated`, `private`
 * and `sha`.
 *
 * Only facts are taken over. Where the card does not say something the
 * template needs (for example sizes after pre-processing or collection
 * dates), the field stays empty and a note says so.
 */

import { parseYaml, splitFrontMatter, type YamlLimits, DEFAULT_YAML_LIMITS } from '../yaml/parse.js';
import type { InventoryDataset, DatasetSize } from './inventory.js';
import { CONTROL_CHARS, HIDDEN_CHARS } from '../schema/checks.js';

/** Hub repository ids: "name" or "owner/name", the characters the Hub allows. */
export const REPO_ID_RE = /^(?:[A-Za-z0-9](?:[A-Za-z0-9._-]{0,94}[A-Za-z0-9])?\/)?[A-Za-z0-9](?:[A-Za-z0-9._-]{0,94}[A-Za-z0-9])?$/;

/** True for a syntactically valid Hub dataset id (no "..", no "--"). */
export function isRepoId(id: string): boolean {
  return REPO_ID_RE.test(id) && !id.includes('..') && !id.includes('--');
}

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function get(o: Obj, k: string): unknown {
  return Object.hasOwn(o, k) ? o[k] : undefined;
}

function strings(v: unknown, max = 500): string[] {
  const list = typeof v === 'string' ? [v] : Array.isArray(v) ? v : [];
  const out: string[] = [];
  for (const x of list) {
    if (typeof x === 'string' && x.trim() !== '' && x.length <= 200 && !CONTROL_CHARS.test(x) && !HIDDEN_CHARS.test(x) && !x.includes('\n')) {
      if (!out.includes(x.trim())) out.push(x.trim());
    }
    if (out.length >= max) break;
  }
  return out;
}

function nonNegativeInt(v: unknown): bigint | null {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return null;
  return BigInt(Math.floor(v));
}

const TASK_MODALITY: Record<string, string> = {
  'automatic-speech-recognition': 'audio',
  'audio-classification': 'audio',
  'text-to-speech': 'audio',
  'audio-to-audio': 'audio',
  'image-classification': 'image',
  'object-detection': 'image',
  'image-segmentation': 'image',
  'text-to-image': 'image',
  'image-to-text': 'image',
  'video-classification': 'video',
  'text-to-video': 'video',
  'text-generation': 'text',
  'text-classification': 'text',
  'question-answering': 'text',
  'summarization': 'text',
  'translation': 'text',
  'fill-mask': 'text',
  'token-classification': 'text',
};

/** Modalities from the Hub's "modality:" tags (computed by the Hub from the data files). */
function modalitiesFromTags(tags: string[]): string[] {
  const out: string[] = [];
  for (const t of tags) {
    const m = /^modality:(text|image|audio|video)$/.exec(t);
    if (m !== null && !out.includes(m[1] ?? '')) out.push(m[1] ?? '');
  }
  return out;
}

/** Walks `dataset_info.features` and returns the modalities its types imply. */
function modalitiesFromFeatures(info: unknown): string[] {
  const found = new Set<string>();
  let budget = 10_000;
  const walk = (v: unknown, depth: number): void => {
    if (budget-- <= 0 || depth > 20) return;
    if (Array.isArray(v)) {
      for (const x of v) walk(x, depth + 1);
      return;
    }
    if (!isObj(v)) return;
    const dtype = get(v, 'dtype');
    if (dtype === 'string' || dtype === 'large_string') found.add('text');
    if (dtype === 'image' || get(v, 'image') !== undefined) found.add('image');
    if (dtype === 'audio' || (isObj(dtype) && get(dtype, 'audio') !== undefined)) found.add('audio');
    if (dtype === 'video' || (isObj(dtype) && get(dtype, 'video') !== undefined)) found.add('video');
    if (isObj(dtype) && get(dtype, 'image') !== undefined) found.add('image');
    for (const k of Object.keys(v)) if (k !== 'dtype') walk(v[k], depth + 1);
  };
  const configs = Array.isArray(info) ? info : [info];
  for (const c of configs) if (isObj(c)) walk(get(c, 'features'), 0);
  return [...found];
}

/** Sums `dataset_size` and `num_examples` over all configurations of `dataset_info`. */
function sizesFromInfo(info: unknown): { bytes: bigint | null; examples: bigint | null } {
  const configs = Array.isArray(info) ? info : [info];
  let bytes: bigint | null = null;
  let examples: bigint | null = null;
  let complete = true;
  let completeEx = true;
  for (const c of configs) {
    if (!isObj(c)) continue;
    const size = nonNegativeInt(get(c, 'dataset_size'));
    if (size === null) complete = false;
    else bytes = (bytes ?? 0n) + size;
    const splits = get(c, 'splits');
    if (Array.isArray(splits)) {
      for (const s of splits) {
        const n = isObj(s) ? nonNegativeInt(get(s, 'num_examples')) : null;
        if (n === null) completeEx = false;
        else examples = (examples ?? 0n) + n;
      }
    } else completeEx = false;
  }
  return { bytes: complete ? bytes : null, examples: completeEx ? examples : null };
}

export interface HfCardInput {
  /** Hub id ("owner/name"), when known. */
  readonly id?: string;
  /** Text of README.md, when available. */
  readonly readme?: string | null;
  /** Hub API response for the dataset, when fetched online. */
  readonly api?: unknown;
  /** Where the data came from (file path or URL), for the inventory. */
  readonly reference: string;
  readonly yamlLimits?: YamlLimits;
}

/**
 * Turns a dataset card (and optionally the Hub API response) into an
 * inventory entry.
 *
 * @throws YamlError when the front matter is not valid (safe) YAML.
 */
export function datasetFromHfCard(input: HfCardInput): InventoryDataset {
  const api = isObj(input.api) ? input.api : null;
  let card: Obj = {};
  let fromApi = false;
  if (api !== null && isObj(get(api, 'cardData'))) {
    card = get(api, 'cardData') as Obj;
    fromApi = true;
  } else if (typeof input.readme === 'string') {
    const fm = splitFrontMatter(input.readme);
    if (fm.yaml !== null) {
      const parsed = parseYaml(fm.yaml, input.yamlLimits ?? DEFAULT_YAML_LIMITS);
      if (isObj(parsed)) card = parsed;
    }
  }
  const apiId = api !== null && typeof get(api, 'id') === 'string' ? (get(api, 'id') as string) : undefined;
  const id = apiId !== undefined && isRepoId(apiId) ? apiId : input.id !== undefined && isRepoId(input.id) ? input.id : undefined;
  const prettyName = strings(get(card, 'pretty_name'), 1)[0];
  const notes: string[] = [];
  const name = prettyName ?? id ?? input.reference.slice(-200);

  const tags = api !== null ? strings(get(api, 'tags'), 5000) : [];
  let modalities = modalitiesFromTags(tags);
  if (modalities.length === 0) {
    const fromFeatures = modalitiesFromFeatures(get(card, 'dataset_info'));
    const fromTasks = strings(get(card, 'task_categories')).map((t) => TASK_MODALITY[t]).filter((m): m is string => m !== undefined);
    modalities = [...new Set([...fromFeatures, ...fromTasks])].sort();
    if (modalities.length > 0) notes.push('Modalities were inferred from the card (feature types and task categories); check them.');
    else notes.push('The card does not show the modalities; add them.');
  }

  const licenses = strings(get(card, 'license'));
  const licenseName = strings(get(card, 'license_name'), 1)[0];
  if (licenseName !== undefined) licenses.push(licenseName);
  if (licenses.length === 0) notes.push('The card names no licence; check the conditions of use.');
  else if (licenses.includes('other') || licenses.includes('unknown')) notes.push('The card gives the licence as "other" or "unknown"; check the conditions of use.');

  const sizes: DatasetSize[] = [];
  const { bytes, examples } = sizesFromInfo(get(card, 'dataset_info'));
  if (modalities.length === 1) {
    const m = modalities[0] ?? 'text';
    if (bytes !== null) sizes.push({ modality: m, value: bytes.toString(), unit: 'bytes', basis: 'dataset_info.dataset_size in the dataset card (before any pre-processing of yours)', after_preprocessing: false });
    if (examples !== null) sizes.push({ modality: m, value: examples.toString(), unit: 'examples', basis: 'dataset_info splits num_examples in the dataset card', after_preprocessing: false });
  } else if (bytes !== null) {
    notes.push('The card gives one size for several modalities; add a size per modality.');
  }
  if (sizes.length === 0) {
    const cats = strings(get(card, 'size_categories'));
    if (cats.length > 0) notes.push(`The card gives only a size category (${cats.join(', ')}, number of examples).`);
  }

  let category: InventoryDataset['category'] = 'public';
  const gated = api !== null ? get(api, 'gated') : undefined;
  const isPrivate = api !== null ? get(api, 'private') === true : false;
  if (isPrivate) {
    category = null;
    notes.push('The dataset is private on the Hub; it is not a publicly available dataset (Section 2.1).');
  } else if (gated === 'auto' || gated === 'manual' || gated === true) {
    notes.push(`Access to the dataset is gated on the Hub (${String(gated)}); check whether it is "made available publicly for free" and "readily downloadable" (Section 2.1).`);
  }
  if (api !== null && get(api, 'disabled') === true) notes.push('The dataset is disabled on the Hub.');
  const sources = strings(get(card, 'source_datasets'));
  if (sources.length > 0 && !(sources.length === 1 && sources[0] === 'original')) notes.push(`Source datasets named in the card: ${sources.join(', ')}.`);
  const creators = strings(get(card, 'annotations_creators')).concat(strings(get(card, 'language_creators')));
  if (creators.includes('machine-generated')) notes.push('The card says that content was machine-generated. Synthetic data you created, or had created for you, belongs in Section 2.5; a third-party public dataset stays in Section 2.1.');

  const sha = api !== null && typeof get(api, 'sha') === 'string' && /^[0-9a-f]{40}$/.test(get(api, 'sha') as string) ? (get(api, 'sha') as string) : null;
  return {
    id: id !== undefined ? `hf:${id}` : `card:${name}`,
    name,
    link: id !== undefined ? `https://huggingface.co/datasets/${id}` : '',
    category,
    modalities,
    languages: strings(get(card, 'language')),
    licenses,
    sizes,
    collection_period: { start: null, end: null },
    publicly_known: null,
    source: { kind: fromApi ? 'hf-hub' : 'hf-card', reference: input.reference.slice(0, 1000), revision: sha },
    notes,
  };
}
