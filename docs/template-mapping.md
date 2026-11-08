# Template mapping

Every field of the template (Annex to Communication C(2025) 8311 final), the
key that holds it in a summary file, and how Sourcebook checks it. Labels are
verbatim from the template. "Field id" is the name to use in
`information_gaps`.

Requirement: "Required" fields are errors when empty; "If applicable" fields
are required when the condition holds (for example after a Yes); "Where
applicable" fields give a warning when empty; "Optional" fields are never
required.

Fields that are not in the template but are needed to apply it:

- `sourcebook: 1`: the file format version.
- `authorised_representative.applicable` and `not_applicable_reason`: the
  template says the field is "Only applicable if the provider is established
  outside the Union (see Article 54 AI Act)"; Article 54(6) exempts some
  open-source models.
- `model_dependencies.is_modification`: whether the "If the model is the
  result of a modification" condition holds.
- `information_gaps`: gap statements under point 33 of the Explanatory
  Notice, printed in the "Additional comments" box of the field's section
  (Notice footnote 24).

| Section | Label (verbatim) | Field id | Key in the summary file | Requirement |
|---|---|---|---|---|
| Header | Version of the Summary: | `summary_version` | `summary_version` | Required |
| Header | Last update: | `last_update` | `last_update` | Required |
| 1.1 | Provider name and contact details: | `provider` | `general_information.provider.name_and_contact_details` | Required |
| 1.1 | Authorised representative name and contact details: | `authorised_representative` | `general_information.provider.authorised_representative` | If applicable (the provider is established outside the Union and Article 54(6) AI Act does not apply) |
| 1.2 | Versioned model name(s): | `versioned_model_names` | `general_information.model.versioned_model_names` | Required |
| 1.2 | Model dependencies: | `model_dependencies` | `general_information.model.model_dependencies` | If applicable (the model is the result of a modification, including fine-tuning, of a general-purpose AI model already placed on the Union market) |
| 1.2 | Date of placement of the model on the Union market: | `placement_dates` | `general_information.model.placement_dates` | Required |
| 1.3 | Modality | `modalities` | `general_information.modalities` | Required |
| 1.3 | Latest date of data acquisition/collection for model training: | `latest_data_collection` | `general_information.latest_data_collection` | Required |
| 1.3 | Description of the linguistic characteristics of the overall training data: | `linguistic_characteristics` | `general_information.linguistic_characteristics` | Where applicable |
| 1.3 | Other relevant characteristics of the overall training data: | `other_characteristics` | `general_information.other_characteristics` | Where applicable |
| 1.3 | Additional comments (optional): | `general_additional_comments` | `general_information.additional_comments` | Optional |
| 2.1 | Have you used publicly available datasets to train the model? | `public_datasets_used` | `data_sources.public_datasets.used` | Required |
| 2.1 | If yes, specify the modality(ies) of the content covered by the datasets concerned: | `public_datasets_modalities` | `data_sources.public_datasets.modalities` | If applicable (publicly available datasets were used) |
| 2.1 | List of large publicly available datasets: | `large_public_datasets` | `data_sources.public_datasets.large_datasets` | If applicable (large publicly available datasets were used) |
| 2.1 | General description of other publicly available datasets not listed above: | `other_public_datasets` | `data_sources.public_datasets.other_datasets_description` | If applicable (publicly available datasets other than the large ones listed were used) |
| 2.1 | Additional comments (optional): | `public_datasets_additional_comments` | `data_sources.public_datasets.additional_comments` | Optional |
| 2.2.1 | Have you concluded transactional commercial licensing agreement(s) with rightsholder(s) or with their representatives? | `licensed_datasets_concluded` | `data_sources.licensed_datasets.concluded` | Required |
| 2.2.1 | If yes, specify the modality(ies) of the content covered by the datasets concerned: | `licensed_datasets_modalities` | `data_sources.licensed_datasets.modalities` | If applicable (licensing agreements were concluded) |
| 2.2.2 | Have you obtained private datasets from third parties that are not licensed as described in Section 2.2.1, such as data obtained from providers of private databases, or data intermediaries? | `other_private_datasets_obtained` | `data_sources.other_private_datasets.obtained` | Required |
| 2.2.2 | If yes, specify the modality(ies) of the content covered by the datasets concerned: | `other_private_datasets_modalities` | `data_sources.other_private_datasets.modalities` | If applicable (such private datasets were obtained) |
| 2.2.2 | If publicly known, list private datasets obtained from other third parties: | `publicly_known_private_datasets` | `data_sources.other_private_datasets.publicly_known_datasets` | If applicable (such private datasets are publicly known) |
| 2.2.2 | General description of non-publicly known private datasets obtained from third parties | `non_publicly_known_private_datasets` | `data_sources.other_private_datasets.non_publicly_known_description` | If applicable (private datasets that are not publicly known were obtained) |
| 2.2.2 | Additional comments (optional): | `other_private_datasets_additional_comments` | `data_sources.other_private_datasets.additional_comments` | Optional |
| 2.3 | Were crawlers used by the provider or on behalf of? | `crawlers_used` | `data_sources.crawled_data.crawlers_used` | Required |
| 2.3 | If yes, specify crawler name(s)/identifier(s): | `crawler_names` | `data_sources.crawled_data.crawler_names` | If applicable (crawlers were used) |
| 2.3 | Purposes of the crawler(s): | `crawler_purposes` | `data_sources.crawled_data.purposes` | If applicable (crawlers were used) |
| 2.3 | General description of crawler behaviour: | `crawler_behaviour` | `data_sources.crawled_data.crawler_behaviour` | If applicable (crawlers were used) |
| 2.3 | Period of data collection: | `crawl_period` | `data_sources.crawled_data.collection_period` | If applicable (crawlers were used) |
| 2.3 | Comprehensive description of the type of content and online sources crawled: | `crawled_content` | `data_sources.crawled_data.content_description` | If applicable (crawlers were used) |
| 2.3 | Type of modality covered: | `crawled_modalities` | `data_sources.crawled_data.modalities` | If applicable (crawlers were used) |
| 2.3 | Summary of the most relevant domain names crawled: | `top_domains` | `data_sources.crawled_data.top_domains` | If applicable (content from internet domains was crawled or scraped and used for training) |
| 2.3 | Additional comments (optional): | `crawled_additional_comments` | `data_sources.crawled_data.additional_comments` | Optional |
| 2.4 | Was data from user interactions with the AI model (e.g. user input and prompts) used to train the model? | `user_data_model_interactions` | `data_sources.user_data.from_model_interactions` | Required |
| 2.4 | Was data collected from user interactions with the provider’s other services or products used to train the model? | `user_data_other_services` | `data_sources.user_data.from_other_services` | Required |
| 2.4 | If yes, provide a general description of the provider’s services or products that were used to collect the user data: | `user_data_services` | `data_sources.user_data.services_description` | If applicable (data from user interactions with the provider’s other services or products was used) |
| 2.4 | Type of modality covered: | `user_data_modalities` | `data_sources.user_data.modalities` | If applicable (user data was used) |
| 2.4 | Additional comments (optional): | `user_data_additional_comments` | `data_sources.user_data.additional_comments` | Optional |
| 2.5 | Was synthetic AI-generated data created by the provider or on their behalf to train the model? | `synthetic_data_created` | `data_sources.synthetic_data.created` | Required |
| 2.5 | If yes, modality of the synthetic data: | `synthetic_data_modalities` | `data_sources.synthetic_data.modalities` | If applicable (synthetic data was created) |
| 2.5 | If yes, specify the general-purpose AI model(s) used to generate the synthetic data if available on the market: | `synthetic_market_models` | `data_sources.synthetic_data.market_models` | If applicable (general-purpose AI models available on the market were used to generate the synthetic data) |
| 2.5 | Information about other AI models, including provider’s own AI model(s) not available on the market, used to generate synthetic data to train the model to which this Summary applies: | `synthetic_other_models` | `data_sources.synthetic_data.other_models_information` | If applicable (other AI models were used to generate the synthetic data) |
| 2.5 | Additional comments (optional): | `synthetic_additional_comments` | `data_sources.synthetic_data.additional_comments` | Optional |
| 2.6 | Have data sources other than those described in Sections 2.1 to 2.5 been used to train the model? | `other_sources_used` | `data_sources.other_sources.used` | Required |
| 2.6 | If yes, provide a narrative description of these data sources and the data: | `other_sources_description` | `data_sources.other_sources.description` | If applicable (other data sources were used) |
| 2.6 | Additional comments (optional): | `other_sources_additional_comments` | `data_sources.other_sources.additional_comments` | Optional |
| 3.1 | Are you a Signatory to the Code of Practice for general-purpose AI models that includes commitments to respect reservations of rights from the TDM exception or limitation? | `code_of_practice_signatory` | `data_processing.tdm_reservations.code_of_practice_signatory` | Required |
| 3.1 | Describe the measures implemented before model training to respect reservations of rights from the TDM exception or limitation before and during data collection, including the opt-out protocols and solutions honoured by the provider or, as applicable, by third parties from which datasets have been obtained: | `tdm_measures` | `data_processing.tdm_reservations.measures` | Required |
| 3.1 | Additional comments (optional): | `tdm_additional_comments` | `data_processing.tdm_reservations.additional_comments` | Optional |
| 3.2 | General description of measures taken: | `illegal_content_measures` | `data_processing.illegal_content.measures` | Required |
| 3.3 | Other relevant information about data processing (optional): | `other_information` | `data_processing.other_information` | Optional |

