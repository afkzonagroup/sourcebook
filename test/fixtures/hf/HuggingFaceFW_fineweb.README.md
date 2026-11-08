---
license: odc-by
task_categories:
  - text-generation
language:
  - en
pretty_name: FineWeb
size_categories:
  - n>1T
configs:
  - config_name: default
    data_files:
      - split: train
        path: data/*/*
  - config_name: sample-10BT
    data_files:
      - split: train
        path: sample/10BT/*
  - config_name: sample-100BT
    data_files:
      - split: train
        path: sample/100BT/*
  - config_name: sample-350BT
    data_files:
      - split: train
        path: sample/350BT/*
  - config_name: CC-MAIN-2025-05
    data_files:
      - split: train
        path: data/CC-MAIN-2025-05/*
  - config_name: CC-MAIN-2025-08
    data_files:
      - split: train
        path: data/CC-MAIN-2025-08/*
  - config_name: CC-MAIN-2025-13
    data_files:
      - split: train
        path: data/CC-MAIN-2025-13/*
  - config_name: CC-MAIN-2025-18
    data_files:
      - split: train
        path: data/CC-MAIN-2025-18/*
  - config_name: CC-MAIN-2025-21
    data_files:
      - split: train
        path: data/CC-MAIN-2025-21/*
  - config_name: CC-MAIN-2025-26
    data_files:
      - split: train
        path: data/CC-MAIN-2025-26/*
  - config_name: CC-MAIN-2024-51
    data_files:
      - split: train
        path: data/CC-MAIN-2024-51/*
  - config_name: CC-MAIN-2024-46
    data_files:
      - split: train
        path: data/CC-MAIN-2024-46/*
  - config_name: CC-MAIN-2024-42
    data_files:
      - split: train
        path: data/CC-MAIN-2024-42/*
  - config_name: CC-MAIN-2024-38
    data_files:
      - split: train
        path: data/CC-MAIN-2024-38/*
  - config_name: CC-MAIN-2024-33
    data_files:
      - split: train
        path: data/CC-MAIN-2024-33/*
  - config_name: CC-MAIN-2024-30
    data_files:
      - split: train
        path: data/CC-MAIN-2024-30/*
  - config_name: CC-MAIN-2024-26
    data_files:
      - split: train
        path: data/CC-MAIN-2024-26/*
  - config_name: CC-MAIN-2024-22
    data_files:
      - split: train
        path: data/CC-MAIN-2024-22/*
  - config_name: CC-MAIN-2024-18
    data_files:
      - split: train
        path: data/CC-MAIN-2024-18/*
  - config_name: CC-MAIN-2024-10
    data_files:
      - split: train
        path: data/CC-MAIN-2024-10/*
  - config_name: CC-MAIN-2023-50
    data_files:
      - split: train
        path: data/CC-MAIN-2023-50/*
  - config_name: CC-MAIN-2023-40
    data_files:
      - split: train
        path: data/CC-MAIN-2023-40/*
  - config_name: CC-MAIN-2023-23
    data_files:
      - split: train
        path: data/CC-MAIN-2023-23/*
  - config_name: CC-MAIN-2023-14
    data_files:
      - split: train
        path: data/CC-MAIN-2023-14/*
  - config_name: CC-MAIN-2023-06
    data_files:
      - split: train
        path: data/CC-MAIN-2023-06/*
  - config_name: CC-MAIN-2022-49
    data_files:
      - split: train
        path: data/CC-MAIN-2022-49/*
  - config_name: CC-MAIN-2022-40
    data_files:
      - split: train
        path: data/CC-MAIN-2022-40/*
  - config_name: CC-MAIN-2022-33
    data_files:
      - split: train
        path: data/CC-MAIN-2022-33/*
  - config_name: CC-MAIN-2022-27
    data_files:
      - split: train
        path: data/CC-MAIN-2022-27/*
  - config_name: CC-MAIN-2022-21
    data_files:
      - split: train
        path: data/CC-MAIN-2022-21/*
  - config_name: CC-MAIN-2022-05
    data_files:
      - split: train
        path: data/CC-MAIN-2022-05/*
  - config_name: CC-MAIN-2021-49
    data_files:
      - split: train
        path: data/CC-MAIN-2021-49/*
  - config_name: CC-MAIN-2021-43
    data_files:
      - split: train
        path: data/CC-MAIN-2021-43/*
  - config_name: CC-MAIN-2021-39
    data_files:
      - split: train
        path: data/CC-MAIN-2021-39/*
  - config_name: CC-MAIN-2021-31
    data_files:
      - split: train
        path: data/CC-MAIN-2021-31/*
  - config_name: CC-MAIN-2021-25
    data_files:
      - split: train
        path: data/CC-MAIN-2021-25/*
  - config_name: CC-MAIN-2021-21
    data_files:
      - split: train
        path: data/CC-MAIN-2021-21/*
  - config_name: CC-MAIN-2021-17
    data_files:
      - split: train
        path: data/CC-MAIN-2021-17/*
  - config_name: CC-MAIN-2021-10
    data_files:
      - split: train
        path: data/CC-MAIN-2021-10/*
  - config_name: CC-MAIN-2021-04
    data_files:
      - split: train
        path: data/CC-MAIN-2021-04/*
  - config_name: CC-MAIN-2020-50
    data_files:
      - split: train
        path: data/CC-MAIN-2020-50/*
  - config_name: CC-MAIN-2020-45
    data_files:
      - split: train
        path: data/CC-MAIN-2020-45/*
  - config_name: CC-MAIN-2020-40
    data_files:
      - split: train
        path: data/CC-MAIN-2020-40/*
  - config_name: CC-MAIN-2020-34
    data_files:
      - split: train
        path: data/CC-MAIN-2020-34/*
  - config_name: CC-MAIN-2020-29
    data_files:
      - split: train
        path: data/CC-MAIN-2020-29/*
  - config_name: CC-MAIN-2020-24
    data_files:
      - split: train
        path: data/CC-MAIN-2020-24/*
  - config_name: CC-MAIN-2020-16
    data_files:
      - split: train
        path: data/CC-MAIN-2020-16/*
  - config_name: CC-MAIN-2020-10
    data_files:
      - split: train
        path: data/CC-MAIN-2020-10/*
  - config_name: CC-MAIN-2020-05
    data_files:
      - split: train
        path: data/CC-MAIN-2020-05/*
  - config_name: CC-MAIN-2019-51
    data_files:
      - split: train
        path: data/CC-MAIN-2019-51/*
  - config_name: CC-MAIN-2019-47
    data_files:
      - split: train
        path: data/CC-MAIN-2019-47/*
  - config_name: CC-MAIN-2019-43
    data_files:
      - split: train
        path: data/CC-MAIN-2019-43/*
  - config_name: CC-MAIN-2019-39
    data_files:
      - split: train
        path: data/CC-MAIN-2019-39/*
  - config_name: CC-MAIN-2019-35
    data_files:
      - split: train
        path: data/CC-MAIN-2019-35/*
  - config_name: CC-MAIN-2019-30
    data_files:
      - split: train
        path: data/CC-MAIN-2019-30/*
  - config_name: CC-MAIN-2019-26
    data_files:
      - split: train
        path: data/CC-MAIN-2019-26/*
  - config_name: CC-MAIN-2019-22
    data_files:
      - split: train
        path: data/CC-MAIN-2019-22/*
  - config_name: CC-MAIN-2019-18
    data_files:
      - split: train
        path: data/CC-MAIN-2019-18/*
  - config_name: CC-MAIN-2019-13
    data_files:
      - split: train
        path: data/CC-MAIN-2019-13/*
  - config_name: CC-MAIN-2019-09
    data_files:
      - split: train
        path: data/CC-MAIN-2019-09/*
  - config_name: CC-MAIN-2019-04
    data_files:
      - split: train
        path: data/CC-MAIN-2019-04/*
  - config_name: CC-MAIN-2018-51
    data_files:
      - split: train
        path: data/CC-MAIN-2018-51/*
  - config_name: CC-MAIN-2018-47
    data_files:
      - split: train
        path: data/CC-MAIN-2018-47/*
  - config_name: CC-MAIN-2018-43
    data_files:
      - split: train
        path: data/CC-MAIN-2018-43/*
  - config_name: CC-MAIN-2018-39
    data_files:
      - split: train
        path: data/CC-MAIN-2018-39/*
  - config_name: CC-MAIN-2018-34
    data_files:
      - split: train
        path: data/CC-MAIN-2018-34/*
  - config_name: CC-MAIN-2018-30
    data_files:
      - split: train
        path: data/CC-MAIN-2018-30/*
  - config_name: CC-MAIN-2018-26
    data_files:
      - split: train
        path: data/CC-MAIN-2018-26/*
  - config_name: CC-MAIN-2018-22
    data_files:
      - split: train
        path: data/CC-MAIN-2018-22/*
  - config_name: CC-MAIN-2018-17
    data_files:
      - split: train
        path: data/CC-MAIN-2018-17/*
  - config_name: CC-MAIN-2018-13
    data_files:
      - split: train
        path: data/CC-MAIN-2018-13/*
  - config_name: CC-MAIN-2018-09
    data_files:
      - split: train
        path: data/CC-MAIN-2018-09/*
  - config_name: CC-MAIN-2018-05
    data_files:
      - split: train
        path: data/CC-MAIN-2018-05/*
  - config_name: CC-MAIN-2017-51
    data_files:
      - split: train
        path: data/CC-MAIN-2017-51/*
  - config_name: CC-MAIN-2017-47
    data_files:
      - split: train
        path: data/CC-MAIN-2017-47/*
  - config_name: CC-MAIN-2017-43
    data_files:
      - split: train
        path: data/CC-MAIN-2017-43/*
  - config_name: CC-MAIN-2017-39
    data_files:
      - split: train
        path: data/CC-MAIN-2017-39/*
  - config_name: CC-MAIN-2017-34
    data_files:
      - split: train
        path: data/CC-MAIN-2017-34/*
  - config_name: CC-MAIN-2017-30
    data_files:
      - split: train
        path: data/CC-MAIN-2017-30/*
  - config_name: CC-MAIN-2017-26
    data_files:
      - split: train
        path: data/CC-MAIN-2017-26/*
  - config_name: CC-MAIN-2017-22
    data_files:
      - split: train
        path: data/CC-MAIN-2017-22/*
  - config_name: CC-MAIN-2017-17
    data_files:
      - split: train
        path: data/CC-MAIN-2017-17/*
  - config_name: CC-MAIN-2017-13
    data_files:
      - split: train
        path: data/CC-MAIN-2017-13/*
  - config_name: CC-MAIN-2017-09
    data_files:
      - split: train
        path: data/CC-MAIN-2017-09/*
  - config_name: CC-MAIN-2017-04
    data_files:
      - split: train
        path: data/CC-MAIN-2017-04/*
  - config_name: CC-MAIN-2016-50
    data_files:
      - split: train
        path: data/CC-MAIN-2016-50/*
  - config_name: CC-MAIN-2016-44
    data_files:
      - split: train
        path: data/CC-MAIN-2016-44/*
  - config_name: CC-MAIN-2016-40
    data_files:
      - split: train
        path: data/CC-MAIN-2016-40/*
  - config_name: CC-MAIN-2016-36
    data_files:
      - split: train
        path: data/CC-MAIN-2016-36/*
  - config_name: CC-MAIN-2016-30
    data_files:
      - split: train
        path: data/CC-MAIN-2016-30/*
  - config_name: CC-MAIN-2016-26
    data_files:
      - split: train
        path: data/CC-MAIN-2016-26/*
  - config_name: CC-MAIN-2016-22
    data_files:
      - split: train
        path: data/CC-MAIN-2016-22/*
  - config_name: CC-MAIN-2016-18
    data_files:
      - split: train
        path: data/CC-MAIN-2016-18/*
  - config_name: CC-MAIN-2016-07
    data_files:
      - split: train
        path: data/CC-MAIN-2016-07/*
  - config_name: CC-MAIN-2015-48
    data_files:
      - split: train
        path: data/CC-MAIN-2015-48/*
  - config_name: CC-MAIN-2015-40
    data_files:
      - split: train
        path: data/CC-MAIN-2015-40/*
  - config_name: CC-MAIN-2015-35
    data_files:
      - split: train
        path: data/CC-MAIN-2015-35/*
  - config_name: CC-MAIN-2015-32
    data_files:
      - split: train
        path: data/CC-MAIN-2015-32/*
  - config_name: CC-MAIN-2015-27
    data_files:
      - split: train
        path: data/CC-MAIN-2015-27/*
  - config_name: CC-MAIN-2015-22
    data_files:
      - split: train
        path: data/CC-MAIN-2015-22/*
  - config_name: CC-MAIN-2015-18
    data_files:
      - split: train
        path: data/CC-MAIN-2015-18/*
  - config_name: CC-MAIN-2015-14
    data_files:
      - split: train
        path: data/CC-MAIN-2015-14/*
  - config_name: CC-MAIN-2015-11
    data_files:
      - split: train
        path: data/CC-MAIN-2015-11/*
  - config_name: CC-MAIN-2015-06
    data_files:
      - split: train
        path: data/CC-MAIN-2015-06/*
  - config_name: CC-MAIN-2014-52
    data_files:
      - split: train
        path: data/CC-MAIN-2014-52/*
  - config_name: CC-MAIN-2014-49
    data_files:
      - split: train
        path: data/CC-MAIN-2014-49/*
  - config_name: CC-MAIN-2014-42
    data_files:
      - split: train
        path: data/CC-MAIN-2014-42/*
  - config_name: CC-MAIN-2014-41
    data_files:
      - split: train
        path: data/CC-MAIN-2014-41/*
  - config_name: CC-MAIN-2014-35
    data_files:
      - split: train
        path: data/CC-MAIN-2014-35/*
  - config_name: CC-MAIN-2014-23
    data_files:
      - split: train
        path: data/CC-MAIN-2014-23/*
  - config_name: CC-MAIN-2014-15
    data_files:
      - split: train
        path: data/CC-MAIN-2014-15/*
  - config_name: CC-MAIN-2014-10
    data_files:
      - split: train
        path: data/CC-MAIN-2014-10/*
  - config_name: CC-MAIN-2013-48
    data_files:
      - split: train
        path: data/CC-MAIN-2013-48/*
  - config_name: CC-MAIN-2013-20
    data_files:
      - split: train
        path: data/CC-MAIN-2013-20/*
---
# 🍷 FineWeb
<center>
    <img src="https://huggingface.co/datasets/HuggingFaceFW/admin/resolve/main/fineweb-logo.png" alt="FineWeb: The finest collection of data the web has to offer">
</center>

> 15 trillion tokens of the finest data the 🌐 web has to offer

# Table of Contents
- [🍷 FineWeb](#-fineweb)
   * [What is it?](#what-is-it)
   * [What is being released?](#what-is-being-released)
   * [Changelog](#changelog)
   * [How to download and use 🍷 FineWeb](#how-to-download-and-use-🍷-fineweb)
      + [Using 🏭 `datatrove`](#using-datatrove)
      + [Using `huggingface_hub`](#using-huggingface_hub)
      + [Using `datasets`](#using-datasets)
   * [Breakdown by dump/crawl](#breakdown-by-dumpcrawl)
   * [Dataset performance evaluation and ablations](#dataset-performance-evaluation-and-ablations)
      + [Hyper-parameters for ablation models](#hyper-parameters-for-ablation-models)
      + [Ablation evaluation benchmarks](#ablation-evaluation-benchmarks)
      + [Comparison with other datasets](#comparison-with-other-datasets)
- [Dataset card for 🍷 FineWeb](#dataset-card-for-🍷-fineweb)
   * [Dataset Summary](#dataset-summary)
   * [Dataset Structure](#dataset-structure)
      + [Data Instances](#data-instances)
      + [Data Fields](#data-fields)
      + [Data Splits](#data-splits)
   * [Dataset Creation](#dataset-creation)
      + [Curation Rationale](#curation-rationale)
      + [Source Data](#source-data)
      + [Data processing steps](#data-processing-steps)
      + [Annotations](#annotations)
      + [Personal and Sensitive Information](#personal-and-sensitive-information)
   * [Considerations for Using the Data](#considerations-for-using-the-data)
      + [Social Impact of Dataset](#social-impact-of-dataset)
      + [Discussion of Biases](#discussion-of-biases)
      + [Other Known Limitations](#other-known-limitations)
   * [Additional Information](#additional-information)
      + [Licensing Information](#licensing-information)
      + [Future work](#future-work)
