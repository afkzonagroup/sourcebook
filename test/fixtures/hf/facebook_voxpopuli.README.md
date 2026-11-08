---
annotations_creators: []
language:
- en
- de
- fr
- es
- pl
- it
- ro
- hu
- cs
- nl
- fi
- hr
- sk
- sl
- et
- lt
language_creators: []
license:
- cc0-1.0
- other
multilinguality:
- multilingual
pretty_name: VoxPopuli
size_categories: []
source_datasets: []
tags: []
task_categories:
- automatic-speech-recognition
task_ids: []
dataset_info:
- config_name: cs
  features:
  - name: audio_id
    dtype: string
  - name: language
    dtype:
      class_label:
        names:
          '0': en
          '1': de
          '2': fr
          '3': es
          '4': pl
          '5': it
          '6': ro
          '7': hu
          '8': cs
          '9': nl
          '10': fi
          '11': hr
          '12': sk
          '13': sl
          '14': et
          '15': lt
          '16': en_accented
  - name: audio
    dtype:
      audio:
        sampling_rate: 16000
  - name: raw_text
    dtype: string
  - name: normalized_text
    dtype: string
  - name: gender
    dtype: string
  - name: speaker_id
    dtype: string
  - name: is_gold_transcript
    dtype: bool
  - name: accent
    dtype: string
  splits:
  - name: train
    num_bytes: 12588060116.726
    num_examples: 18902
  - name: validation
    num_bytes: 700843826.563
    num_examples: 1103
  - name: test
    num_bytes: 714178772.784
    num_examples: 1123
  download_size: 11548798948
  dataset_size: 14003082716.073
- config_name: de
  features:
  - name: audio_id
    dtype: string
  - name: language
    dtype:
      class_label:
        names:
          '0': en
          '1': de
          '2': fr
          '3': es
          '4': pl
          '5': it
          '6': ro
          '7': hu
          '8': cs
          '9': nl
          '10': fi
          '11': hr
          '12': sk
          '13': sl
          '14': et
          '15': lt
          '16': en_accented
  - name: audio
    dtype:
      audio:
        sampling_rate: 16000
  - name: raw_text
    dtype: string
  - name: normalized_text
    dtype: string
  - name: gender
    dtype: string
  - name: speaker_id
    dtype: string
  - name: is_gold_transcript
    dtype: bool
  - name: accent
    dtype: string
  splits:
  - name: train
    num_bytes: 61623291127.568
    num_examples: 108473
  - name: validation
    num_bytes: 1149953416.507
    num_examples: 2109
  - name: test
    num_bytes: 1112380619.272
    num_examples: 1968
  download_size: 52639035844
  dataset_size: 63885625163.347
- config_name: en
  features:
  - name: audio_id
    dtype: string
  - name: language
    dtype:
      class_label:
        names:
          '0': en
          '1': de
          '2': fr
          '3': es
          '4': pl
          '5': it
          '6': ro
          '7': hu
          '8': cs
          '9': nl
          '10': fi
          '11': hr
          '12': sk
          '13': sl
          '14': et
          '15': lt
          '16': en_accented
  - name: audio
    dtype:
      audio:
        sampling_rate: 16000
  - name: raw_text
    dtype: string
  - name: normalized_text
    dtype: string
  - name: gender
    dtype: string
  - name: speaker_id
    dtype: string
  - name: is_gold_transcript
    dtype: bool
  - name: accent
    dtype: string
  splits:
  - name: train
    num_bytes: 118431996153.336
    num_examples: 182482
  - name: validation
    num_bytes: 1147990403.766
    num_examples: 1753
  - name: test
    num_bytes: 1143640745.808
    num_examples: 1842
  download_size: 98803059660
  dataset_size: 120723627302.91
