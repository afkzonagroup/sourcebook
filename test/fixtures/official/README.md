# Official template text (test fixture)

Plain-text copies of the template for the public summary of training
content, used by `test/template.test.ts` to check that every label,
instruction and section text in `src/spec/template.ts` is copied verbatim.

- `template-word-en.txt`: text of "2 - Template for the Public Summary of
  Training Content for General-Purpose AI models - English (DOC)", converted
  with macOS `textutil`. SHA-256 of the downloaded file:
  `ec803008a5263a485146b24497a3445e2ea32f8b73f818e67652ad70de40f09b`.
- `annex-pdf-en.txt`: the Annex of "1 - Explanatory Notice and Template for
  the Public Summary of Training Content for general-purpose AI models -
  English (PDF)", Communication C(2025) 8311 final of 5 December 2025,
  converted with `pdftotext -layout`; the cover page is kept and the
  explanatory part is cut ("[...]"). SHA-256 of the downloaded file:
  `be6cdf10131c3fd9eb9265e592b23609fd7df2d2c9692517017f739188d408be`.

Source: https://digital-strategy.ec.europa.eu/en/library/explanatory-notice-and-template-public-summary-training-content-general-purpose-ai-models
(downloaded 8 November 2026).

Changes: line separators, form feeds and no-break spaces were replaced by
line breaks and spaces, tabs by two spaces, and trailing spaces were removed.
The words are unchanged.

© European Union. Reused under the Creative Commons Attribution 4.0
International licence (CC BY 4.0), in line with the Commission's reuse
policy (Commission Decision 2011/833/EU).