## Section 1.3 table

| Modality | Keys | Size choices (`size_range`) |
|---|---|---|
| Text | `general_information.modalities.text`: `present`, `size_range`, `size_other_unit`, `types_of_content` | `below_1b_tokens` (Less than 1 billion tokens), `1b_to_10t_tokens` (1billion to 10 trillions tokens), `above_10t_tokens` (More than 10 trillions tokens) |
| Image | `general_information.modalities.image`: `present`, `size_range`, `types_of_content` | `below_1m_images` (Less than 1 million images), `1m_to_1b_images` (1Million to1 billion images), `above_1b_images` (More than 1 billion images) |
| Audio | `general_information.modalities.audio`: `present`, `size_range`, `types_of_content` | `below_10k_hours` (Less than 10 000 hours), `10k_to_1m_hours` (10 000 to1 million hours), `above_1m_hours` (More than 1 million hours) |
| Video | `general_information.modalities.video`: `present`, `size_range`, `types_of_content` | `below_10k_hours` (Less than 10 000 hours), `10k_to_1m_hours` (10 000 to1 million hours), `above_1m_hours` (More than 1 million hours) |
| Other | `general_information.modalities.other[]`: `modality`, `approximate_size`, `types_of_content` | free text with the unit |

## Modality checkboxes in Sections 2.1 to 2.5

