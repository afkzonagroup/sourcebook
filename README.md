# Sourcebook

Draw up the public summary of training content that Article 53(1)(d) of the
EU AI Act requires for every general-purpose AI model, in the AI Office's
mandatory template.

Sourcebook gives you a typed summary file that mirrors the template field by
field, collectors that pre-fill it from Hugging Face dataset cards, dataset
manifests and crawl logs, a validator that checks every field the template
asks for, and output as Markdown, HTML (for the web and for print to PDF),
JSON and a Hugging Face model card section. A TypeScript package and command
line tool, a Python package and a GitHub Action share one schema and one set
of test vectors.

Not legal advice. Sourcebook helps you fill in the template completely and
consistently; it does not decide what your training data was, and it does not
make anyone compliant.

## Why it exists

Article 53(1)(d) of [Regulation (EU) 2024/1689](https://eur-lex.europa.eu/eli/reg/2024/1689/oj)
requires providers of general-purpose AI models to "draw up and make publicly
available a sufficiently detailed summary about the content used for training
of the general-purpose AI model, according to a template provided by the AI
Office".

- The obligation applies from **2 August 2025** (Article 113, third
  paragraph, point (b)).
- It applies to **open-source models too**: the exception in Article 53(2)
  covers only points (a) and (b) of Article 53(1), not the summary.
- The AI Office's enforcement starts on **2 August 2026** (Explanatory
  Notice, point 33; Article 101 applies from the general date in Article 113).
- Models placed on the market **before 2 August 2025** must comply by
  **2 August 2027** (Article 111(3)).

