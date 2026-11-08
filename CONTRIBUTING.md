# Contributing

Thank you for helping. Sourcebook produces documents that providers publish
to meet a legal obligation, and it reads files from untrusted sources, so
correctness and security come first.

## Before you start

- Open an issue to discuss larger changes.
- Pull requests require the [Contributor Licence Agreement](CLA.md). Add the
  signature line from CLA.md to your first pull request.
- Follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Development

```sh
npm ci
npm run check        # typecheck + lint + tests with coverage
npm run build        # library, CLI and GitHub Action into dist/
```

Python package:

```sh
cd python
python3 -m venv .venv
.venv/bin/pip install .
cd tests && ../.venv/bin/python -I -m unittest discover -s .
```

## Rules

- TypeScript strict mode, no `any`, no `@ts-ignore`; `eslint-disable` only
  with a written reason.
- No runtime dependencies, in TypeScript or Python.
- The template is data (`src/spec/template.ts`). Labels, instructions and
  section texts are copied verbatim from the official template; the tests
  compare them with `test/fixtures/official/`. If the Commission publishes a
  new version of the template, update the text, the fixtures, the citation
  and the format version together.
- The TypeScript package is the reference. Every change to parsing,
  validation, ranking or Markdown output must be made in both languages and
  pass the shared vectors. If results change on purpose, regenerate them
  with `npm run build && node scripts/generate-vectors.mjs` (and
  `node scripts/export-spec.mjs` after changes to the template data) and
  explain the diff in the pull request.
- Every security control needs a test that fails when the control is
  removed.
- Cite the article of Regulation (EU) 2024/1689 or the point of the
  Explanatory Notice for anything that implements the law, quoting the
  official text. Do not rely on secondary sources for what the law says.
- Where the template leaves a point open, add an option and document the
  default in `docs/`; do not decide silently.
- Keep the attribution "Sourcebook by AFKzona Group" in interfaces and
  generated summaries (LICENSE-ADDITIONAL-TERMS.md).
- Never put real crawl logs or private dataset details in issues, tests or
  fixtures.
- Update CHANGELOG.md.
