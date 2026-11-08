# sourcebook (Python)

The public summary of training content for general-purpose AI models
(Article 53(1)(d) of Regulation (EU) 2024/1689, the AI Act), in the AI
Office's template. Python port of the TypeScript package
[@afkzona/sourcebook](https://github.com/afkzonagroup/sourcebook), with the
same summary schema and the same shared test vectors (the Markdown output is
byte-identical).

No dependencies. Python 3.10 or later.

```sh
pip install ./python
```

What it does:

- `parse_summary_text`, `parse_summary`: read a summary file (YAML or JSON)
  with a strict, safe YAML reader.
- `validate_summary`: check every field the template requires.
- `render_markdown`, `render_json`, `model_card_snippet`,
  `insert_into_model_card`: output, and a section for a Hugging Face model
  card.
- `dataset_from_hf_card`: facts from a dataset card's YAML front matter (or
  from `fetch_hub_dataset`, which reads only `https://huggingface.co`, only
  when called).
- `read_warc`, `read_cdx`, `read_cdxj`, `read_csv` and `DomainRanker`: the
  most relevant domain names of Section 2.3 from crawl logs.
- `datasets_from_json_manifest`, `datasets_from_csv_manifest`,
  `prefill_summary`, `large_datasets`: inventories and pre-fill.

```python
import sourcebook as sb

summary = sb.parse_summary_text(open("training-content-summary.yaml", encoding="utf-8").read())
result = sb.validate_summary(summary)
for issue in result["issues"]:
    print(issue["severity"], issue["message"])
print(sb.render_markdown(summary))
```

Rank domains from a WARC file:

```python
import gzip
import sourcebook as sb

ranker = sb.DomainRanker(sme=False)
with gzip.open("crawl.warc.gz", "rb") as f:
    for record in sb.read_warc(iter(lambda: f.read(1 << 20), b""), {}):
        ranker.add(record)
print([d["domain"] for d in ranker.report()["domains"]])
```

HTML output, Parquet footers and the command line tool are in the
TypeScript package.

Licence: AGPL-3.0-only with the attribution term in
LICENSE-ADDITIONAL-TERMS.md ("Sourcebook by AFKzona Group" with a link stays
in generated summaries). The bundled Public Suffix List is under the Mozilla
Public License 2.0 (`src/sourcebook/data/PSL-LICENSE.txt`). Not legal
advice. Maintained by AFKzona Group.
