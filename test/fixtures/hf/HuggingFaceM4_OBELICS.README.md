---
language:
- en
license: cc-by-4.0
size_categories:
- 100M<n<1B
pretty_name: OBELICS
configs:
- config_name: default
  data_files:
  - split: train
    path: data/train-*
- config_name: opt_out_docs_removed_2023_07_12
  data_files:
  - split: train
    path: opt_out_docs_removed_2023_07_12/train-*
dataset_info:
- config_name: default
  features:
  - name: images
    sequence: string
  - name: metadata
    dtype: string
  - name: general_metadata
    dtype: string
  - name: texts
    sequence: string
  splits:
  - name: train
    num_bytes: 715724717192
    num_examples: 141047697
  download_size: 71520629655
  dataset_size: 715724717192
- config_name: opt_out_docs_removed_2023_07_12
  features:
  - name: images
    sequence: string
  - name: metadata
    dtype: string
  - name: general_metadata
    dtype: string
  - name: texts
    sequence: string
  splits:
  - name: train
    num_bytes: 684638314215
    num_examples: 134648855
  download_size: 266501092920
  dataset_size: 684638314215
---
# Dataset Card for OBELICS

## Dataset Description

- **Visualization of OBELICS web documents:** https://huggingface.co/spaces/HuggingFaceM4/obelics_visualization
- **Paper:** [OBELICS: An Open Web-Scale Filtered Dataset of Interleaved Image-Text Documents](https://arxiv.org/abs/2306.16527)
- **Repository:** https://github.com/huggingface/OBELICS
- **Point of Contact: hugo@huggingface.co**

`OBELICS` is an open, massive, and curated collection of interleaved image-text web documents, containing 141M English documents, 115B text tokens, and 353M images, extracted from Common Crawl dumps between February 2020 and February 2023. The collection and filtering steps are described in our [paper](https://huggingface.co/papers/2306.16527).

Interleaved image-text web documents are a succession of text paragraphs interleaved by images, such as web pages that contain images. Models trained on these web documents outperform vision and language models trained solely on image-text pairs on various benchmarks. They can also generate long and coherent text about a set of multiple images. As an example, we trained [IDEFICS](https://huggingface.co/HuggingFaceM4/idefics-80b), a visual language model that accepts arbitrary sequences of image and text inputs and produces text outputs.

We provide an [interactive visualization](https://atlas.nomic.ai/map/f2fba2aa-3647-4f49-a0f3-9347daeee499/ee4a84bd-f125-4bcc-a683-1b4e231cb10f) of OBELICS that allows exploring the content of OBELICS. The map shows a subset of 11M of the 141M documents.

[![OBELICS Nomic map](assets/nomic_map.png)](https://atlas.nomic.ai/map/f2fba2aa-3647-4f49-a0f3-9347daeee499/ee4a84bd-f125-4bcc-a683-1b4e231cb10f)


## Data Fields

An example of a sample looks as follows:
```
# The example has been cropped

{
    'images': [
        'https://cdn.motor1.com/images/mgl/oRKO0/s1/lamborghini-urus-original-carbon-fiber-accessories.jpg',
        None
    ],
    'metadata': '[{"document_url": "https://lamborghinichat.com/forum/news/vw-group-allegedly-receives-offer-to-sell-lamborghini-for-9-2-billion.728/", "unformatted_src": "https://cdn.motor1.com/images/mgl/oRKO0/s1/lamborghini-urus-original-carbon-fiber-accessories.jpg", "src": "https://cdn.motor1.com/images/mgl/oRKO0/s1/lamborghini-urus-original-carbon-fiber-accessories.jpg", "formatted_filename": "lamborghini urus original carbon fiber accessories", "alt_text": "VW Group Allegedly Receives Offer To Sell Lamborghini For $9.2 Billion", "original_width": 1920, "original_height": 1080, "format": "jpeg"}, null]',
    'general_metadata': '{"url": "https://lamborghinichat.com/forum/news/vw-group-allegedly-receives-offer-to-sell-lamborghini-for-9-2-billion.728/", "warc_filename": "crawl-data/CC-MAIN-2021-25/segments/1623488528979.69/warc/CC-MAIN-20210623011557-20210623041557-00312.warc.gz", "warc_record_offset": 322560850, "warc_record_length": 17143}',
    'texts': [
        None,
        'The buyer would get everything, including Lambo\'s headquarters.\n\nThe investment groupQuantum Group AG has submitted a€7.5 billion ($9.2 billion at current exchange rates) offer to purchase Lamborghini from Volkswagen Group, Autocar reports. There\'s no info yet about whether VW intends to accept the offer or further negotiate the deal.\n\nQuantum ... Group Chief Executive Herbert Diess said at the time.'
    ]
}
```

Each sample is composed of the same 4 fields: `images`, `texts`, `metadata`, and `general_metadata`. `images` and `texts` are two lists of the same size, where for each index, one element and only one is not `None`. For example, for the interleaved web document `<image_1>text<image_2>`, we would find `[image_1, None, image_2]` in `images` and `[None, text, None]` in `texts`.

