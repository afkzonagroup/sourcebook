// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Types of a summary file (format version 1). The structure mirrors the AI
 * Office template one to one; see `src/spec/template.ts` for the field labels
 * and docs/template-mapping.md for the mapping table.
 *
 * Every field that the template asks for is present. An unanswered field is
 * `null` (a yes/no question or a date) or an empty string or list. Narrative
 * fields are plain text: paragraphs separated by blank lines.
 */

import type { CheckboxModality } from '../spec/template.js';

/** "YYYY-MM-DD". */
export type IsoDate = string;
/** "YYYY-MM". */
export type IsoMonth = string;

export interface PreviousVersion {
  version: string;
  link: string;
}

export interface SummaryVersion {
  version: string;
  previous_versions: PreviousVersion[];
}

export type NotApplicableReason = 'established_in_union' | 'open_source_exemption';

export interface AuthorisedRepresentative {
  /** `null` = not answered. */
  applicable: boolean | null;
  name_and_contact_details: string;
  /** Required when `applicable` is false. */
  not_applicable_reason: NotApplicableReason | null;
}

export interface Provider {
  name_and_contact_details: string;
  authorised_representative: AuthorisedRepresentative;
}

export interface VersionedModel {
  name: string;
  documentation_links: string[];
}

export interface ModelDependency {
  name: string;
  summary_link: string;
}

export interface ModelDependencies {
  is_modification: boolean | null;
  models: ModelDependency[];
}

export interface PlacementDate {
  model: string;
  date: IsoDate | null;
}

export interface ModelIdentification {
  versioned_model_names: VersionedModel[];
  model_dependencies: ModelDependencies;
  placement_dates: PlacementDate[];
}

export interface StandardModalityRow {
  present: boolean | null;
  /** One of the range ids of SIZE_RANGES for this modality. */
  size_range: string | null;
  types_of_content: string;
}

export interface TextModalityRow extends StandardModalityRow {
  /** "Alternatively, specify the approximate size in a different measurement unit". */
  size_other_unit: string;
}

export interface OtherModalityRow {
  modality: string;
  /** Approximate size with its unit of measurement. */
  approximate_size: string;
  types_of_content: string;
}

export interface Modalities {
  text: TextModalityRow;
  image: StandardModalityRow;
  audio: StandardModalityRow;
  video: StandardModalityRow;
  other: OtherModalityRow[];
}

export interface LatestDataCollection {
  date: IsoMonth | null;
  continuous_training: boolean | null;
}

export interface GeneralInformation {
  provider: Provider;
  model: ModelIdentification;
  modalities: Modalities;
  latest_data_collection: LatestDataCollection;
  linguistic_characteristics: string;
  other_characteristics: string;
  additional_comments: string;
}

/** The "☐ Text ☐ Image ☐ Video ☐ Audio ☐ Other (please specify)" control. */
export interface ModalitySelection {
  selected: CheckboxModality[];
  /** Text for "Other"; empty when "Other" is not ticked. */
  other: string;
}

/** "YYYY-MM", or "not known" (the template's own wording for an unknown date). */
export type MonthOrUnknown = string;

export interface CollectionPeriodOrUnknown {
  start: MonthOrUnknown | null;
  end: MonthOrUnknown | null;
}

export interface LargeDataset {
  name: string;
  link: string;
  /** Required when there is no link. */
  description: string;
  /** Required when there is no link. */
  collection_period: CollectionPeriodOrUnknown;
  /** "If only part of the datasets has been used for the training, indicate the general approach to selecting those parts." */
  selection_approach: string;
}

export interface PublicDatasets {
  used: boolean | null;
  modalities: ModalitySelection;
  large_datasets: LargeDataset[];
  other_datasets_description: string;
  additional_comments: string;
}

export interface LicensedDatasets {
  concluded: boolean | null;
  modalities: ModalitySelection;
}

export interface NamedLink {
  name: string;
  link: string;
}

export interface OtherPrivateDatasets {
  obtained: boolean | null;
  modalities: ModalitySelection;
  publicly_known_datasets: NamedLink[];
  non_publicly_known_description: string;
  additional_comments: string;
}

export interface CollectionPeriod {
  from: IsoMonth | null;
  to: IsoMonth | null;
}

export interface TopDomains {
  /** Registrable domain names, most relevant first. */
  domains: string[];
  /** Where the list can be downloaded or how to access it. */
  access_information: string;
}

export interface CrawledData {
  crawlers_used: boolean | null;
  crawler_names: string[];
  purposes: string;
  crawler_behaviour: string;
  collection_period: CollectionPeriod;
  content_description: string;
  modalities: ModalitySelection;
  top_domains: TopDomains;
  additional_comments: string;
}

export interface UserData {
  from_model_interactions: boolean | null;
  from_other_services: boolean | null;
  services_description: string;
  modalities: ModalitySelection;
  additional_comments: string;
}

export interface SyntheticData {
  created: boolean | null;
  modalities: ModalitySelection;
  market_models: ModelDependency[];
  other_models_information: string;
  additional_comments: string;
}

export interface OtherSources {
  used: boolean | null;
  description: string;
  additional_comments: string;
}

export interface DataSources {
  public_datasets: PublicDatasets;
  licensed_datasets: LicensedDatasets;
  other_private_datasets: OtherPrivateDatasets;
  crawled_data: CrawledData;
  user_data: UserData;
  synthetic_data: SyntheticData;
  other_sources: OtherSources;
}

export interface TdmReservations {
  code_of_practice_signatory: boolean | null;
  measures: string;
  additional_comments: string;
}

export interface IllegalContent {
  measures: string;
}

export interface DataProcessing {
  tdm_reservations: TdmReservations;
  illegal_content: IllegalContent;
  other_information: string;
}

/**
 * A statement that information required by the template is not available,
 * with its justification. Explanatory Notice point 33 allows this for models
 * placed on the market before 2 August 2025; it is printed in the
 * "Additional comments" box of the field's section (Notice footnote 24).
 */
export interface InformationGap {
  /** A field id from the template (see FIELDS in src/spec/template.ts). */
  field: string;
  justification: string;
}

/** A complete summary file. */
export interface Summary {
  /** File format version; always 1. */
  sourcebook: 1;
  summary_version: SummaryVersion;
  last_update: IsoDate | null;
  general_information: GeneralInformation;
  data_sources: DataSources;
  data_processing: DataProcessing;
  information_gaps: InformationGap[];
}