- config_name: en_accented
  features:
  - name: audio_id
    dtype: string
  - name: language
    dtype:
      class_label:
        names:
          '0': en
          '1': de
          '2': fr
          '3': es
          '4': pl
          '5': it
          '6': ro
          '7': hu
          '8': cs
          '9': nl
          '10': fi
          '11': hr
          '12': sk
          '13': sl
          '14': et
          '15': lt
          '16': en_accented
  - name: audio
    dtype:
      audio:
        sampling_rate: 16000
  - name: raw_text
    dtype: string
  - name: normalized_text
    dtype: string
  - name: gender
    dtype: string
  - name: speaker_id
    dtype: string
  - name: is_gold_transcript
    dtype: bool
  - name: accent
    dtype: string
  splits:
  - name: test
    num_bytes: 6026063102.197
    num_examples: 8387
  download_size: 4946727051
  dataset_size: 6026063102.197
- config_name: es
  features:
  - name: audio_id
    dtype: string
  - name: language
    dtype:
      class_label:
        names:
          '0': en
          '1': de
          '2': fr
          '3': es
          '4': pl
          '5': it
          '6': ro
          '7': hu
          '8': cs
          '9': nl
          '10': fi
          '11': hr
          '12': sk
          '13': sl
          '14': et
          '15': lt
          '16': en_accented
  - name: audio
    dtype:
      audio:
        sampling_rate: 16000
  - name: raw_text
    dtype: string
  - name: normalized_text
    dtype: string
  - name: gender
    dtype: string
  - name: speaker_id
    dtype: string
  - name: is_gold_transcript
    dtype: bool
  - name: accent
    dtype: string
  splits:
  - name: train
    num_bytes: 36090680559.936
    num_examples: 50922
  - name: validation
    num_bytes: 1173795492.383
    num_examples: 1631
  - name: test
    num_bytes: 1163226173.4
    num_examples: 1528
  download_size: 31735446877
  dataset_size: 38427702225.719
- config_name: et
  features:
  - name: audio_id
    dtype: string
  - name: language
    dtype:
      class_label:
        names:
          '0': en
          '1': de
          '2': fr
          '3': es
          '4': pl
          '5': it
          '6': ro
          '7': hu
          '8': cs
          '9': nl
          '10': fi
          '11': hr
          '12': sk
          '13': sl
          '14': et
          '15': lt
          '16': en_accented
  - name: audio
    dtype:
      audio:
        sampling_rate: 16000
  - name: raw_text
    dtype: string
  - name: normalized_text
    dtype: string
  - name: gender
    dtype: string
  - name: speaker_id
    dtype: string
  - name: is_gold_transcript
    dtype: bool
  - name: accent
    dtype: string
  splits:
  - name: train
    num_bytes: 525978460.0
    num_examples: 834
  - name: validation
    num_bytes: 31718470.0
    num_examples: 50
  - name: test
    num_bytes: 29766659.0
    num_examples: 51
  download_size: 490583763
  dataset_size: 587463589.0
- config_name: fi
  features:
  - name: audio_id
    dtype: string
  - name: language
    dtype:
      class_label:
        names:
          '0': en
          '1': de
          '2': fr
          '3': es
          '4': pl
          '5': it
          '6': ro
          '7': hu
          '8': cs
          '9': nl
          '10': fi
          '11': hr
          '12': sk
          '13': sl
          '14': et
          '15': lt
          '16': en_accented
  - name: audio
    dtype:
      audio:
        sampling_rate: 16000
  - name: raw_text
    dtype: string
  - name: normalized_text
    dtype: string
  - name: gender
    dtype: string
  - name: speaker_id
    dtype: string
  - name: is_gold_transcript
    dtype: bool
  - name: accent
    dtype: string
  splits:
  - name: train
    num_bytes: 5231900907.4
    num_examples: 7878
  - name: validation
    num_bytes: 460480456.0
    num_examples: 718
  - name: test
    num_bytes: 304525221.0
    num_examples: 478
  download_size: 4951807012
  dataset_size: 5996906584.4