The template is the Annex to [Communication C(2025) 8311 final of 5 December
2025](https://digital-strategy.ec.europa.eu/en/library/explanatory-notice-and-template-public-summary-training-content-general-purpose-ai-models)
(first published 24 July 2025). Only the template document exists; Sourcebook
turns it into data you can version, check and publish. Quotations and dates:
[docs/legal-basis.md](docs/legal-basis.md).

## Quick start

Requires Node.js 22 or later.

```sh
npm install @afkzona/sourcebook
npx sourcebook init --out training-content-summary.yaml
# fill in the file; then
npx sourcebook validate training-content-summary.yaml
npx sourcebook render training-content-summary.yaml --format html --out summary.html
```

With collected facts:

```sh
npx sourcebook collect hf --online HuggingFaceFW/fineweb wikimedia/wikipedia --out public.json
npx sourcebook collect crawl crawl/*.warc.gz --out crawl.json --list-out domains.txt
npx sourcebook init --from public.json --from crawl.json --out training-content-summary.yaml
npx sourcebook validate training-content-summary.yaml --inventory public.json --inventory crawl.json
```

`init --from` fills only structured fields (yes/no answers, modality boxes,
the list of large public datasets, the domain list, the crawl period). Every
narrative field stays empty for you to write; facts that may help appear as
`# Collected:` comments above it. Nothing you have written is overwritten.

## The summary file

YAML (or JSON) with one key per template field; see
[docs/template-mapping.md](docs/template-mapping.md) for the full mapping and
[examples/summary.yaml](examples/summary.yaml) for a complete example. An
extract:

```yaml
sourcebook: 1
summary_version:
  version: "1.1"
last_update: 2026-10-15
general_information:
  provider:
    name_and_contact_details: Example Labs B.V., ... ai-transparency@example.eu
    authorised_representative:
      applicable: false
      not_applicable_reason: established_in_union
  modalities:
    text:
      present: true
      size_range: 1b_to_10t_tokens
      types_of_content: Web pages, scientific articles, source code ...
data_sources:
  crawled_data:
    crawlers_used: true
    top_domains:
      domains: [example.org, example.com]
```

The YAML reader is a strict, safe subset of YAML 1.2: no anchors, aliases,
tags or merge keys; `no` stays the string "no". JSON Schemas for editors:
`schema/summary-v1.schema.json` and `schema/inventory-v1.schema.json`.

## Command line

| Command | What it does |
|---|---|
| `sourcebook init [--from INVENTORY.json ...] [--base SUMMARY] [--out FILE]` | Writes a commented summary file with every template field, optionally pre-filled. |
| `sourcebook collect hf <README.md> [--id owner/name]` | Reads a local Hugging Face dataset card. |
| `sourcebook collect hf --online <owner/name ...> [--revision REV]` | Reads dataset metadata from the Hub (network: `https://huggingface.co` only). |
| `sourcebook collect manifest <FILE.json\|FILE.csv\|*.parquet>` | Reads your dataset manifest ([docs/manifests.md](docs/manifests.md)). |
| `sourcebook collect crawl <FILE ...> [--sme] [--ties include\|cut] [--modality-mode combined\|per-modality]` | Ranks domain names from WARC, CDX, CDXJ or CSV crawl logs ([docs/domain-ranking.md](docs/domain-ranking.md)). |
| `sourcebook validate <SUMMARY> [--inventory FILE ...] [--strict] [--format text\|json]` | Checks every field the template asks for. Exit code 1 on errors (or warnings with `--strict`). |
| `sourcebook render <SUMMARY> --format markdown\|html\|print-html\|json\|model-card` | Renders the summary in the template's layout. |

`render` refuses an incomplete summary unless you pass `--allow-invalid`
(for drafts; `--instructions` prints the template's instructions under each
field). `--format print-html` is laid out for A4: open it in a browser and
print to PDF. Exit codes: 0 success, 1 validation failed, 2 usage or input
error.

## What the validator checks

- Every field the template requires is filled in; "If yes" fields after a
  Yes; "Where applicable" fields give a warning when empty.
- Section 1.3: a size range (or, for text, a size in another unit) and the
  types of content for each modality present.
- Section 2.1: each large dataset has a name and a link, or a description
  with collection dates (or "not known").
- Section 2.3: the domain list or information on how to access it; the
  collection period in order.
- Consistency: answers under a No, modalities in Section 2 that are missing
  from Section 1.3, model names without a placement date.
- Information gaps: allowed only for models placed on the market before
  2 August 2025 (Explanatory Notice, point 33), each with a justification.
- Six-month updates for continuously trained models (Explanatory Notice,
  point 29).
- With `--inventory`: every dataset over the 3 % threshold is listed as
  large, and every domain from the domain report is in the list.

## Library (TypeScript)

<!-- example:library -->
```ts
import { readFileSync } from 'node:fs';
import { parseSummaryText, validateSummary, renderMarkdown, DomainRanker } from '@afkzona/sourcebook';

const summary = parseSummaryText(readFileSync('examples/summary.yaml', 'utf8'));
const result = validateSummary(summary, { asOf: '2026-11-08' });
if (!result.ok) throw new Error(result.issues.map((i) => i.message).join('\n'));
const markdown = renderMarkdown(summary);

const ranker = new DomainRanker({ sme: true });
ranker.add({ url: 'https://news.example.co.uk/article', size: 120_000n });
ranker.add({ url: 'https://blog.example.org/post', size: 40_000n });
console.log(ranker.report().domains.map((d) => d.domain), markdown.length > 0);
```

Main exports: `parseSummary`, `parseSummaryText`, `validateSummary`,
`renderMarkdown`, `renderHtml`, `renderJson`, `modelCardSnippet`,
`insertIntoModelCard`, `datasetFromHfCard`, `fetchHubDataset`,
`prefillSummary`, `largeDatasets`, `DomainRanker`, `readWarc`, `readCdx`,
`readCdxj`, `readCsv`, `parseYaml`, `summaryToYaml`, and the template itself
(`FIELDS`, `SECTIONS`, `TEMPLATE`). All are documented with TSDoc.

## Python package

The `sourcebook` Python package (in [python/](python/)) has the same schema,
validation, Markdown and JSON output, model card section, Hugging Face card
collector, crawl log readers and domain ranking. It passes the same shared
test vectors as the TypeScript package, with byte-identical Markdown. It has
no dependencies. HTML output and Parquet footers are in the TypeScript tool.

```sh
pip install ./python
```

<!-- example:python -->
```python
import sourcebook as sb

card = open("test/fixtures/hf/rajpurkar_squad.README.md", encoding="utf-8").read()
dataset = sb.dataset_from_hf_card("README.md", readme=card, repo_id="rajpurkar/squad")
inventory = sb.new_inventory()
inventory["datasets"].append(dataset)
draft = sb.prefill_summary(inventory)["summary"]
print(draft["data_sources"]["public_datasets"]["used"])  # True

summary = sb.parse_summary_text(open("examples/summary.yaml", encoding="utf-8").read())
assert sb.validate_summary(summary, as_of="2026-11-08")["ok"]
print(sb.model_card_snippet(summary, "https://example.org/training-summary"))
```

## GitHub Action

Validates the summary file of a model repository on pull requests.

```yaml
- uses: afkzonagroup/sourcebook@<full-commit-sha>
  with:
    summary: training-content-summary.yaml
    strict: 'false'
```

Inputs: `summary` (path inside the repository), `inventory` (inventory files,
one per line), `strict`, `as-of`. Outputs: `errors`, `warnings`, `valid`.
Problems appear as annotations on the file. The file must be a regular file
inside the workspace; symbolic links are refused. The action sets up
Node.js 22 with `actions/setup-node` and builds itself from its lockfile
(dev dependencies from the npm registry); later steps of the same job see that
Node.js version. A full workflow:
[examples/github-workflow.yml](examples/github-workflow.yml).

## Hugging Face model card

The Explanatory Notice (point 32) asks for the summary on the provider's
website and "together with the model across all its public distribution
channels". To add it to a model card:

```sh
npx sourcebook render training-content-summary.yaml --format model-card \
  --summary-url https://example.org/models/my-model/training-summary \
  --readme README.md --out README.md --force
```

`--mode full` embeds the whole summary in a collapsible section. The section
sits between `<!-- sourcebook:start -->` and `<!-- sourcebook:end -->` and is
replaced on the next run; the card's YAML front matter is left untouched.

## How it maps to the law

| Requirement | Source | Sourcebook |
|---|---|---|
| Summary of training content, using the template | [Art. 53(1)(d)](https://eur-lex.europa.eu/eli/reg/2024/1689/oj#art_53) | Schema of every template field; `validate`; `render` |
| Applies to open-source models | [Art. 53(2)](https://eur-lex.europa.eu/eli/reg/2024/1689/oj#art_53) (exception covers (a) and (b) only); Explanatory Notice footnote 4 | No exemption offered |
| Authorised representative for providers outside the Union; open-source exemption | [Art. 54(1), (6)](https://eur-lex.europa.eu/eli/reg/2024/1689/oj#art_54) | Section 1.1 with `applicable` and the reason |
| Dates | [Art. 113](https://eur-lex.europa.eu/eli/reg/2024/1689/oj#art_113), [Art. 111(3)](https://eur-lex.europa.eu/eli/reg/2024/1689/oj#art_111); Explanatory Notice point 33 | Information on models placed before 2 August 2025; gap statements |
| Fines | [Art. 101](https://eur-lex.europa.eu/eli/reg/2024/1689/oj#art_101) | (context only) |
| Top domain names (10 %; SMEs 5 % or 1 000) | Template Section 2.3; Explanatory Notice footnote 16 | `collect crawl` |
| Large public datasets (over 3 %) | Template Section 2.1 | `largeDatasets`, `validate --inventory` |
| Updates every six months when further trained | Explanatory Notice point 29 | Warning in `validate` |
| Publication with the model on all channels | Explanatory Notice point 32 | HTML; model card section |

Details and quotations: [docs/legal-basis.md](docs/legal-basis.md).

## Limitations

- Sourcebook does not know your training data. Narrative answers, categories
  and sizes after pre-processing must come from you.
- Sizes from dataset cards and Parquet files are the datasets' own sizes, not
  sizes after your pre-processing; check the "large" datasets with your own
  numbers.
- CDX and CDXJ sizes are compressed WARC record lengths, a proxy for the
  content size.
- The domain list of Section 2.3 is for your own crawls (or crawls made on
  your behalf). Snapshots of Common Crawl and other public datasets belong in
  Section 2.1; do not feed their logs to `collect crawl` for Section 2.3.
- Where the template is silent (rounding of "10 %", ties, what counts as one
  domain), Sourcebook makes a documented choice and records it in every
  report; see [docs/domain-ranking.md](docs/domain-ranking.md).
- Only the English template is built in. The other 23 language versions of
  the Explanatory Notice exist on the Commission's page; the template's
  wording in those languages is not included.
- The YAML reader accepts a safe subset of YAML; files with anchors, aliases
  or tags are rejected.

## Configuration

| Option | Default | Where |
|---|---|---|
| `--sme` | off | `collect crawl`: SME threshold (5 % or 1 000) |
| `--ties include\|cut` | include | `collect crawl` |
| `--modality-mode combined\|per-modality` | combined | `collect crawl` |
| `--private-suffixes` | off | `collect crawl`: also use the PRIVATE section of the Public Suffix List |
| `--max-domains N`, `--max-records N` | 5 000 000, 1 000 000 000 | `collect crawl` limits |
| `--csv-url`, `--csv-host`, `--csv-size`, `--csv-modality`, `--csv-date`, `--csv-delimiter`, `--unit` | `url`, -, `size`, -, -, comma, bytes | CSV crawl logs |
| `--as-of YYYY-MM-DD` | today | `validate` |
| `--timeout SECONDS` | 15 | `collect hf --online` |

## Dependencies

None at run time, in both the npm and the Python package. Bundled data:

- `spec/template-v1.json`: the template's labels and instructions (© European
  Union, CC BY 4.0).
- `data/public_suffix_list.dat.gz`: the Public Suffix List, unmodified
  (Mozilla Public License 2.0, `data/PSL-LICENSE.txt`).

Development dependencies (TypeScript, ESLint, Vitest, Ajv) are pinned in
`package-lock.json`.

## Security

Untrusted input is expected: dataset cards, manifests, crawl logs and summary
files from other people. The parsers have size, depth and count limits, reject
YAML anchors and aliases and prototype keys, and stream crawl logs with
bounded memory. The only network access is to `https://huggingface.co`, on
request, with a timeout and a size cap. Output is escaped for Markdown, HTML
and GitHub workflow commands. See [SECURITY.md](SECURITY.md) for the threat
model and [docs/data-flows.md](docs/data-flows.md).

## Licence and Enterprise

Sourcebook is licensed under the GNU Affero General Public License version 3
only (AGPL-3.0-only) with an attribution term under section 7(b): interfaces
and generated summaries keep "Sourcebook by AFKzona Group" with a link (see
[LICENSE-ADDITIONAL-TERMS.md](LICENSE-ADDITIONAL-TERMS.md)). A commercial
licence without the AGPL obligations is available ([COMMERCIAL.md](COMMERCIAL.md)).
"Sourcebook" is a trademark of MB AFKzona Group ([TRADEMARKS.md](TRADEMARKS.md)).

**Enterprise.** AFKzona Group offers, outside this repository: a hosted
dashboard for summaries across models and versions, continuous monitoring of
datasets and crawls, SSO/SAML, roles, audit evidence packs, a legal-update
feed, white-label summaries without the attribution footer, and SLA support.
Contact info@afkzonagroup.lt.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Pull requests require the
[Contributor Licence Agreement](CLA.md).

## Disclaimer

This software is provided "as is", without warranty. It is not legal advice.
The official texts on EUR-Lex and the Commission's website prevail. Check
your summary against your own records before you publish it.

Maintained by AFKzona Group.
