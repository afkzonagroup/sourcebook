# Changelog

All notable changes to this project are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-11-08

### Added

- The AI Office template for the public summary of training content (Annex
  to Communication C(2025) 8311 final) as data, with verbatim labels,
  instructions and section texts, checked against the official text.
- Summary file format version 1 (YAML or JSON) that mirrors the template
  field by field, with JSON Schemas for editors.
- A strict, safe YAML 1.2 subset reader (no anchors, aliases, tags or merge
  keys; size, depth and count limits).
- Validation of every field the template requires, consistency checks,
  information gaps for models placed on the market before 2 August 2025,
  six-month update warnings, and cross-checks against collected inventories.
- Collectors: Hugging Face dataset cards (local, or from the Hub API on
  request), JSON and CSV manifests, Parquet footers, and crawl logs (WARC,
  CDX, CDXJ, CSV) with domain ranking by registrable domain (bundled Public
  Suffix List) for Section 2.3, including the SME threshold.
- The "large dataset" rule of Section 2.1 and pre-fill of a summary from an
  inventory, without writing narrative answers.
- Output as Markdown, self-contained HTML (screen and A4 print), JSON and a
  Hugging Face model card section.
- `sourcebook` command line tool (init, collect, validate, render).
- GitHub Action that validates the summary file of a model repository.
- Python package `sourcebook` with the same schema, validation, Markdown and
  JSON output, collectors and domain ranking, passing the shared vectors.

[Unreleased]: https://github.com/afkzonagroup/sourcebook/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/afkzonagroup/sourcebook/releases/tag/v0.1.0
