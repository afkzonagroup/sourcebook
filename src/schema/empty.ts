// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

import type { ModalitySelection, Summary } from './types.js';

function noModalities(): ModalitySelection {
  return { selected: [], other: '' };
}

/** A summary with every field present and unanswered. */
export function emptySummary(): Summary {
  return {
    sourcebook: 1,
    summary_version: { version: '', previous_versions: [] },
    last_update: null,
    general_information: {
      provider: {
        name_and_contact_details: '',
        authorised_representative: { applicable: null, name_and_contact_details: '', not_applicable_reason: null },
      },
      model: {
        versioned_model_names: [],
        model_dependencies: { is_modification: null, models: [] },
        placement_dates: [],
      },
      modalities: {
        text: { present: null, size_range: null, size_other_unit: '', types_of_content: '' },
        image: { present: null, size_range: null, types_of_content: '' },
        audio: { present: null, size_range: null, types_of_content: '' },
        video: { present: null, size_range: null, types_of_content: '' },
        other: [],
      },
      latest_data_collection: { date: null, continuous_training: null },
      linguistic_characteristics: '',
      other_characteristics: '',
      additional_comments: '',
    },
    data_sources: {
      public_datasets: { used: null, modalities: noModalities(), large_datasets: [], other_datasets_description: '', additional_comments: '' },
      licensed_datasets: { concluded: null, modalities: noModalities() },
      other_private_datasets: { obtained: null, modalities: noModalities(), publicly_known_datasets: [], non_publicly_known_description: '', additional_comments: '' },
      crawled_data: {
        crawlers_used: null,
        crawler_names: [],
        purposes: '',
        crawler_behaviour: '',
        collection_period: { from: null, to: null },
        content_description: '',
        modalities: noModalities(),
        top_domains: { domains: [], access_information: '' },
        additional_comments: '',
      },
      user_data: { from_model_interactions: null, from_other_services: null, services_description: '', modalities: noModalities(), additional_comments: '' },
      synthetic_data: { created: null, modalities: noModalities(), market_models: [], other_models_information: '', additional_comments: '' },
      other_sources: { used: null, description: '', additional_comments: '' },
    },
    data_processing: {
      tdm_reservations: { code_of_practice_signatory: null, measures: '', additional_comments: '' },
      illegal_content: { measures: '' },
      other_information: '',
    },
    information_gaps: [],
  };
}
