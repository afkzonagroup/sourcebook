---
license: odc-by
viewer: false
task_categories:
- text-generation
language:
- en
tags:
- language-modeling
- casual-lm
- llm
pretty_name: Dolma
size_categories:
- n>1T
---

# Dolma

<img alt="Dolma's official logo. It's dolma written in yellow, round lowercase letters over a blue background." src="https://raw.githubusercontent.com/allenai/dolma/main/docs/assets/AI2_Blog_1400x685_2x.webp" width="100%">

Dolma is a dataset of 3 trillion tokens from a diverse mix of web content, academic publications, code, books, and encyclopedic materials.

More information:

- Read Dolma **manuscript** and its **Data Sheet** [on ArXiv](https://arxiv.org/abs/2402.00159);
- Explore the [**open source tools**](https://github.com/allenai/dolma) we created to curate Dolma.
- Want to request removal of personal data? Use [this form](https://forms.gle/q4BNUUxUxKwKkfdT6) to notify us of documents containing PII about a specific user.

To learn more about the toolkit used to create Dolma, including how to replicate this dataset, head over our [GitHub project page](https://github.com/allenai/dolma/tree/main/docs)!

**2024-04-17: Dolma v1.7 Release.** We have released an updated version of Dolma that we used to train our latest [OLMo 7B-v1.7](https://huggingface.co/allenai/OLMo-7b-v1.7) model.

**2024-04-15: License Change.** We have updated the license of Dolma to [ODC-BY](https://opendatacommons.org/licenses/by/1-0/). Please see this [blog post](https://blog.allenai.org/making-a-switch-dolma-moves-to-odc-by-8f0e73852f44) for more information.


## Versions

At the moment, there are six versions of Dolma available:

| **Version** | **Default?** | **Release Date** | **Size** (gzip) | **Description** |
|--|:--:|--|--|--|
| `v1_7` | ✅ | 2024-04-15 | 4.5 TB | Used to train [OLMo-7B-v1.7](https://huggingface.co/allenai/OLMo-7b-v1.7). New sources, more quality filtering, fuzzy deduplication. |
| `v1_6` |  | 2024-01-31 | 5.4 TB | An update to v1.5 with some deduplication of documents with too few tokens or too many repeated n-grams. |
| `v1_6-sample` | | 2024-01-31 | 16.4 GB | A smaller sample of Dolma, with roughly 10 billion tokens. Useful for data exploration. |
| `v1_5` | | 2023-10-31 | 6.4 TB | Used to train [OLMo-1B](https://huggingface.co/allenai/OLMo-1B). Roughly 3 trillion tokens. |
| `v1_5-sample` | | 2023-10-31 | 2.9 TB | A sample of roughly 1.9 trillion tokens used to train [OLMo-7B](https://huggingface.co/allenai/OLMo-7B) |
| `v1` | | 2023-08-18 | 6.0 TB | The first version of Dolma. |


## Summary Statistics (v1.7)

| **Source** | **Provenance** | **New?** | **Documents** (millions) |  **OLMo tokens** (billions) | **Sample Proportion** | **Cutoff Date** | **Processing**
|--|--|--|--|--|--|--|--|
| Dolma's CC | [Common Crawl](https://commoncrawl.org/) via Dolma v1.6 | Updated | 875.2 | 1,195.5 | 50% | Mar 2023 | Extracted using the Dolma pipeline; new quality filtering and deduplication steps. |
| Refined Web | [Refined Web](https://huggingface.co/datasets/tiiuae/falcon-refinedweb) | Yes | 664.0 | 456.4  | 100% | Feb 2023 | Filtered using the Dolma pipeline; new quality filtering and deduplication steps.  |
