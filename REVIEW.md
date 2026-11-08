# Review record

Two review passes were made after the build, as the project standards
require. This file records what was checked, what was found and what was
fixed. An independent review follows before publication.

## Pass 1: correctness, law, edge cases, API, tests

### Checked

- **Template text.** Every label, instruction, section text, size range,
  modality example and the audio footnote in `src/spec/template.ts` against
  the official Word template and the Annex of C(2025) 8311 final (automated
  in `test/template.test.ts` against `test/fixtures/official/`). Section
  order against the Annex.
- **Template completeness.** All 51 fields have a key in the summary file, a
  rendering, and a validation rule according to their requirement
  (required, conditional, where applicable, optional); each conditional
  field is tested with its condition met.
- **Law.** Article 3(63) to (66), 53, 54, 101, 111 and 113 in the Official
  Journal text and the consolidated text of 27.7.2026, and Regulation (EU)
  2026/1744 for changes to these articles (none to Articles 53, 54, 101 and
  111(3); Article 113 point (b) unchanged; new SME definition in Article
  3(14a)). Dates and the open-source exemption as stated in
  `docs/legal-basis.md`. The SME threshold, the 3 % "large" rule, gap
  statements (point 33) and six-month updates (point 29) checked against the
  Explanatory Notice.
- **Parity.** The Python package against all shared vectors (YAML, hosts,
  Public Suffix List, ranking, crawl readers, cards, summaries, schema
  errors, inventories), including byte-identical Markdown and JSON.
- **Real data.** The YAML reader against the Hugging Face Hub's own parse of
  14 real dataset cards (identical); the Hub client live against
  huggingface.co (redirect from a legacy id, a gated dataset, a missing
  dataset); Parquet footers against pyarrow's metadata.
- **Quick start.** The README commands from a packed tarball in an empty
  directory, including `collect hf --online`.
- **Output.** HTML screenshots at desktop and phone width (no horizontal
  overflow, no CSP violations), and the print variant as a PDF.

### Found and fixed

| # | Finding | Fix |
|---|---|---|
| 1 | Pre-fill filled sub-fields (modalities, dataset lists) even when the provider had answered No to the section's question. | Pre-fill now leaves a section alone after a No and adds a hint about the conflict; test added. |
| 2 | Text from JSON input could contain unpaired UTF-16 surrogates, which break UTF-8 output and the YAML round trip. | New schema error `lone-surrogate` in both languages; vector added. |
| 3 | `validateSummary` accepted any `asOf` string from library callers. | Invalid dates now throw; tests added. |
| 4 | Crawl readers did not close their byte source when the consumer stopped early (an open file handle after a limit error). | Readers close the source in `finally`; test added. |
| 5 | Whitespace trimming, BOM handling and regular expression anchors differed between JavaScript and Python in edge cases (`$` before a trailing newline in Python, Unicode white space sets, a BOM per decoded line, NaN in CDXJ JSON). | Explicit character sets in both languages, `\Z` anchors in Python, BOM stripped once at the start, `parse_constant` rejects NaN/Infinity. |
| 6 | The Python reader built issue lists in a different order from TypeScript (dict evaluation order, JavaScript key order for numeric keys). | Same evaluation order; JavaScript key enumeration order emulated. |
| 7 | A gap statement for a required field of a new model was not covered by a test. | Test added. |
| 8 | Folded prose in the example was written with literal line breaks, which print ragged in HTML. | Example uses folded style for prose; print layout has margins on screen and an `h4` style. |
| 9 | The local card fallback name was "README.md". | The reference now includes the parent directory. |
| 10 | `render --allow-invalid` gave no sign that the output is a draft. | A notice on standard error. |
| 11 | The bundled Public Suffix List and one card fixture contained product names that the repository's publishing rules exclude. | The list is bundled unmodified but gzip-compressed (with a SHA-256 check on load); one sentence was removed from the fixture. |

## Pass 2: security and hostile input

### Checked

- Every input path for hostile data: YAML (anchors, aliases, tags, merge
  keys, complex keys, prototype keys, deep nesting, wide documents, long
  scalars, control and line-separator characters), JSON (deep nesting,
  `__proto__`), dataset cards (non-string values, overlong strings, hidden
  characters), CSV (quotes, line breaks, field and row limits, invalid
  UTF-8), WARC (missing or huge lengths, truncated blocks, huge headers),
  CDX/CDXJ, Parquet footers (encrypted, oversized lists, deep nesting,
  truncation, random bytes), URLs and hosts (IP forms, percent-encoding,
  ports, international names).