`modalities: { selected: [text, image, video, audio], other: "free text" }`
stands for "☐ Text ☐ Image ☐ Video ☐ Audio ☐ Other (please specify)".

## Differences between the Word form and the Annex

Sourcebook copies labels and instructions from the Word form. The Annex PDF
has the same words with a few typing differences (for example "totrain",
"orovider’s", "inetersts", "applciablem" in the PDF; "1billion to 10
trillions tokens" in the Word form). For the last update, the Annex gives
"DD/MM/YY"; the Word form has a date picker. Section numbers are printed in
the Annex style ("1.3.").
## How conditional fields are read

Where the template's wording leaves the condition open, Sourcebook reads it
as follows (each is checked by `validate`):

- **1.1 Authorised representative**: required when `applicable: true`; when
  `false`, the reason (`established_in_union` or `open_source_exemption`
  under Article 54(6)) is required.
- **1.2 Model dependencies**: model names required when
  `is_modification: true`; links to their summaries "where available".
- **1.2 Date of placement**: one date for every versioned model name.
- **1.3**: for each modality present, a size range (for text, alternatively
  a size in another unit) and the types of content; at least one modality.
- **2.1**: after Yes, the modalities, and at least the list of large
  datasets or the description of the other datasets. Each large dataset
  needs a name and a link, or a description with collection dates (or
  "not known").
- **2.2.2**: after Yes, the modalities, and at least the list of publicly
  known datasets or the description of the others.
- **2.3**: after Yes, every field of the section, and the domain list or
  information on how to access it.
- **2.4**: the description of services or products after Yes to the second
  question ("other services or products"); the modalities after Yes to
  either question.
- **2.5**: after Yes, the modalities, and at least one model named (on the
  market) or described (other models).
- **2.6**: the description after Yes.
- Answers given under a No are reported as warnings ("inconsistent").
