// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The AI Office template for the public summary of training content, as data.
 *
 * Source: Annex to the Communication from the Commission C(2025) 8311 final
 * of 5 December 2025, "Explanatory Notice and Template for the Public Summary
 * of Training Content for general-purpose AI models required by Article 53
 * (1)(d) of Regulation (EU) 2024/1689 (AI Act)", and the Word version of the
 * Template published by the Commission on the same page (first published on
 * 24 July 2025). Labels, instructions and section texts are copied verbatim
 * from the Word version of the Template, including its spelling. Template
 * text © European Union, reused under CC BY 4.0 (see NOTICE).
 *
 * This module is the single source of truth for labels and instructions. The
 * Python package reads the same data from `spec/template-v1.json`, which
 * `scripts/export-spec.mjs` writes from this module (a test keeps them equal).
 */

/** Identifies the template version this package implements. */
export const TEMPLATE = {
  id: 'eu-ai-office-gpai-public-summary-of-training-content',
  title: 'Template for the Public Summary of Training Content for General-Purpose AI models',
  subtitle: 'required by Article 53 (1)(d) of Regulation (EU) 2024/1689 (AI Act)',
  document: 'Annex to Communication from the Commission C(2025) 8311 final',
  documentDate: '2025-12-05',
  firstPublished: '2025-07-24',
  sourceUrl:
    'https://digital-strategy.ec.europa.eu/en/library/explanatory-notice-and-template-public-summary-training-content-general-purpose-ai-models',
  legalBasisUrl: 'https://eur-lex.europa.eu/eli/reg/2024/1689/oj',
  copyright: 'Template text © European Union, reused under the Creative Commons Attribution 4.0 International licence (CC BY 4.0).',
  intro:
    'This template is provided by the European Commission and required to be filled in by providers of general-purpose AI models prior to their placing on the Union market in order to comply with their obligation under Article 53 (1)(d) of Regulation (EU) 2024/1689 (AI Act).',
} as const;

/** Version of the summary file format (the `sourcebook` key). */
export const FORMAT_VERSION = 1;

/** Modalities with a size range in Section 1.3 of the template. */
export const STANDARD_MODALITIES = ['text', 'image', 'audio', 'video'] as const;
export type StandardModality = (typeof STANDARD_MODALITIES)[number];

/** Modalities that can be ticked in Sections 2.1 to 2.5 ("Other" is a free text). */
export const CHECKBOX_MODALITIES = ['text', 'image', 'video', 'audio'] as const;
export type CheckboxModality = (typeof CHECKBOX_MODALITIES)[number];

/** Size ranges of Section 1.3, with the exact checkbox labels of the template. */
export const SIZE_RANGES = {
  text: [
    { id: 'below_1b_tokens', label: 'Less than 1 billion tokens' },
    { id: '1b_to_10t_tokens', label: '1billion to 10 trillions tokens' },
    { id: 'above_10t_tokens', label: 'More than 10 trillions tokens' },
  ],
  image: [
    { id: 'below_1m_images', label: 'Less than 1 million images' },
    { id: '1m_to_1b_images', label: '1Million to1 billion images' },
    { id: 'above_1b_images', label: 'More than 1 billion images' },
  ],
  audio: [
    { id: 'below_10k_hours', label: 'Less than 10 000 hours' },
    { id: '10k_to_1m_hours', label: '10 000 to1 million hours' },
    { id: 'above_1m_hours', label: 'More than 1 million hours' },
  ],
  video: [
    { id: 'below_10k_hours', label: 'Less than 10 000 hours' },
    { id: '10k_to_1m_hours', label: '10 000 to1 million hours' },
    { id: 'above_1m_hours', label: 'More than 1 million hours' },
  ],
} as const satisfies Record<StandardModality, readonly { id: string; label: string }[]>;

/** Numeric bounds of the ranges: below `low`, `low` to `high` inclusive, above `high`. */
export const SIZE_RANGE_BOUNDS = {
  text: { unit: 'tokens', low: 1_000_000_000n, high: 10_000_000_000_000n },
  image: { unit: 'images', low: 1_000_000n, high: 1_000_000_000n },
  audio: { unit: 'hours', low: 10_000n, high: 1_000_000n },
  video: { unit: 'hours', low: 10_000n, high: 1_000_000n },
} as const satisfies Record<StandardModality, { unit: string; low: bigint; high: bigint }>;

