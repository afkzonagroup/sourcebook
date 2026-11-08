# Dataset manifests

`sourcebook collect manifest` reads a description of your datasets that you
keep yourself. Each dataset becomes an inventory entry; `sourcebook init
--from` then fills the structured fields of the summary (checkboxes, lists of
datasets, size ranges where the units allow it) and leaves every narrative
field to you.

## JSON

```json
{
  "datasets": [
    {
      "name": "News archive 2015-2024",
      "link": "https://example.org/news-archive",
      "category": "licensed",
      "modalities": ["text"],
      "languages": ["en", "fr"],
      "licenses": ["commercial licence"],
      "sizes": [{ "modality": "text", "value": 120000000000, "unit": "tokens", "after_preprocessing": true }],
      "collection_period": { "start": "2015-01", "end": "2024-12" },
      "publicly_known": null,
      "notes": []
    }
  ]
}
```

`category` is one of `public` (Section 2.1), `licensed` (2.2.1), `private`
(2.2.2), `synthetic` (2.5), `other` (2.6), or `null` when you have not
decided yet. `value` is a non-negative integer (or a decimal string).

## CSV

One row per dataset and modality; rows with the same `name` are one dataset.
Only `name` is required.

```csv
name,link,category,modality,size,unit,after_preprocessing,languages,licenses,collection_start,collection_end,publicly_known
News archive,https://example.org/news,licensed,text,120000000000,tokens,true,en;fr,commercial licence,2015-01,2024-12,
```

## Parquet

`sourcebook collect manifest data/*.parquet --name "Corpus" --category public`
reads the footer of each Parquet file (Thrift metadata only, never the data):
row counts, uncompressed sizes, column names, and the feature types that the
Hugging Face `datasets` library stores. All files given in one run are one
dataset. Encrypted footers are not supported. (The Python package does not
read Parquet; use `pyarrow.parquet.ParquetFile(path).metadata` and a JSON
manifest.)

## Hugging Face dataset cards

`sourcebook collect hf README.md --id owner/name` reads the YAML front
matter of a local dataset card. `sourcebook collect hf --online owner/name`
reads the same metadata from the Hub API (only `https://huggingface.co`, only
when you ask). Taken over: name (`pretty_name`), link, licences, languages,
modalities (Hub `modality:` tags, or the card's feature types and task
categories), sizes (`dataset_info`), gated or private status, source datasets
and machine-generated content (as notes). Sizes from cards are the dataset's
own sizes, not sizes after your pre-processing; the template asks for sizes
after pre-processing, so Sourcebook marks them `after_preprocessing: false`.

## The "large dataset" rule

Section 2.1: "A dataset is considered to be “large” if the total data size
for any one of the modalities contained in the dataset exceeds 3% of the size
of all publicly available datasets for that modality used for training."
Sourcebook applies this to datasets with category `public`, per modality, with
integer arithmetic (`size × 100 > total × 3`, so exactly 3 % is not large).
It reports "not determined" when a dataset has no size for a modality, or
when sizes of one modality are in different units.
