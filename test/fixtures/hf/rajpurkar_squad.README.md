---
annotations_creators:
- crowdsourced
language_creators:
- crowdsourced
- found
language:
- en
license: cc-by-sa-4.0
multilinguality:
- monolingual
size_categories:
- 10K<n<100K
source_datasets:
- extended|wikipedia
task_categories:
- question-answering
task_ids:
- extractive-qa
paperswithcode_id: squad
pretty_name: SQuAD
dataset_info:
  config_name: plain_text
  features:
  - name: id
    dtype: string
  - name: title
    dtype: string
  - name: context
    dtype: string
  - name: question
    dtype: string
  - name: answers
    sequence:
    - name: text
      dtype: string
    - name: answer_start
      dtype: int32
  splits:
  - name: train
    num_bytes: 79346108
    num_examples: 87599
  - name: validation
    num_bytes: 10472984
    num_examples: 10570
  download_size: 16278203
  dataset_size: 89819092
configs:
- config_name: plain_text
  data_files:
  - split: train
    path: plain_text/train-*
  - split: validation
    path: plain_text/validation-*
  default: true
train-eval-index:
- config: plain_text
  task: question-answering
  task_id: extractive_question_answering
  splits:
    train_split: train
    eval_split: validation
  col_mapping:
    question: question
    context: context
    answers:
      text: text
      answer_start: answer_start
  metrics:
  - type: squad
    name: SQuAD
---

# Dataset Card for SQuAD

## Table of Contents
- [Dataset Card for "squad"](#dataset-card-for-squad)
  - [Table of Contents](#table-of-contents)
  - [Dataset Description](#dataset-description)
    - [Dataset Summary](#dataset-summary)
    - [Supported Tasks and Leaderboards](#supported-tasks-and-leaderboards)
    - [Languages](#languages)
  - [Dataset Structure](#dataset-structure)
    - [Data Instances](#data-instances)
      - [plain_text](#plain_text)
    - [Data Fields](#data-fields)
      - [plain_text](#plain_text-1)
    - [Data Splits](#data-splits)
  - [Dataset Creation](#dataset-creation)
    - [Curation Rationale](#curation-rationale)
    - [Source Data](#source-data)
      - [Initial Data Collection and Normalization](#initial-data-collection-and-normalization)
      - [Who are the source language producers?](#who-are-the-source-language-producers)
    - [Annotations](#annotations)
      - [Annotation process](#annotation-process)
      - [Who are the annotators?](#who-are-the-annotators)
    - [Personal and Sensitive Information](#personal-and-sensitive-information)
  - [Considerations for Using the Data](#considerations-for-using-the-data)
    - [Social Impact of Dataset](#social-impact-of-dataset)
    - [Discussion of Biases](#discussion-of-biases)
    - [Other Known Limitations](#other-known-limitations)
  - [Additional Information](#additional-information)
    - [Dataset Curators](#dataset-curators)
    - [Licensing Information](#licensing-information)
    - [Citation Information](#citation-information)
    - [Contributions](#contributions)

## Dataset Description

- **Homepage:** https://rajpurkar.github.io/SQuAD-explorer/
- **Repository:** [More Information Needed](https://github.com/huggingface/datasets/blob/master/CONTRIBUTING.md#how-to-contribute-to-the-dataset-cards)
- **Paper:** https://arxiv.org/abs/1606.05250