- config_name: fr
  features:
  - name: audio_id
    dtype: string
  - name: language
    dtype:
      class_label:
        names:
          '0': en
          '1': de
          '2': fr
          '3': es
          '4': pl
          '5': it
          '6': ro
          '7': hu
          '8': cs
          '9': nl
          '10': fi
          '11': hr
          '12': sk
          '13': sl
          '14': et
          '15': lt
          '16': en_accented
  - name: audio
    dtype:
      audio:
        sampling_rate: 16000
  - name: raw_text
    dtype: string
  - name: normalized_text
    dtype: string
  - name: gender
    dtype: string
  - name: speaker_id
    dtype: string
  - name: is_gold_transcript
    dtype: bool
  - name: accent
    dtype: string
  splits:
  - name: train
    num_bytes: 48361894011.26
    num_examples: 73561
  - name: validation
    num_bytes: 1150144123.605
    num_examples: 1727
  - name: test
    num_bytes: 1123907283.428
    num_examples: 1742
  download_size: 42134193246
  dataset_size: 50635945418.29301
- config_name: hr
  features:
  - name: audio_id
    dtype: string
  - name: language
    dtype:
      class_label:
        names:
          '0': en
          '1': de
          '2': fr
          '3': es
          '4': pl
          '5': it
          '6': ro
          '7': hu
          '8': cs
          '9': nl
          '10': fi
          '11': hr
          '12': sk
          '13': sl
          '14': et
          '15': lt
          '16': en_accented
  - name: audio
    dtype:
      audio:
        sampling_rate: 16000
  - name: raw_text
    dtype: string
  - name: normalized_text
    dtype: string
  - name: gender
    dtype: string
  - name: speaker_id
    dtype: string
  - name: is_gold_transcript
    dtype: bool
  - name: accent
    dtype: string
  splits:
  - name: train
    num_bytes: 8023013076.105
    num_examples: 10987
  - name: validation
    num_bytes: 976946572.365
    num_examples: 1285
  - name: test
    num_bytes: 499681683.0
    num_examples: 666
  download_size: 7764022128
  dataset_size: 9499641331.47
- config_name: hu
  features:
  - name: audio_id
    dtype: string
  - name: language
    dtype:
      class_label:
        names:
          '0': en
          '1': de
          '2': fr
          '3': es
          '4': pl
          '5': it
          '6': ro
          '7': hu
          '8': cs
          '9': nl
          '10': fi
          '11': hr
          '12': sk
          '13': sl
          '14': et
          '15': lt
          '16': en_accented
  - name: audio
    dtype:
      audio:
        sampling_rate: 16000
  - name: raw_text
    dtype: string
  - name: normalized_text
    dtype: string
  - name: gender
    dtype: string
  - name: speaker_id
    dtype: string
  - name: is_gold_transcript
    dtype: bool
  - name: accent
    dtype: string
  splits:
  - name: train
    num_bytes: 12401737446.88
    num_examples: 18120
  - name: validation
    num_bytes: 747920493.132
    num_examples: 1076
  - name: test
    num_bytes: 711079430.21
    num_examples: 1110
  download_size: 11578901379
  dataset_size: 13860737370.222
- config_name: it
  features:
  - name: audio_id
    dtype: string
  - name: language
    dtype:
      class_label:
        names:
          '0': en
          '1': de
          '2': fr
          '3': es
          '4': pl
          '5': it
          '6': ro
          '7': hu
          '8': cs
          '9': nl
          '10': fi
          '11': hr
          '12': sk
          '13': sl
          '14': et
          '15': lt
          '16': en_accented
  - name: audio
    dtype:
      audio:
        sampling_rate: 16000
  - name: raw_text
    dtype: string
  - name: normalized_text
    dtype: string
  - name: gender
    dtype: string
  - name: speaker_id
    dtype: string
  - name: is_gold_transcript
    dtype: bool
  - name: accent
    dtype: string
  splits:
  - name: train
    num_bytes: 17507657225.08
    num_examples: 22576
  - name: validation
    num_bytes: 1015408546.14
    num_examples: 1257
  - name: test
    num_bytes: 994989586.882
    num_examples: 1177
  download_size: 17099228937
  dataset_size: 19518055358.102