- Output: Markdown escaping of every provider text, HTML escaping and CSP,
  links only from validated http(s) URLs, workflow command escaping in the
  GitHub Action, terminal escapes in CLI messages.
- Files: no overwrite without `--force`, no writing through symbolic links,
  size caps on reads; the Action reads only regular files inside the
  workspace.
- Network: one allow-listed host, every redirect hop checked, timeouts, size
  caps while streaming, no cookies, credentials or environment proxies, ids
  and revisions validated before use.
- **Every security control was removed in turn and the test suite run, to
  confirm that a test fails.** TypeScript: 46 mutations, 44 detected; the 2
  others remove one of two redundant checks, and removing both is detected
  (see "Accepted"). Python: 22 mutations, all detected. Survivors of the
  first run were fixed as listed below.

### Found and fixed

| # | Finding | Fix |
|---|---|---|
| 1 | Removing the `isLink` check in the HTML renderer was not detected, because the schema already rejects bad links. | Test renders a summary object with a `javascript:` link set after parsing; no `href` is produced. |
| 2 | The Hub client checked redirect targets twice (after the redirect and at the top of the loop); removing either was not detected. | One check at the top of the loop, which applies to every hop; tested. |
| 3 | The line-length cap was only tested with lines that end in a line break; a line without one could have grown until the end of input. | Test with an endless line in small chunks (stops after a few chunks); an unreachable duplicate check removed. |
| 4 | Parquet tests accepted any `ParquetError`, so removing the list-size or depth limit fell through to a "truncated" error. | Tests check the specific codes `too-large` and `too-deep`. |
| 5 | The check of Action outputs could not be reached through inputs and was untested. | `writeOutputs` is tested directly with a value containing a line break and a bad name. |
| 6 | Removing the "only before 2 August 2025" rule for gap statements in required fields was not detected. | Test added (see pass 1, item 7). |
| 7 | Python: the line-length cap and the total WARC header cap were only tested with single long lines; removing the redirect limit made a test hang instead of fail. | Endless-line and many-headers tests; the fake Hub fails after 20 requests. |

### Accepted, documented

- The Action checks the workspace boundary twice (path and real path);
  removing one alone is not detected, removing both is.
- The Parquet decoder checks nesting in two places; removing both is
  detected.
- The Hub host is fixed (`huggingface.co`); DNS answers are not checked
  against private ranges, because the tool never fetches user-supplied
  hosts.
- CDX and CDXJ sizes are compressed record lengths; documented as a proxy.

## Independent review

A separate reviewer checked the code and the official sources without
relying on this record, the README or `docs/`.

### Checked

- **Sources.** The Commission page for the template (published 24 July
  2025, last updated 26 March 2026) still offers C(2025) 8311 final of
  5 December 2025; the downloaded PDF and Word files have the SHA-256 values
  recorded in `test/fixtures/official/README.md`. Every section, label, "If
  yes" condition, size range, the 3 % rule, the 10 % / 5 % / 1 000 rule,
  points 29 and 33 of the Explanatory Notice, and the rendered date formats
  (DD/MM/YY, MM/YYYY) were compared with the Annex and the Word template.
  Regulation (EU) 2026/1744 (OJ L, 24.7.2026) and the consolidated text
  02024R1689-20260727 were read on EUR-Lex: Articles 53, 54 and 101 are
  unchanged, Article 111(3) and Article 113, third paragraph, point (b) are
  unchanged, Article 3(14a) and (14b) are new. The claims in
  `docs/legal-basis.md` match.
- **Public Suffix List.** The current official `tests/test_psl.txt` (79
  active cases) passes with the bundled list.
- **Real files.** 46 Common Crawl WARC records fetched by byte range
  (CC-MAIN-2026-39): sizes per registrable domain equal an independent count
  with warcio; one real CDXJ index block (3 000 lines) equals an independent
  count (filtered, totals and the selected domains); three real Parquet files
  from the Hub equal pyarrow's metadata; the front matter of ten more real
  dataset cards equals PyYAML's parse; `collect hf --online` live (including
  a legacy id and a gated dataset). TypeScript and Python give the same
  domain lists on the real WARC and CDXJ files.
- **Hostile input.** Mutation fuzzing (20 000 rounds in TypeScript, 4 000 in
  Python) of WARC, CDX, CDXJ, CSV, Parquet footers, summary YAML and dataset
  cards produced only the documented error types and no slow cases; a 2 GB
  gzip bomb streams in bounded memory; YAML anchors, aliases, tags, merge
  keys, directives, several documents, prototype keys and deep or wide
  documents are refused in both languages.
- **Controls.** 35 security controls in TypeScript and 22 in Python were
  removed one at a time; each removal now makes a test fail (three did not
  before, see below).
