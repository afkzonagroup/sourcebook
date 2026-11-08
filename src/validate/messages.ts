// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Validation messages. The Python package reads the same table from
 * `spec/template-v1.json`, so both print identical messages.
 * Placeholders: {label}, {section}, {name}, {detail}.
 */
export const MESSAGES = {
  missing: 'Section {section}, “{label}”: required by the template but not filled in.',
  'missing-where-applicable':
    'Section {section}, “{label}”: empty. The template asks for this where applicable; describe it, or say briefly why it does not apply.',
  'missing-size': 'Section 1.3, {name}: select the training data size range{detail}.',
  'missing-types': 'Section 1.3, {name}: describe the types of content.',
  'no-modality': 'Section 1.3: no modality is selected. Select the modalities present in the training data.',
  'other-modality-incomplete': 'Section 1.3, Other modality {name}: give the modality, its approximate size with the unit, and the types of content.',
  'inconsistent': 'Section {section}, “{label}”: filled in although the answer to the question it depends on is No. Remove it or change the answer.',
  'modality-not-in-overview': 'Section {section}: modality {name} is ticked here but not selected in Section 1.3.',
  'previous-version-link': 'Version of the Summary: previous version {name} has no link. The template asks for links to previous versions.',
  'model-name-missing': 'Section 1.2, “Versioned model name(s):”: a model entry has no name.',
  'model-name-duplicate': 'Section 1.2, “Versioned model name(s):”: {name} is listed twice.',
  'placement-date-missing': 'Section 1.2, “Date of placement of the model on the Union market:”: no date for {name}.',
  'placement-date-unknown-model': 'Section 1.2, “Date of placement of the model on the Union market:”: {name} is not one of the versioned model names.',
  'dependency-name-missing': 'Section 1.2, “Model dependencies:”: a modified model has no name.',
  'authorised-representative-reason':
    'Section 1.1, “Authorised representative name and contact details:”: state why it does not apply (established_in_union or open_source_exemption).',
  'large-dataset-incomplete':
    'Section 2.1, large dataset {name}: give its name and a link; if no link is available, give a general description and the approximate start and end dates of the data collection (or “not known”).',
  'large-dataset-name-missing': 'Section 2.1, “List of large publicly available datasets:”: an entry has no name.',
  'public-datasets-empty': 'Section 2.1: publicly available datasets were used, but neither large datasets nor a description of other datasets is given.',
  'private-datasets-empty':
    'Section 2.2.2: private datasets were obtained, but neither publicly known datasets nor a description of non-publicly known datasets is given.',
  'named-entry-missing': 'Section {section}, “{label}”: an entry has no name.',
  'synthetic-models-empty': 'Section 2.5: synthetic data was created, but no model used to generate it is named or described.',
  'period-order': 'Section 2.3, “Period of data collection:”: the start ({name}) is after the end ({detail}).',
  'top-domains-empty': 'Section 2.3, “Summary of the most relevant domain names crawled:”: give the list of domain names, or information on how to access it.',
  'gap-stated': 'Section {section}, “{label}”: not filled in; an information gap is stated and justified (Explanatory Notice, point 33).',
  'gap-not-allowed':
    'Information gap for “{label}”: the Explanatory Notice (point 33) allows stating gaps only for models placed on the market before 2 August 2025.',
  'gap-unknown-field': 'Information gap: {name} is not a field of the template.',
  'gap-no-justification': 'Information gap for “{label}”: the gap must be justified.',
  'gap-optional-field': 'Information gap for “{label}”: this field is optional, so no gap needs to be stated.',
  'legacy-model':
    'A model covered by this Summary was placed on the market before 2 August 2025: the summary is due by 2 August 2027 (Article 111(3) AI Act), and missing information may be stated and justified as an information gap (Explanatory Notice, point 33).',
  'last-update-future': 'Last update: {name} is after {detail}.',
  'last-update-missing': 'Last update: required by the template but not filled in.',
  'update-due':
    'Last update: the model is continuously trained and the Summary was last updated on {name}. The Explanatory Notice (point 29) asks for updates at six-month intervals, or sooner after a materially significant change.',
  'large-dataset-not-listed': 'Section 2.1: {name} exceeds 3% of the publicly available data for {detail} in the inventory, but is not in the list of large datasets.',
  'large-datasets-undetermined': 'Section 2.1: the inventory does not give comparable sizes for all publicly available {name} datasets, so large datasets could not be checked.',
  'domain-not-listed': 'Section 2.3: {name} is required by the domain report (rank {detail}) but is not in the list of domain names.',
} as const;

export type MessageCode = keyof typeof MESSAGES;

/** Fills the placeholders of a message. */
export function formatMessage(code: MessageCode, values: Readonly<Record<string, string>>): string {
  return MESSAGES[code].replace(/\{(label|section|name|detail)\}/g, (_m, key: string) => values[key] ?? '');
}