- config_name: lt
  features:
  - name: audio_id
    dtype: string
  - name: language
    dtype:
      class_label:
        names:
          '0': en
          '1': de
          '2': fr
          '3': es
          '4': pl
          '5': it
          '6': ro
          '7': hu
          '8': cs
          '9': nl
          '10': fi
          '11': hr
          '12': sk
          '13': sl
          '14': et
          '15': lt
          '16': en_accented
  - name: audio
    dtype:
      audio:
        sampling_rate: 16000
  - name: raw_text
    dtype: string
  - name: normalized_text
    dtype: string
  - name: gender
    dtype: string
  - name: speaker_id
    dtype: string
  - name: is_gold_transcript
    dtype: bool
  - name: accent
    dtype: string
  splits:
  - name: train
    num_bytes: 308829896.0
    num_examples: 456
  - name: validation
    num_bytes: 2897005.0
    num_examples: 3
  - name: test
    num_bytes: 27957133.0
    num_examples: 42
  download_size: 288416179
  dataset_size: 339684034.0
- config_name: multilang
  features:
  - name: audio_id
    dtype: string
  - name: language
    dtype:
      class_label:
        names:
          '0': en
          '1': de
          '2': fr
          '3': es
          '4': pl
          '5': it
          '6': ro
          '7': hu
          '8': cs
          '9': nl
          '10': fi
          '11': hr
          '12': sk
          '13': sl
          '14': et
          '15': lt
          '16': en_accented
  - name: audio
    dtype:
      audio:
        sampling_rate: 16000
  - name: raw_text
    dtype: string
  - name: normalized_text
    dtype: string
  - name: gender
    dtype: string
  - name: speaker_id
    dtype: string
  - name: is_gold_transcript
    dtype: bool
  - name: accent
    dtype: string
  splits:
  - name: train
    num_bytes: 381494362201.104
    num_examples: 587798
  - name: validation
    num_bytes: 12204917860.392
    num_examples: 18636
  - name: test
    num_bytes: 10549966622.584
    num_examples: 16991
  download_size: 334147849368
  dataset_size: 404249246684.08
- config_name: nl
  features:
  - name: audio_id
    dtype: string
  - name: language
    dtype:
      class_label:
        names:
          '0': en
          '1': de
          '2': fr
          '3': es
          '4': pl
          '5': it
          '6': ro
          '7': hu
          '8': cs
          '9': nl
          '10': fi
          '11': hr
          '12': sk
          '13': sl
          '14': et
          '15': lt
          '16': en_accented
  - name: audio
    dtype:
      audio:
        sampling_rate: 16000
  - name: raw_text
    dtype: string
  - name: normalized_text
    dtype: string
  - name: gender
    dtype: string
  - name: speaker_id
    dtype: string
  - name: is_gold_transcript
    dtype: bool
  - name: accent
    dtype: string
  splits:
  - name: train
    num_bytes: 10439951381.608
    num_examples: 20968
  - name: validation
    num_bytes: 637129232.64
    num_examples: 1230
  - name: test
    num_bytes: 605082732.55
    num_examples: 1137
  download_size: 9841686925
  dataset_size: 11682163346.797998