- **Packaging.** A clean clone, `npm ci --ignore-scripts`, the steps of
  `release.yml`, `npm pack --dry-run --json` and `scripts/check-pack.mjs`;
  the README quick start from the packed tarball in an empty directory; the
  Python sdist and wheel contain the package code and the bundled data.
- **Hygiene.** All tracked files are free of raw control, bidirectional,
  zero-width and BOM characters; the AGPL text in `LICENSE` is identical to
  the FSF text; authors and committers are the configured user only.

### Findings

| # | Severity | Finding | Status |
|---|---|---|---|
| 1 | High | `.npmrc` sets `ignore-scripts=true`, so `prepack` never ran: `release.yml` would have published a package without `dist/` (14 files, no CLI, no library). | Fixed: CI and release run `npm run build`, then `scripts/check-pack.mjs` on `npm pack --dry-run --json`; a test checks the order of these steps. |
| 2 | Medium | Trimming with regular expressions such as `/[ \t]+$/` took quadratic time on long runs of blanks: 200 000 spaces in a YAML value took 29 s, a CSV crawl log about 3 s per line; Python was slower (50 000 spaces, 10 s). Reachable from summary files (also in the GitHub Action), dataset cards, CSV crawl logs and manifests. | Fixed: linear trimming (`src/util/trim.ts`, `str.strip` in Python); time-bounded tests in both languages fail on the old code. |
| 3 | Medium | The Markdown renderer (both languages) printed links without checking them, so a summary object built in code could produce a `javascript:` autolink or break out of `<...>`; the HTML renderer already checked. | Fixed: only `isLink` URLs become links; tests in both languages. |
| 4 | Low | `isLink` differed between the languages: TypeScript accepted U+0085 and Python U+FEFF in a link (their `\s` classes differ). | Fixed: one explicit character class, shared link vectors. |
| 5 | Low | Host labels with compatibility characters (fullwidth letters, ligatures) became their own `xn--` domain, which no browser visits (UTS #46 maps them to other letters). | Fixed: counted as `invalid_host` in both languages; shared host vectors. |
| 6 | Low | The Python Hub client's timeout applied per socket read, so a slow trickle could hold a request open far beyond `timeout`. | Fixed: a deadline for the whole request; test. |
| 7 | Low | Untested controls: the line limit when the line break is already buffered (TypeScript), anchors and tags inside flow collections (Python), the CSV row limit (Python). | Fixed: tests and shared YAML vectors. |
| 8 | Low | The hidden-character scan skipped dot files and files without an extension (`.npmrc`, `LICENSE`, `NOTICE`). | Fixed. |
| 9 | Low | The documentation did not say that the Section 2.3 domain list is for the provider's own crawls; the template puts Common Crawl snapshots in Section 2.1. | Fixed in README and `docs/domain-ranking.md`. |
| 10 | Low | The action's `actions/setup-node` step changes the Node.js version for later steps of the caller's job; not documented. | Fixed in README. |
| 11 | Low | When a Summary covers several models and only one was placed on the market before 2 August 2025, gap statements are accepted for the whole Summary. Point 33 ties gaps to such models; a shared Summary must have identical content (point 30), so the effect is small. | Open. |
| 12 | Info | `sourcebook <command> --help` answers "Unknown option"; only `sourcebook --help` works. | Open. |
| 13 | Info | The Python sdist contains the tests, which need the repository's shared vectors and do not run from the sdist alone. | Open. |
| 14 | Info | The action installs its development dependencies from the npm registry at run time (pinned by the lockfile). | Open, documented. |

### Not verified

- The TypeScript Hub client's total timeout against a real slow server (it
  relies on `fetch` aborting the body stream with the signal).
- GitHub-hosted runs of CI, CodeQL, the release workflow and the action
  (nothing was pushed).

### Result

`npm run check`: 10 test files, 280 tests pass. Python: 40 tests pass.

## Coordinator review (8 Nov 2026)

| # | Severity | Finding | Status |
|---|---|---|---|
| C1 | Medium | Independent review item 11 (left open): gap statements were accepted for the whole summary if any covered model was placed on the market before 2 August 2025. Notice point 33 allows gaps only for such models, so a summary that also covers a later or not yet placed model may not use them. | Fixed in TypeScript and Python: every listed model must have a placement date before 2 August 2025. New unit assertions and a shared vector (`mixed-placement-with-gaps`). |

Otherwise accepted as reviewed: the gzip-compressed, unmodified Public Suffix List; the interpretation choices recorded in every domain report; `npm run check` (281 tests) and the Python suite pass.
