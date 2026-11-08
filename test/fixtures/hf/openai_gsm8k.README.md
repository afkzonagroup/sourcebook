---
annotations_creators:
- crowdsourced
language_creators:
- crowdsourced
language:
- en
license:
- mit
multilinguality:
- monolingual
size_categories:
- 1K<n<10K
source_datasets:
- original
task_categories:
- text-generation
task_ids: []
paperswithcode_id: gsm8k
pretty_name: Grade School Math 8K
tags:
- math-word-problems
dataset_info:
- config_name: main
  features:
  - name: question
    dtype: string
  - name: answer
    dtype: string
  splits:
  - name: train
    num_bytes: 3963202
    num_examples: 7473
  - name: test
    num_bytes: 713732
    num_examples: 1319
  download_size: 2725633
  dataset_size: 4676934
- config_name: socratic
  features:
  - name: question
    dtype: string
  - name: answer
    dtype: string
  splits:
  - name: train
    num_bytes: 5198108
    num_examples: 7473
  - name: test
    num_bytes: 936859
    num_examples: 1319
  download_size: 3164254
  dataset_size: 6134967
configs:
- config_name: main
  data_files:
  - split: train
    path: main/train-*
  - split: test
    path: main/test-*
- config_name: socratic
  data_files:
  - split: train
    path: socratic/train-*
  - split: test
    path: socratic/test-*
---

# Dataset Card for GSM8K

## Table of Contents
- [Dataset Description](#dataset-description)
  - [Dataset Summary](#dataset-summary)
  - [Supported Tasks](#supported-tasks-and-leaderboards)
  - [Languages](#languages)
- [Dataset Structure](#dataset-structure)
  - [Data Instances](#data-instances)
  - [Data Fields](#data-instances)
  - [Data Splits](#data-instances)
- [Dataset Creation](#dataset-creation)
  - [Curation Rationale](#curation-rationale)
  - [Source Data](#source-data)
  - [Annotations](#annotations)
  - [Personal and Sensitive Information](#personal-and-sensitive-information)
- [Considerations for Using the Data](#considerations-for-using-the-data)
  - [Social Impact of Dataset](#social-impact-of-dataset)
  - [Discussion of Biases](#discussion-of-biases)
  - [Other Known Limitations](#other-known-limitations)
- [Additional Information](#additional-information)
  - [Dataset Curators](#dataset-curators)
  - [Licensing Information](#licensing-information)
  - [Citation Information](#citation-information)

## Dataset Description

- **Homepage:** https://openai.com/blog/grade-school-math/
- **Repository:** https://github.com/openai/grade-school-math
- **Paper:** https://arxiv.org/abs/2110.14168
- **Leaderboard:** [Needs More Information]
- **Point of Contact:** [Needs More Information]

### Dataset Summary

GSM8K (Grade School Math 8K) is a dataset of 8.5K high quality linguistically diverse grade school math word problems. The dataset was created to support the task of question answering on basic mathematical problems that require multi-step reasoning.
- These problems take between 2 and 8 steps to solve.
- Solutions primarily involve performing a sequence of elementary calculations using basic arithmetic operations (+ − ×÷) to reach the final answer.
- A bright middle school student should be able to solve every problem: from the paper, "Problems require no concepts beyond the level of early Algebra, and the vast majority of problems can be solved without explicitly defining a variable."