- config_name: pl
  features:
  - name: audio_id
    dtype: string
  - name: language
    dtype:
      class_label:
        names:
          '0': en
          '1': de
          '2': fr
          '3': es
          '4': pl
          '5': it
          '6': ro
          '7': hu
          '8': cs
          '9': nl
          '10': fi
          '11': hr
          '12': sk
          '13': sl
          '14': et
          '15': lt
          '16': en_accented
  - name: audio
    dtype:
      audio:
        sampling_rate: 16000
  - name: raw_text
    dtype: string
  - name: normalized_text
    dtype: string
  - name: gender
    dtype: string
  - name: speaker_id
    dtype: string
  - name: is_gold_transcript
    dtype: bool
  - name: accent
    dtype: string
  splits:
  - name: train
    num_bytes: 22255439519.03
    num_examples: 34665
  - name: validation
    num_bytes: 1128491688.807
    num_examples: 1691
  - name: test
    num_bytes: 1139283257.081
    num_examples: 1831
  download_size: 20560438868
  dataset_size: 24523214464.918
- config_name: ro
  features:
  - name: audio_id
    dtype: string
  - name: language
    dtype:
      class_label:
        names:
          '0': en
          '1': de
          '2': fr
          '3': es
          '4': pl
          '5': it
          '6': ro
          '7': hu
          '8': cs
          '9': nl
          '10': fi
          '11': hr
          '12': sk
          '13': sl
          '14': et
          '15': lt
          '16': en_accented
  - name: audio
    dtype:
      audio:
        sampling_rate: 16000
  - name: raw_text
    dtype: string
  - name: normalized_text
    dtype: string
  - name: gender
    dtype: string
  - name: speaker_id
    dtype: string
  - name: is_gold_transcript
    dtype: bool
  - name: accent
    dtype: string
  splits:
  - name: train
    num_bytes: 17342967766.164
    num_examples: 24259
  - name: validation
    num_bytes: 1037009834.212
    num_examples: 1418
  - name: test
    num_bytes: 992719002.245
    num_examples: 1383
  download_size: 16501664145
  dataset_size: 19372696602.621002
- config_name: sk
  features:
  - name: audio_id
    dtype: string
  - name: language
    dtype:
      class_label:
        names:
          '0': en
          '1': de
          '2': fr
          '3': es
          '4': pl
          '5': it
          '6': ro
          '7': hu
          '8': cs
          '9': nl
          '10': fi
          '11': hr
          '12': sk
          '13': sl
          '14': et
          '15': lt
          '16': en_accented
  - name: audio
    dtype:
      audio:
        sampling_rate: 16000
  - name: raw_text
    dtype: string
  - name: normalized_text
    dtype: string
  - name: gender
    dtype: string
  - name: speaker_id
    dtype: string
  - name: is_gold_transcript
    dtype: bool
  - name: accent
    dtype: string
  splits:
  - name: train
    num_bytes: 6942255847.456
    num_examples: 10616
  - name: validation
    num_bytes: 458524499.0
    num_examples: 696
  - name: test
    num_bytes: 401681777.0
    num_examples: 604
  download_size: 6419963713
  dataset_size: 7802462123.456
- config_name: sl
  features:
  - name: audio_id
    dtype: string
  - name: language
    dtype:
      class_label:
        names:
          '0': en
          '1': de
          '2': fr
          '3': es
          '4': pl
          '5': it
          '6': ro
          '7': hu
          '8': cs
          '9': nl
          '10': fi
          '11': hr
          '12': sk
          '13': sl
          '14': et
          '15': lt
          '16': en_accented
  - name: audio
    dtype:
      audio:
        sampling_rate: 16000
  - name: raw_text
    dtype: string
  - name: normalized_text
    dtype: string
  - name: gender
    dtype: string
  - name: speaker_id
    dtype: string
  - name: is_gold_transcript
    dtype: bool
  - name: accent
    dtype: string
  splits:
  - name: train
    num_bytes: 1375125062.8
    num_examples: 2099
  - name: validation
    num_bytes: 637851620.0
    num_examples: 889
  - name: test
    num_bytes: 188485344.0
    num_examples: 309
  download_size: 1798502222
  dataset_size: 2201462026.8
configs:
- config_name: cs
  data_files:
  - split: train
    path: cs/train-*
  - split: validation
    path: cs/validation-*
  - split: test
    path: cs/test-*