/** Column headings and examples of the modality table in Section 1.3. */
export const MODALITY_TABLE = {
  headings: {
    modality: 'Modality',
    size: 'Training data size',
    types: 'Types of content',
  },
  instructions: {
    modality: 'Select the modalities present in the training data, to the extent that they are identifiable',
    size: 'For each selected modality, select the range within which the estimated total training data size for that modality falls. Dynamic datasets may be excluded from the estimation.',
    types: 'For each selected modality, provide a general description of the type of content that has been included in the training data.',
  },
  rows: {
    text: {
      label: 'Text',
      examples:
        'Examples of possible types of content include fiction and non fiction text, scientific text, press publications, legal and official documents, social media comments, source code.',
    },
    image: {
      label: 'Image',
      examples:
        'Examples of possible types of content include photography, visual art works, infographics, social media images, logos, brands.',
    },
    audio: {
      label: 'Audio',
      examples:
        'Examples of possible types of content include musical compositions and recordings, audiobooks, radio shows and podcasts, private audio communication.',
    },
    video: {
      label: 'Video',
      examples:
        'Examples of possible types of content include music videos, films, TV programmes, performances, video games, video clips, journalistic videos, social media videos.',
    },
    other: {
      label: 'Other',
      examples: 'Specify the modality and for each one indicate approximate size and unit of measurement',
    },
  },
  textAlternative: 'Alternatively, specify the approximate size in a different measurement unit:',
  audioFootnote:
    'Excluding audio that is part of video, as this should be reported under the “video” modality instead. Furthermore, the Commission understands the modality of ‘audio’ to include ‘speech’.',
} as const;

/** Checkbox labels used in Sections 2 and 3. */
export const CHECKBOX = {
  yes: 'Yes',
  no: 'No',
  text: 'Text',
  image: 'Image',
  video: 'Video',
  audio: 'Audio',
  other: 'Other',
  otherSpecify: 'If so, please specify…',
} as const;

/** How the template asks for a field. */
export type Requirement =
  /** Always to be filled in. */
  | 'required'
  /** To be filled in when the condition in `condition` holds. */
  | 'conditional'
  /** The template says "where applicable" or "where such information is readily available". */
  | 'where-applicable'
  /** The template marks the field "(optional)" or as voluntary. */
  | 'optional';

/** One field of the template. */
export interface FieldSpec {
  /** Stable identifier, used in validation messages and gap statements. */
  readonly id: string;
  /** Location in the summary file (dotted path). */
  readonly path: string;
  /** Template section number, e.g. "2.3". */
  readonly section: string;
  /** Field label, verbatim. */
  readonly label: string;
  /** Instruction text, verbatim (empty when the template gives none). */
  readonly instruction: string;
  readonly requirement: Requirement;
  /** Plain-language condition for conditional fields. */
  readonly condition?: string;
  /** Path of the "Additional comments" box in which a gap statement for this field is printed. */
  readonly box: string;
}

/** One section of the template. */
export interface SectionSpec {
  readonly number: string;
  readonly title: string;
  /** Introductory paragraphs of the section, verbatim. */
  readonly intro: readonly string[];
}

