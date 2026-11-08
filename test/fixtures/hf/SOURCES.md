# Dataset card fixtures

Real dataset cards from the Hugging Face Hub, downloaded on 8 November 2026,
used to test the YAML reader and the card collector against real-world
metadata. Each `*.README.md` keeps the card's YAML front matter unchanged and
at most the first 40 lines of the card text (one line naming third-party
products was removed from `nvidia_HelpSteer2.README.md`). Each `*.api.json`
keeps the fields `id`, `sha`, `lastModified`, `private`, `gated`,
`disabled`, `tags` and `cardData` of the Hub API response
(`https://huggingface.co/api/datasets/<id>`).

| Fixture | Dataset | Licence named in the card |
|---|---|---|
| HuggingFaceFW_fineweb | https://huggingface.co/datasets/HuggingFaceFW/fineweb | odc-by |
| HuggingFaceM4_OBELICS | https://huggingface.co/datasets/HuggingFaceM4/OBELICS | cc-by-4.0 |
| HuggingFaceTB_cosmopedia | https://huggingface.co/datasets/HuggingFaceTB/cosmopedia | apache-2.0 |
| allenai_c4 | https://huggingface.co/datasets/allenai/c4 | odc-by |
| allenai_dolma | https://huggingface.co/datasets/allenai/dolma | odc-by |
| bigcode_the-stack | https://huggingface.co/datasets/bigcode/the-stack (gated; API metadata only) | other |
| databricks_databricks-dolly-15k | https://huggingface.co/datasets/databricks/databricks-dolly-15k | cc-by-sa-3.0 |
| facebook_voxpopuli | https://huggingface.co/datasets/facebook/voxpopuli | cc0-1.0, other |
| mozilla-foundation_common_voice_17_0 | https://huggingface.co/datasets/mozilla-foundation/common_voice_17_0 | (none) |
| nvidia_HelpSteer2 | https://huggingface.co/datasets/nvidia/HelpSteer2 | cc-by-4.0 |
| openai_gsm8k | https://huggingface.co/datasets/openai/gsm8k | mit |
| openslr_librispeech_asr | https://huggingface.co/datasets/openslr/librispeech_asr | cc-by-4.0 |
| rajpurkar_squad | https://huggingface.co/datasets/rajpurkar/squad | cc-by-sa-4.0 |
| tatsu-lab_alpaca | https://huggingface.co/datasets/tatsu-lab/alpaca | cc-by-nc-4.0 |
| wikimedia_wikipedia | https://huggingface.co/datasets/wikimedia/wikipedia | cc-by-sa-3.0, gfdl |

The Parquet fixtures in `test/fixtures/parquet/` were written with pyarrow
26.0.1 from synthetic data. The crawl logs in `test/fixtures/crawl/` are
synthetic and written by `scripts/generate-vectors.mjs`.