- config_name: de
  data_files:
  - split: train
    path: de/train-*
  - split: validation
    path: de/validation-*
  - split: test
    path: de/test-*
- config_name: en
  data_files:
  - split: train
    path: en/train-*
  - split: validation
    path: en/validation-*
  - split: test
    path: en/test-*
- config_name: en_accented
  data_files:
  - split: test
    path: en_accented/test-*
- config_name: es
  data_files:
  - split: train
    path: es/train-*
  - split: validation
    path: es/validation-*
  - split: test
    path: es/test-*
- config_name: et
  data_files:
  - split: train
    path: et/train-*
  - split: validation
    path: et/validation-*
  - split: test
    path: et/test-*
- config_name: fi
  data_files:
  - split: train
    path: fi/train-*
  - split: validation
    path: fi/validation-*
  - split: test
    path: fi/test-*
- config_name: fr
  data_files:
  - split: train
    path: fr/train-*
  - split: validation
    path: fr/validation-*
  - split: test
    path: fr/test-*
- config_name: hr
  data_files:
  - split: train
    path: hr/train-*
  - split: validation
    path: hr/validation-*
  - split: test
    path: hr/test-*
- config_name: hu
  data_files:
  - split: train
    path: hu/train-*
  - split: validation
    path: hu/validation-*
  - split: test
    path: hu/test-*
- config_name: it
  data_files:
  - split: train
    path: it/train-*
  - split: validation
    path: it/validation-*
  - split: test
    path: it/test-*
- config_name: lt
  data_files:
  - split: train
    path: lt/train-*
  - split: validation
    path: lt/validation-*
  - split: test
    path: lt/test-*
- config_name: multilang
  data_files:
  - split: train
    path: multilang/train-*
  - split: validation
    path: multilang/validation-*
  - split: test
    path: multilang/test-*
- config_name: nl
  data_files:
  - split: train
    path: nl/train-*
  - split: validation
    path: nl/validation-*
  - split: test
    path: nl/test-*
- config_name: pl
  data_files:
  - split: train
    path: pl/train-*
  - split: validation
    path: pl/validation-*
  - split: test
    path: pl/test-*
- config_name: ro
  data_files:
  - split: train
    path: ro/train-*
  - split: validation
    path: ro/validation-*
  - split: test
    path: ro/test-*
- config_name: sk
  data_files:
  - split: train
    path: sk/train-*
  - split: validation
    path: sk/validation-*
  - split: test
    path: sk/test-*
- config_name: sl
  data_files:
  - split: train
    path: sl/train-*
  - split: validation
    path: sl/validation-*
  - split: test
    path: sl/test-*
---

# Dataset Card for Voxpopuli

## Table of Contents
- [Table of Contents](#table-of-contents)
- [Dataset Description](#dataset-description)
  - [Dataset Summary](#dataset-summary)
  - [Supported Tasks and Leaderboards](#supported-tasks-and-leaderboards)
  - [Languages](#languages)
- [Dataset Structure](#dataset-structure)
  - [Data Instances](#data-instances)
  - [Data Fields](#data-fields)
  - [Data Splits](#data-splits)
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
  - [Contributions](#contributions)

## Dataset Description

- **Homepage:** https://github.com/facebookresearch/voxpopuli
- **Repository:** https://github.com/facebookresearch/voxpopuli
- **Paper:** https://arxiv.org/abs/2101.00390
- **Point of Contact:** [changhan@fb.com](mailto:changhan@fb.com), [mriviere@fb.com](mailto:mriviere@fb.com), [annl@fb.com](mailto:annl@fb.com)

### Dataset Summary

VoxPopuli is a large-scale multilingual speech corpus for representation learning, semi-supervised learning and interpretation.
The raw data is collected from 2009-2020 [European Parliament event recordings](https://multimedia.europarl.europa.eu/en/home). We acknowledge the European Parliament for creating and sharing these materials.
This implementation contains transcribed speech data for 18 languages.