export const SECTIONS: readonly SectionSpec[] = [
  { number: '1', title: 'General information', intro: [] },
  { number: '1.1', title: 'Provider identification', intro: [] },
  { number: '1.2', title: 'Model identification', intro: [] },
  {
    number: '1.3',
    title: 'Modalities, overall training data size and other characteristics',
    intro: ['This Section requires general information about the overall training data after pre-processing and before the training of the model.'],
  },
  {
    number: '2',
    title: 'List of data sources',
    intro: [
      'This Section requires information about specific sources of data used to train the general-purpose AI model. In this section “dataset” should be understood as a single, pre-packaged collection of data. The filtering and pre-processing of data collected from the same pre-packaged collection should not be considered a new dataset to be disclosed separately in the sections below. If a particular dataset can be assigned to more than one of the categories below, providers should select the most relevant category and only report the dataset in that category, except in the case of synthetic data (see Section 2.5).',
    ],
  },
  {
    number: '2.1',
    title: 'Publicly available datasets',
    intro: [
      'This Section requires information about datasets that were used to train the model and which have been compiled by a third party, are made available publicly for free, and are readily downloadable as a whole or in predefined chunks, such as datasets and collections available on public repositories and online platforms, specialised websites, or snapshots of common crawl. The public availability of the datasets for free does not mean that the content at issue is necessarily free of rights since it may be subject to licensing arrangements or conditions of use (e.g., certain free and/or open licenses may determine the scope of the uses, including prohibiting uses relating to model training).',
      'A dataset is considered to be “large” if the total data size for any one of the modalities contained in the dataset exceeds 3% of the size of all publicly available datasets for that modality used for training. The size of the dataset should be based on its size after pre-processing (for example filtering), and without splitting the dataset to prevent reporting circumvention.',
    ],
  },
  {
    number: '2.2',
    title: 'Private non-publicly available datasets obtained from third parties',
    intro: [
      'This Section requires information about private non-publicly available datasets of third parties that are not publicly available and not disclosed under Section 2.1. These include:',
      'datasets for which transactional commercial licensing agreements were concluded between the provider and the rightsholders or their representatives, including by collective management organisations and legitimate content aggregators who have the right to collectively license works on behalf of rightsholders (Section 2.2.1);',
      'other private datasets obtained through data intermediaries, non-publicly available databases and datasets of third parties for which transactional commercial licenses have not been concluded with rightsholders or their representatives (Section 2.2.2).',
    ],
  },
  { number: '2.2.1', title: 'Datasets commercially licensed by rightsholders or their representatives', intro: [] },
  { number: '2.2.2', title: 'Private datasets obtained from other third parties', intro: [] },
  {
    number: '2.3',
    title: 'Data crawled and scraped from online sources',
    intro: [
      'This Section requires information about crawled, scraped data, or otherwise compiled from online sources directly by the provider of the model or on their behalf (i.e. excluding publicly available datasets already compiled by third parties and made available on platforms such as common crawl that are covered under Section 2.1).',
    ],
  },
  {
    number: '2.4',
    title: 'User data',
    intro: [
      'This Section requires information about user data collected by all services and products of the provider, including through mail services, social media platforms, content platforms or interaction with the providers’ AI models and/or systems. This does not cover data licensed by users based on commercial transactional agreements described in Section 2.2.1., or customer data to fine-tune models for specific purposes.',
    ],
  },
  {
    number: '2.5',
    title: 'Synthetic data',
    intro: [
      'This Section requires information about synthetic data created by or on behalf of the provider for training the model directly on the outputs of another AI model, in particular through model distillation or model alignment (e.g. AI feedback through reinforcement learning). This does not include the use of AI models to clean or enrich data (e.g. AI-generated metadata to enrich or modify a dataset, such as creating depth maps or text descriptions of images). In case this concerns publicly available datasets as described in Section 2.1, these should be reported in that Section of the Template. In case this concerns synthetic datasets created by third parties on behalf of the provider, these should be reported in this Section of the Template instead of in Section 2.2.2.',
    ],
  },
  {
    number: '2.6',
    title: 'Other sources of data',
    intro: [
      'This Section requires information about data that does not fall under any of the categories in the previous Sections, for example data collected from offline sources, self-digitised media (e.g., digitised analog text context, images), datasets labelled by humans commissioned by the provider, or human generated data through reinforcement learning.',
    ],
  },
  { number: '3', title: 'Data processing aspects', intro: [] },
  {
    number: '3.1',
    title: 'Respect of reservation of rights from text and data mining exception or limitation',
    intro: [
      'This Section concerns measures implemented by the provider to identify and comply with the reservation of rights from the text and data mining (TDM) exception or limitation expressed pursuant to Article 4(3) of Directive (EU) 2019/790, as outlined in the copyright policy put in place by the provider in accordance with Article 53(1)(c) AI Act.',
    ],
  },
  {
    number: '3.2',
    title: 'Removal of illegal content',
    intro: [
      'This Section concerns measures taken to avoid or remove illegal content under Union law from the training data (such as blacklists, keywords, and model-based classifiers), without requiring disclosure of specific details about the provider’s internal business practices or trade secrets. Such measures are advisable if the training data is likely to include illegal or unlawful content under Union law, in particular child sexual abuse material and terrorist content and the non-authorised use of material protected by intellectual property rights. Such measures do not include data selection practices, for example to increase the capability of the model.',
    ],
  },
  { number: '3.3', title: 'Other information (optional)', intro: [] },
];

