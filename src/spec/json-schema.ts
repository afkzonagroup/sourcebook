// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * JSON Schemas (draft 2020-12) of the summary and inventory files, for
 * editor support. They describe the structure only; `parseSummary` and
 * `validateSummary` remain the authority (they also check dates, links and
 * the rules of the template).
 */

import { CHECKBOX_MODALITIES, FIELDS, SIZE_RANGES } from './template.js';
import { CATEGORIES } from '../collect/inventory.js';

type Schema = Record<string, unknown>;

const text = (description?: string): Schema => ({ type: 'string', ...(description === undefined ? {} : { description }) });
const nullable = (s: Schema): Schema => ({ anyOf: [s, { type: 'null' }] });
const bool = nullable({ type: 'boolean' });
const date = nullable({ type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' });
const month = nullable({ type: 'string', pattern: '^[0-9]{4}-(0[1-9]|1[0-2])$' });
const monthOrUnknown = nullable({ type: 'string', pattern: '^([0-9]{4}-(0[1-9]|1[0-2])|not known)$' });
const link = { type: 'string', pattern: '^(https?://.*)?$' };
const obj = (properties: Record<string, Schema>, description?: string): Schema => ({
  type: 'object',
  additionalProperties: false,
  properties,
  ...(description === undefined ? {} : { description }),
});
const list = (items: Schema): Schema => ({ type: 'array', items });
const selection = obj({ selected: list({ enum: [...CHECKBOX_MODALITIES] }), other: text() });
const named = (key: string): Schema => list(obj({ name: text(), [key]: link }));

function described(path: string, s: Schema): Schema {
  const f = FIELDS.find((x) => x.path === path);
  if (f === undefined) return s;
  return { ...s, description: `${f.section === '0' ? '' : `Section ${f.section}: `}${f.label}${f.instruction === '' ? '' : ` ${f.instruction}`}` };
}

function row(modality: 'image' | 'audio' | 'video'): Schema {
  return obj({ present: bool, size_range: nullable({ enum: SIZE_RANGES[modality].map((r) => r.id) }), types_of_content: text() });
}

/** JSON Schema of a summary file (format version 1). */
export function summaryJsonSchema(): Schema {
  const G = 'general_information';
  const D = 'data_sources';
  const P = 'data_processing';
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://github.com/afkzonagroup/sourcebook/schema/summary-v1.schema.json',
    title: 'Sourcebook summary file (public summary of training content, AI Act Article 53(1)(d))',
    type: 'object',
    additionalProperties: false,
    required: ['sourcebook'],
    properties: {
      sourcebook: { const: 1 },
      summary_version: described('summary_version', obj({ version: text(), previous_versions: list(obj({ version: text(), link })) })),
      last_update: described('last_update', date),
      general_information: obj({
        provider: obj({
          name_and_contact_details: described(`${G}.provider.name_and_contact_details`, text()),
          authorised_representative: described(
            `${G}.provider.authorised_representative`,
            obj({ applicable: bool, name_and_contact_details: text(), not_applicable_reason: nullable({ enum: ['established_in_union', 'open_source_exemption'] }) }),
          ),
        }),
        model: obj({
          versioned_model_names: described(`${G}.model.versioned_model_names`, list(obj({ name: text(), documentation_links: list(link) }))),
          model_dependencies: described(`${G}.model.model_dependencies`, obj({ is_modification: bool, models: named('summary_link') })),
          placement_dates: described(`${G}.model.placement_dates`, list(obj({ model: text(), date }))),
        }),
        modalities: described(
          `${G}.modalities`,
          obj({
            text: obj({ present: bool, size_range: nullable({ enum: SIZE_RANGES.text.map((r) => r.id) }), size_other_unit: text(), types_of_content: text() }),
            image: row('image'),
            audio: row('audio'),
            video: row('video'),
            other: list(obj({ modality: text(), approximate_size: text(), types_of_content: text() })),
          }),
        ),
        latest_data_collection: described(`${G}.latest_data_collection`, obj({ date: month, continuous_training: bool })),
        linguistic_characteristics: described(`${G}.linguistic_characteristics`, text()),
        other_characteristics: described(`${G}.other_characteristics`, text()),
        additional_comments: described(`${G}.additional_comments`, text()),
      }),
      data_sources: obj({
        public_datasets: obj({
          used: described(`${D}.public_datasets.used`, bool),
          modalities: selection,
          large_datasets: described(
            `${D}.public_datasets.large_datasets`,
            list(obj({ name: text(), link, description: text(), collection_period: obj({ start: monthOrUnknown, end: monthOrUnknown }), selection_approach: text() })),
          ),
          other_datasets_description: described(`${D}.public_datasets.other_datasets_description`, text()),
          additional_comments: text(),
        }),
        licensed_datasets: obj({ concluded: described(`${D}.licensed_datasets.concluded`, bool), modalities: selection }),
        other_private_datasets: obj({
          obtained: described(`${D}.other_private_datasets.obtained`, bool),
          modalities: selection,
          publicly_known_datasets: described(`${D}.other_private_datasets.publicly_known_datasets`, named('link')),
          non_publicly_known_description: described(`${D}.other_private_datasets.non_publicly_known_description`, text()),
          additional_comments: text(),
        }),
        crawled_data: obj({
          crawlers_used: described(`${D}.crawled_data.crawlers_used`, bool),
          crawler_names: list(text()),
          purposes: text(),
          crawler_behaviour: described(`${D}.crawled_data.crawler_behaviour`, text()),
          collection_period: obj({ from: month, to: month }),
          content_description: described(`${D}.crawled_data.content_description`, text()),
          modalities: selection,
          top_domains: described(`${D}.crawled_data.top_domains`, obj({ domains: list({ type: 'string' }), access_information: text() })),
          additional_comments: text(),
        }),
        user_data: obj({
          from_model_interactions: described(`${D}.user_data.from_model_interactions`, bool),
          from_other_services: described(`${D}.user_data.from_other_services`, bool),
          services_description: text(),
          modalities: selection,
          additional_comments: text(),
        }),
        synthetic_data: obj({
          created: described(`${D}.synthetic_data.created`, bool),
          modalities: selection,
          market_models: named('summary_link'),
          other_models_information: described(`${D}.synthetic_data.other_models_information`, text()),
          additional_comments: text(),
        }),
        other_sources: obj({ used: described(`${D}.other_sources.used`, bool), description: text(), additional_comments: text() }),
      }),
      data_processing: obj({
        tdm_reservations: obj({
          code_of_practice_signatory: described(`${P}.tdm_reservations.code_of_practice_signatory`, bool),
          measures: described(`${P}.tdm_reservations.measures`, text()),
          additional_comments: text(),
        }),
        illegal_content: obj({ measures: described(`${P}.illegal_content.measures`, text()) }),
        other_information: described(`${P}.other_information`, text()),
      }),
      information_gaps: list(obj({ field: { enum: FIELDS.map((f) => f.id) }, justification: text() })),
    },
  };
}

/** JSON Schema of an inventory file (version 1). */
export function inventoryJsonSchema(): Schema {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://github.com/afkzonagroup/sourcebook/schema/inventory-v1.schema.json',
    title: 'Sourcebook inventory (facts collected about training data)',
    type: 'object',
    additionalProperties: false,
    required: ['kind', 'version'],
    properties: {
      kind: { const: 'sourcebook-inventory' },
      version: { const: 1 },
      generator: text(),
      datasets: list(
        obj({
          id: text(),
          name: text(),
          link,
          category: nullable({ enum: [...CATEGORIES] }),
          modalities: list(text()),
          languages: list(text()),
          licenses: list(text()),
          sizes: list(obj({ modality: text(), value: { type: 'string', pattern: '^[0-9]{1,30}$' }, unit: text(), basis: text(), after_preprocessing: { type: 'boolean' } })),
          collection_period: obj({ start: month, end: month }),
          publicly_known: bool,
          source: obj({ kind: text(), reference: text(), revision: nullable(text()) }),
          notes: list(text()),
        }),
      ),
      domain_report: nullable({ type: 'object' }),
    },
  };
}