const MODALITIES_LABEL = 'If yes, specify the modality(ies) of the content covered by the datasets concerned:';
const OPTIONAL_VOLUNTARY = 'Providers may also disclose other relevant information on a voluntary basis.';

const B13 = 'general_information.additional_comments';
const B21 = 'data_sources.public_datasets.additional_comments';
const B222 = 'data_sources.other_private_datasets.additional_comments';
const B23 = 'data_sources.crawled_data.additional_comments';
const B24 = 'data_sources.user_data.additional_comments';
const B25 = 'data_sources.synthetic_data.additional_comments';
const B26 = 'data_sources.other_sources.additional_comments';
const B31 = 'data_processing.tdm_reservations.additional_comments';
const B33 = 'data_processing.other_information';

/** Every field of the template, in template order. */
export const FIELDS: readonly FieldSpec[] = [
  {
    id: 'summary_version',
    path: 'summary_version',
    section: '0',
    label: 'Version of the Summary:',
    instruction: 'Version of the summary, with link(s) to previous versions where applicable',
    requirement: 'required',
    box: B13,
  },
  {
    id: 'last_update',
    path: 'last_update',
    section: '0',
    label: 'Last update:',
    instruction: 'DD/MM/YY',
    requirement: 'required',
    box: B13,
  },
  // 1.1
  {
    id: 'provider',
    path: 'general_information.provider.name_and_contact_details',
    section: '1.1',
    label: 'Provider name and contact details:',
    instruction: '',
    requirement: 'required',
    box: B13,
  },
  {
    id: 'authorised_representative',
    path: 'general_information.provider.authorised_representative',
    section: '1.1',
    label: 'Authorised representative name and contact details:',
    instruction: 'Only applicable if the provider is established outside the Union (see Article 54 AI Act).',
    requirement: 'conditional',
    condition: 'the provider is established outside the Union and Article 54(6) AI Act does not apply',
    box: B13,
  },
  // 1.2
  {
    id: 'versioned_model_names',
    path: 'general_information.model.versioned_model_names',
    section: '1.2',
    label: 'Versioned model name(s):',
    instruction:
      'Provide the unique identifier(s) for the model(s) or model version(s) covered by this Summary (e.g. Llama 3.1-405B). In accordance with point 30 of the Commission Explanatory Notice to the Template, the same Summary may be used for different model(s) or model version(s) provided the content of their respective Summaries is identical. Where available, provide link(s) to additional publicly available documentation, such as the model card, for the model(s) or model version(s).',
    requirement: 'required',
    box: B13,
  },
  {
    id: 'model_dependencies',
    path: 'general_information.model.model_dependencies',
    section: '1.2',
    label: 'Model dependencies:',
    instruction:
      'If the model is the result of a modification, including fine-tuning, of one or more general-purpose AI models already placed on the Union market, specify the model (version) name(s) of that/those models and provide a link to their Summary(ies) where available.',
    requirement: 'conditional',
    condition: 'the model is the result of a modification, including fine-tuning, of a general-purpose AI model already placed on the Union market',
    box: B13,
  },
  {
    id: 'placement_dates',
    path: 'general_information.model.placement_dates',
    section: '1.2',
    label: 'Date of placement of the model on the Union market:',
    instruction:
      'Indicate the date on which the model was placed on the Union market (including the dates each model (version(s)) was placed on the market, if the Summary applies to more than one model or version (see point 30 of the Commission Explanatory Notice to the Template).',
    requirement: 'required',
    box: B13,
  },
  // 1.3
  {
    id: 'modalities',
    path: 'general_information.modalities',
    section: '1.3',
    label: 'Modality',
    instruction: MODALITY_TABLE.instructions.modality,
    requirement: 'required',
    box: B13,
  },
  {
    id: 'latest_data_collection',
    path: 'general_information.latest_data_collection',
    section: '1.3',
    label: 'Latest date of data acquisition/collection for model training:',
    instruction:
      'Indicate the latest date when data was collected/obtained for the model training: MM/YYYY Additionally, indicate if the model is continuously trained on new or dynamic data after this date.',
    requirement: 'required',
    box: B13,
  },
  {
    id: 'linguistic_characteristics',
    path: 'general_information.linguistic_characteristics',
    section: '1.3',
    label: 'Description of the linguistic characteristics of the overall training data:',
    instruction:
      'Where applicable, describe the languages covered by the training data (e.g., text, videos or speech), focusing in particular on EU official languages.',
    requirement: 'where-applicable',
    box: B13,
  },
  {
    id: 'other_characteristics',
    path: 'general_information.other_characteristics',
    section: '1.3',
    label: 'Other relevant characteristics of the overall training data:',
    instruction:
      'Where such information is readily available and in so far as it is relevant and practicable, describe other relevant characteristics of the overall training data, such as national/regional or demographic specificities of the training data.',
    requirement: 'where-applicable',
    box: B13,
  },
  {
    id: 'general_additional_comments',
    path: 'general_information.additional_comments',
    section: '1.3',
    label: 'Additional comments (optional):',
    instruction:
      'Providers may also disclose other relevant information on a voluntary basis (e.g. the compression or tokenization methodologies applied for the data size calculation, the sampling frequency/rate plays for audio or video content).',
    requirement: 'optional',
    box: B13,
  },
  // 2.1
  {
    id: 'public_datasets_used',
    path: 'data_sources.public_datasets.used',
    section: '2.1',
    label: 'Have you used publicly available datasets to train the model?',
    instruction: '',
    requirement: 'required',
    box: B21,
  },
  {
    id: 'public_datasets_modalities',
    path: 'data_sources.public_datasets.modalities',
    section: '2.1',
    label: MODALITIES_LABEL,
    instruction: '',
    requirement: 'conditional',
    condition: 'publicly available datasets were used',
    box: B21,
  },
  {
    id: 'large_public_datasets',
    path: 'data_sources.public_datasets.large_datasets',
    section: '2.1',
    label: 'List of large publicly available datasets:',
    instruction:
      'For each large dataset, provide the identifier/name of the dataset and a link through which the dataset can be accessed. If a link is not available, provide a general description of the dataset, including the approximate start and end dates of the data collection if known (otherwise indicate “not known”). If only part of the datasets has been used for the training, indicate the general approach to selecting those parts.',
    requirement: 'conditional',
    condition: 'large publicly available datasets were used',
    box: B21,
  },
  {
    id: 'other_public_datasets',
    path: 'data_sources.public_datasets.other_datasets_description',
    section: '2.1',
    label: 'General description of other publicly available datasets not listed above:',
    instruction:
      'For other publicly available datasets that are not listed above, provide a general description of their content. The description could include indication of: (i) the types of modality (e.g. text, images), (ii) nature of the content (e.g. personal data, copyright protected content, machine generated data such as Internet of Things or synthetic data), (iii) its linguistic characteristics, where applicable. (iv) the approximate start and end dates of the data collection if known (otherwise indicate “not known”).',
    requirement: 'conditional',
    condition: 'publicly available datasets other than the large ones listed were used',
    box: B21,
  },
  {
    id: 'public_datasets_additional_comments',
    path: 'data_sources.public_datasets.additional_comments',
    section: '2.1',
    label: 'Additional comments (optional):',
    instruction: 'Providers may also disclose other relevant information on a voluntary basis, e.g. size of the datasets and other relevant details.',
    requirement: 'optional',
    box: B21,
  },
  // 2.2.1
  {
    id: 'licensed_datasets_concluded',
    path: 'data_sources.licensed_datasets.concluded',
    section: '2.2.1',
    label: 'Have you concluded transactional commercial licensing agreement(s) with rightsholder(s) or with their representatives?',
    instruction: '',
    requirement: 'required',
    box: B222,
  },
  {
    id: 'licensed_datasets_modalities',
    path: 'data_sources.licensed_datasets.modalities',
    section: '2.2.1',
    label: MODALITIES_LABEL,
    instruction: '',
    requirement: 'conditional',
    condition: 'licensing agreements were concluded',
    box: B222,
  },
  // 2.2.2
  {
    id: 'other_private_datasets_obtained',
    path: 'data_sources.other_private_datasets.obtained',
    section: '2.2.2',
    label:
      'Have you obtained private datasets from third parties that are not licensed as described in Section 2.2.1, such as data obtained from providers of private databases, or data intermediaries?',
    instruction: '',
    requirement: 'required',
    box: B222,
  },
  {
    id: 'other_private_datasets_modalities',
    path: 'data_sources.other_private_datasets.modalities',
    section: '2.2.2',
    label: MODALITIES_LABEL,
    instruction: '',
    requirement: 'conditional',
    condition: 'such private datasets were obtained',
    box: B222,
  },
  {
    id: 'publicly_known_private_datasets',
    path: 'data_sources.other_private_datasets.publicly_known_datasets',
    section: '2.2.2',
    label: 'If publicly known, list private datasets obtained from other third parties:',
    instruction:
      'If publicly known, list the identifiers/names of the main private datasets from third parties that are not licensed as described in Section 2.2.1 and that are used to train the model, and provide links to relevant information, where available.',
    requirement: 'conditional',
    condition: 'such private datasets are publicly known',
    box: B222,
  },
  {
    id: 'non_publicly_known_private_datasets',
    path: 'data_sources.other_private_datasets.non_publicly_known_description',
    section: '2.2.2',
    label: 'General description of non-publicly known private datasets obtained from third parties',
    instruction:
      'For those private datasets used to train the model that are not publicly known and whose identifiers are not listed above, provide a general description of their content. The description should indicate (i) the modalities (e.g,, text, images), (ii) nature of the content (e.g., personal data, copyright protected content, machine generated data such as Internet of Things or synthetic data) and (iii) its linguistic characteristics, where applicable.',
    requirement: 'conditional',
    condition: 'private datasets that are not publicly known were obtained',
    box: B222,
  },
  {
    id: 'other_private_datasets_additional_comments',
    path: 'data_sources.other_private_datasets.additional_comments',
    section: '2.2.2',
    label: 'Additional comments (optional):',
    instruction: 'Providers may also disclose other relevant information on a voluntary basis, e.g. the period of data collection, size of the datasets and further details.',
    requirement: 'optional',
    box: B222,
  },
  // 2.3
  {
    id: 'crawlers_used',
    path: 'data_sources.crawled_data.crawlers_used',
    section: '2.3',
    label: 'Were crawlers used by the provider or on behalf of?',
    instruction: '',
    requirement: 'required',
    box: B23,
  },
  {
    id: 'crawler_names',
    path: 'data_sources.crawled_data.crawler_names',
    section: '2.3',
    label: 'If yes, specify crawler name(s)/identifier(s):',
    instruction: '',
    requirement: 'conditional',
    condition: 'crawlers were used',
    box: B23,
  },
  {
    id: 'crawler_purposes',
    path: 'data_sources.crawled_data.purposes',
    section: '2.3',
    label: 'Purposes of the crawler(s):',
    instruction: '',
    requirement: 'conditional',
    condition: 'crawlers were used',
    box: B23,
  },
  {
    id: 'crawler_behaviour',
    path: 'data_sources.crawled_data.crawler_behaviour',
    section: '2.3',
    label: 'General description of crawler behaviour:',
    instruction:
      'For example, this includes respect of captchas, password protected websites and paywalls, respect of robot.txt and other protocols, while crawling.',
    requirement: 'conditional',
    condition: 'crawlers were used',
    box: B23,
  },
  {
    id: 'crawl_period',
    path: 'data_sources.crawled_data.collection_period',
    section: '2.3',
    label: 'Period of data collection:',
    instruction: 'From MM/YYYY to MM/YYYY',
    requirement: 'conditional',
    condition: 'crawlers were used',
    box: B23,
  },
  {
    id: 'crawled_content',
    path: 'data_sources.crawled_data.content_description',
    section: '2.3',
    label: 'Comprehensive description of the type of content and online sources crawled:',
    instruction:
      'Provide a comprehensive description of the type of content crawled, including its geographical, linguistic or demographic characteristics, as well as an indication of the type of websites scraped (e.g. news, blogs, social media, forums, community websites, other user-generated content platforms, websites of cultural heritage institutions, educational sites, government portals, personal blogs, streaming, gaming platforms, online TV platforms, synthetic data libraries, etc).',
    requirement: 'conditional',
    condition: 'crawlers were used',
    box: B23,
  },
  {
    id: 'crawled_modalities',
    path: 'data_sources.crawled_data.modalities',
    section: '2.3',
    label: 'Type of modality covered:',
    instruction: '',
    requirement: 'conditional',
    condition: 'crawlers were used',
    box: B23,
  },
  {
    id: 'top_domains',
    path: 'data_sources.crawled_data.top_domains',
    section: '2.3',
    label: 'Summary of the most relevant domain names crawled:',
    instruction:
      'In so far as any content from internet domains has been crawled or scraped and used for the training of the model, provide a list of those most relevant internet domains names (top and second-level domain, e.g. “example.com”) by listing the top 10 % of all domain names determined by the size of the content scraped (in a representative manner across all modalities where applicable). Small and medium-sized enterprises (SMEs), including start-ups, should disclose top 5% of all domain names or 1 000 internet domain names, whichever is lower. You can provide this list for instance as a downloadable file or provide here information on how to access it.',
    requirement: 'conditional',
    condition: 'content from internet domains was crawled or scraped and used for training',
    box: B23,
  },
  {
    id: 'crawled_additional_comments',
    path: 'data_sources.crawled_data.additional_comments',
    section: '2.3',
    label: 'Additional comments (optional):',
    instruction:
      'Providers may also disclose other relevant information on a voluntary basis, for instance more domain names than those required in the list above and/or URLs and the sources of individual works.',
    requirement: 'optional',
    box: B23,
  },
  // 2.4
  {
    id: 'user_data_model_interactions',
    path: 'data_sources.user_data.from_model_interactions',
    section: '2.4',
    label: 'Was data from user interactions with the AI model (e.g. user input and prompts) used to train the model?',
    instruction: '',
    requirement: 'required',
    box: B24,
  },
  {
    id: 'user_data_other_services',
    path: 'data_sources.user_data.from_other_services',
    section: '2.4',
    label: 'Was data collected from user interactions with the provider’s other services or products used to train the model?',
    instruction: '',
    requirement: 'required',
    box: B24,
  },
  {
    id: 'user_data_services',
    path: 'data_sources.user_data.services_description',
    section: '2.4',
    label: 'If yes, provide a general description of the provider’s services or products that were used to collect the user data:',
    instruction: '',
    requirement: 'conditional',
    condition: 'data from user interactions with the provider’s other services or products was used',
    box: B24,
  },
  {
    id: 'user_data_modalities',
    path: 'data_sources.user_data.modalities',
    section: '2.4',
    label: 'Type of modality covered:',
    instruction: '',
    requirement: 'conditional',
    condition: 'user data was used',
    box: B24,
  },
  {
    id: 'user_data_additional_comments',
    path: 'data_sources.user_data.additional_comments',
    section: '2.4',
    label: 'Additional comments (optional):',
    instruction: OPTIONAL_VOLUNTARY,
    requirement: 'optional',
    box: B24,
  },
  // 2.5
  {
    id: 'synthetic_data_created',
    path: 'data_sources.synthetic_data.created',
    section: '2.5',
    label: 'Was synthetic AI-generated data created by the provider or on their behalf to train the model?',
    instruction: '',
    requirement: 'required',
    box: B25,
  },
  {
    id: 'synthetic_data_modalities',
    path: 'data_sources.synthetic_data.modalities',
    section: '2.5',
    label: 'If yes, modality of the synthetic data:',
    instruction: '',
    requirement: 'conditional',
    condition: 'synthetic data was created',
    box: B25,
  },
  {
    id: 'synthetic_market_models',
    path: 'data_sources.synthetic_data.market_models',
    section: '2.5',
    label: 'If yes, specify the general-purpose AI model(s) used to generate the synthetic data if available on the market:',
    instruction: 'Specify the name of the general-purpose AI model(s) and provide a link to their Summary(ies) where available.',
    requirement: 'conditional',
    condition: 'general-purpose AI models available on the market were used to generate the synthetic data',
    box: B25,
  },
  {
    id: 'synthetic_other_models',
    path: 'data_sources.synthetic_data.other_models_information',
    section: '2.5',
    label:
      'Information about other AI models, including provider’s own AI model(s) not available on the market, used to generate synthetic data to train the model to which this Summary applies:',
    instruction:
      'Provide information about other AI models used to generate synthetic data, including provider’s own models if not available on the market. This includes a general description of the model training data if known and in so far as this may be needed for the exercise of the rights of parties with legitimate interests and to avoid circumvention of the disclosure obligations in the other Sections of the Template.',
    requirement: 'conditional',
    condition: 'other AI models were used to generate the synthetic data',
    box: B25,
  },
  {
    id: 'synthetic_additional_comments',
    path: 'data_sources.synthetic_data.additional_comments',
    section: '2.5',
    label: 'Additional comments (optional):',
    instruction: 'Providers may also disclose on a voluntary basis other relevant information.',
    requirement: 'optional',
    box: B25,
  },
  // 2.6
  {
    id: 'other_sources_used',
    path: 'data_sources.other_sources.used',
    section: '2.6',
    label: 'Have data sources other than those described in Sections 2.1 to 2.5 been used to train the model?',
    instruction: '',
    requirement: 'required',
    box: B26,
  },
  {
    id: 'other_sources_description',
    path: 'data_sources.other_sources.description',
    section: '2.6',
    label: 'If yes, provide a narrative description of these data sources and the data:',
    instruction: '',
    requirement: 'conditional',
    condition: 'other data sources were used',
    box: B26,
  },
  {
    id: 'other_sources_additional_comments',
    path: 'data_sources.other_sources.additional_comments',
    section: '2.6',
    label: 'Additional comments (optional):',
    instruction: OPTIONAL_VOLUNTARY,
    requirement: 'optional',
    box: B26,
  },
  // 3.1
  {
    id: 'code_of_practice_signatory',
    path: 'data_processing.tdm_reservations.code_of_practice_signatory',
    section: '3.1',
    label:
      'Are you a Signatory to the Code of Practice for general-purpose AI models that includes commitments to respect reservations of rights from the TDM exception or limitation?',
    instruction: '',
    requirement: 'required',
    box: B31,
  },
  {
    id: 'tdm_measures',
    path: 'data_processing.tdm_reservations.measures',
    section: '3.1',
    label:
      'Describe the measures implemented before model training to respect reservations of rights from the TDM exception or limitation before and during data collection, including the opt-out protocols and solutions honoured by the provider or, as applicable, by third parties from which datasets have been obtained:',
    instruction: '',
    requirement: 'required',
    box: B31,
  },
  {
    id: 'tdm_additional_comments',
    path: 'data_processing.tdm_reservations.additional_comments',
    section: '3.1',
    label: 'Additional comments (optional):',
    instruction:
      'Providers may also disclose other relevant information on a voluntary basis. Providers are also encouraged to disclose a summary of their copyright policy under Article 53(1)(c) AI Act, if made publicly available (e.g., by providing a link to the relevant web-page).',
    requirement: 'optional',
    box: B31,
  },
  // 3.2
  {
    id: 'illegal_content_measures',
    path: 'data_processing.illegal_content.measures',
    section: '3.2',
    label: 'General description of measures taken:',
    instruction: '',
    requirement: 'required',
    box: B33,
  },
  // 3.3
  {
    id: 'other_information',
    path: 'data_processing.other_information',
    section: '3.3',
    label: 'Other relevant information about data processing (optional):',
    instruction:
      'Providers are also encouraged to disclose on a voluntary basis other relevant information about relevant data processing aspects and measures taken before or after the training of the model that is relevant for the respect and exercise of rights  protected under Union law.',
    requirement: 'optional',
    box: B33,
  },
];

/** Looks up a field by id. Throws for an unknown id (a programming error). */
export function field(id: string): FieldSpec {
  const f = FIELDS.find((x) => x.id === id);
  if (f === undefined) throw new Error(`Unknown template field: ${id}`);
  return f;
}

/** Looks up a section by number. Throws for an unknown number (a programming error). */
export function section(num: string): SectionSpec {
  const s = SECTIONS.find((x) => x.number === num);
  if (s === undefined) throw new Error(`Unknown template section: ${num}`);
  return s;
}

/** Key dates, each taken from an official source (see docs/legal-basis.md). */
export const KEY_DATES = {
  /** Art. 113, third paragraph, point (b): Chapter V applies from 2 August 2025. */
  obligationsApply: '2025-08-02',
  /** Art. 113 (Art. 101 is excepted from point (b), so it applies from the general date); Explanatory Notice point 33. */
  enforcementFrom: '2026-08-02',
  /** Art. 111(3): models placed on the market before 2 August 2025 comply by 2 August 2027. */
  legacyDeadline: '2027-08-02',
} as const;
